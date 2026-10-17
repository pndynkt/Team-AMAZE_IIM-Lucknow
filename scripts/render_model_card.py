"""Render docs/MODEL_CARD.md from backend/artifacts/model_card.json so the numbers in the
documentation always match the trained artifacts.

    python scripts/render_model_card.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARD = ROOT / "backend" / "artifacts" / "model_card.json"
LEAK = ROOT / "backend" / "artifacts" / "leakage_tests.json"
OUT = ROOT / "docs" / "MODEL_CARD.md"


def pct(x):
    return "n/a" if x is None else f"{100 * x:.1f}%"


def num(x, nd=3):
    return "n/a" if x is None else f"{x:.{nd}f}"


def main() -> None:
    card = json.loads(CARD.read_text())
    leak = json.loads(LEAK.read_text()) if LEAK.exists() else {"passed": None, "tests": []}
    m = card["metrics"]
    rows = [("Fused (wearable + home BP cuff + EHR + twin)", m["fused"]), ("Fused without the twin", m["fused_no_twin"]), ("Watch + home BP cuff", m["wearable_only"]),
            ("Watch only (no cuff)", m["watch_only"]), ("EHR only", m["ehr_only"]), ("Rule only (NightSignal-style)", m["rule_only"])]
    if m.get("ceiling_wearable_plus_oracle_prior"):
        rows.append(("Ceiling: watch + cuff + oracle static prior", m["ceiling_wearable_plus_oracle_prior"]))
    lines = []
    lines.append(f"# Model card: {card['name']}\n")
    lines.append(f"Version `{card['version']}`, trained {card['trained_at'][:19]} UTC. Rendered from `backend/artifacts/model_card.json`; do not edit by hand.\n")
    lines.append("## Task\n")
    lines.append(f"{card['task']}. Condition: {card['condition']}.\n")
    lines.append("## Algorithm\n")
    lines.append(card["algorithm"] + "\n")
    d = card["data"]
    lines.append("## Data\n")
    lines.append(f"- Cohort: {d['cohort']} synthetic patients, {d['patient_days']:,} patient-days, {d['events']} strain episodes ({d['positive_days']:,} positive days, {pct(d['event_rate_days'])} of days)")
    lines.append(f"- Split: {d['split']}")
    lines.append(f"- Generator seed: {d['generator_seed']}; synthetic: {d['synthetic']}")
    lines.append(f"- Confounders injected: " + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in d["confounders"].items()))
    for s in d["sources"]:
        lines.append(f"- Source: {s}")
    lines.append("")
    rep = m.get("repeated")
    if rep:
        lines.append("## Headline metrics (mean of three patient splits)\n")
        lines.append("Each split is a fresh patient-level 5-fold cross-validation (seeds " + ", ".join(str(x) for x in rep["fused"]["seeds"]) + "). Range in brackets is the lowest and highest split.\n")
        lines.append("| Model | AUROC | AUPRC | Sensitivity at the budget | Sensitivity with 48 h lead |")
        lines.append("|---|---|---|---|---|")
        for name, label in [("fused", "Fused + twin"), ("fused_no_twin", "Fused without the twin"), ("wearable_only", "Watch + home BP cuff"),
                            ("watch_only", "Watch only"), ("ehr_only", "EHR only")]:
            r = rep[name]
            def cell(key, f):
                v = r.get(key)
                if not v:
                    return "n/a"
                fmt = (lambda x: pct(x)) if f == "pct" else (lambda x: num(x))
                return f"{fmt(v['mean'])} ({fmt(v['min'])} to {fmt(v['max'])})"
            lines.append(f"| {label} | {cell('auroc', 'num')} | {cell('auprc', 'num')} | {cell('sensitivity', 'pct')} | {cell('sensitivity_48h_lead', 'pct')} |")
        lines.append("")
        lines.append(f"Twin beats no twin on AUROC in {rep['twin_beats_no_twin_auroc']} splits; fused beats watch + cuff in {rep['fused_beats_wearable_auroc']}.\n")
    lines.append("## Metrics, primary split (pooled out-of-fold)\n")
    lines.append("| Model | AUROC | AUPRC | Brier | Sensitivity (events) | Sensitivity with 48 h lead | Specificity (days) | False alerts / patient-day | Median lead |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for name, r in rows:
        lead = f"{r['median_lead_hours']:.0f} h" if r.get("median_lead_hours") else "n/a"
        lines.append(f"| {name} | {num(r.get('auroc'))} | {num(r.get('auprc'))} | {num(r.get('brier'), 4)} | {pct(r.get('sensitivity'))} | {pct(r.get('sensitivity_48h_lead'))} | {pct(r.get('specificity'))} | {num(r.get('false_alerts_per_patient_day'), 4)} | {lead} |")
    lines.append("")
    op = card["operating_points"]
    lines.append(f"Operating points: watch at calibrated p = {op['p_watch']:.3f}, urgent at p = {op['p_urgent']:.3f}; urgent is the most sensitive point within {op['target_false_alerts_per_patient_day']} false alerts per patient-day. Score mapping: {op['score_mapping']}.\n")
    wp = m["fused"].get("watch_point", {})
    if wp:
        lines.append(f"Watch tier: {pct(wp.get('sensitivity'))} of events at {num(wp.get('false_alerts_per_patient_day'), 4)} false alerts per patient-day.\n")
    lines.append("## What fusion buys\n")
    lines.append(card["ablation_note"] + "\n")
    if card.get("ceiling_note"):
        lines.append(card["ceiling_note"] + "\n")
    if card.get("twin_note"):
        lines.append("## What the twin buys\n")
        lines.append(card["twin_note"] + "\n")
    ph = card.get("physiology") or {}
    if ph.get("pairs"):
        lines.append("## Personal Physiology Engine: recovery of each person's true response\n")
        lines.append(f"Method: {ph.get('method')}. The generator plants a true response slope in every patient; the table compares the twin's estimate with that hidden truth (leave-one-out cohort mean).\n")
        lines.append("| Response | Unit | Correlation with truth (twin) | Correlation (raw per-person fit) | MAE twin | MAE raw | MAE population average | 80% interval coverage |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for pr in ph["pairs"]:
            lines.append(f"| {pr['label']} | {pr['unit']} | {pr['r_pooled']:.3f} | {pr['r_raw']:.3f} | {pr['mae_pooled']:.3f} | {pr['mae_raw']:.3f} | {pr['mae_population']:.3f} | {pct(pr['coverage_80'])} |")
        lines.append("")
        if ph.get("note"):
            lines.append(ph["note"] + "\n")
    lines.append("## Forecasts (quantile models, held-out fold)\n")
    lines.append("| Target | Horizon | MAE (P50) | Persistence MAE | P10 to P90 coverage |")
    lines.append("|---|---|---|---|---|")
    for k, v in card["forecast"].items():
        if not isinstance(v, dict):
            continue
        t, h = k.split("_h")
        lines.append(f"| {'Overnight RHR (bpm)' if t == 'rhr' else 'Morning SBP (mmHg)'} | day {h} | {v['mae']} | {v.get('persistence_mae', 'n/a')} | {pct(v['coverage_p10_p90'])} |")
    lines.append("")
    lines.append("## Calibration\n")
    lines.append(f"Method: {card['calibration']['method']}.\n")
    lines.append("| Mean predicted | Observed | n |\n|---|---|---|")
    for b in card["calibration"]["bins"]:
        lines.append(f"| {b['p_mean']:.4f} | {b['obs']:.4f} | {b['n']} |")
    lines.append("")
    lines.append("## Feature importance (gain, top 15)\n")
    lines.append("| Feature | Stream | Share |\n|---|---|---|")
    for f in card["features"][:15]:
        lines.append(f"| `{f['name']}` | {f['group']} | {pct(f['importance'])} |")
    lines.append("")
    lines.append("## Leakage tests\n")
    lines.append(f"Passed: {leak.get('passed')}. Run `make test`.\n")
    for t in leak.get("tests", []):
        if isinstance(t, dict):
            lines.append(f"- `{t['name']}`: {'pass' if t['passed'] else 'FAIL'} ({t['at']})")
    lines.append("")
    lines.append("## Published anchors (for context, not comparison)\n")
    for a in card["published_anchors"]:
        parts = [f"{k}: {v}" for k, v in a.items() if k != "name"]
        lines.append(f"- {a['name']}: " + "; ".join(parts))
    lines.append("")
    lines.append("## Limitations\n")
    for l in card["limitations"]:
        lines.append(f"- {l}")
    lines.append("")
    lines.append("## Regulatory status\n")
    for k, v in card["regulatory"].items():
        lines.append(f"- {k.upper()}: {v}")
    lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
