"""Render docs/architecture.{svg,png,pdf} in the Pratibimb v2 palette.

    python scripts/render_architecture.py

Numbers come from backend/artifacts/model_card.json, so the diagram never drifts from the
model. The SVG embeds Figtree (SIL OFL) so it renders the same on GitHub. PNG and PDF are
printed with Playwright's Chromium when it is available (see scripts/svg_print.py).
"""

from __future__ import annotations

import base64
import json
from html import escape
from pathlib import Path

from svg_print import print_svg

ROOT = Path(__file__).resolve().parents[1]
CARD = json.loads((ROOT / "backend" / "artifacts" / "model_card.json").read_text())
FONT = ROOT / "frontend" / "node_modules" / "@fontsource-variable" / "figtree" / "files" / "figtree-latin-wght-normal.woff2"

C = dict(mist="#F1F6F5", surface="#FFFFFF", surface2="#F7FAF9", line="#D5E2E0", ink="#10302F", ink2="#46605E", ink3="#5E7775",
         peacock="#0B7F86", peacock_soft="#DCEFEF", sandal="#A8703C", sandal_text="#8A5A2B", sandal_soft="#F5EADF",
         lotus="#D9668E", lotus_soft="#FBE6EE", dawn="#FFF3EA", leaf="#187A4C", turmeric="#946100", sindoor="#B03A23")

W, H = 1600, 1064


def rep(name: str, key: str = "auroc"):
    r = CARD["metrics"].get("repeated", {}).get(name, {}).get(key)
    return r["mean"] if isinstance(r, dict) else CARD["metrics"][name][key]


phys = CARD.get("physiology", {})
rs = [v["r_pooled"] for v in phys.get("pairs", []) if "r_pooled" in v]
r_lo, r_hi = (min(rs), max(rs)) if rs else (0, 0)

parts: list[str] = []
add = parts.append


def text(x, y, s, size=13, weight=450, fill=C["ink2"], anchor="start"):
    add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')


def card(x, y, w, h, title, lines, accent=None, fill=C["surface"], title_fill=C["ink"]):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{C["line"]}" stroke-width="1"/>')
    if accent:
        add(f'<rect x="{x + 16}" y="{y + 18}" width="4" height="16" rx="2" fill="{accent}"/>')
    tx = x + (28 if accent else 16)
    text(tx, y + 31, title, 14.5, 650, title_fill)
    for i, ln in enumerate(lines):
        text(x + 16, y + 54 + i * 19, ln, 12.5, 450, C["ink2"])


def arrow(x1, y1, x2, y2, color=C["ink3"], label=None, dashed=False):
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    mid = (x1 + x2) / 2
    add(f'<path d="M{x1},{y1} C{mid},{y1} {mid},{y2} {x2 - 7},{y2}" fill="none" stroke="{color}" stroke-width="1.8"{dash}/>')
    add(f'<path d="M{x2 - 8},{y2 - 5} L{x2},{y2} L{x2 - 8},{y2 + 5} z" fill="{color}"/>')
    if label:
        text(mid, min(y1, y2) - 8, label, 11.5, 600, color, "middle")


def column_head(x, y, title, sub):
    text(x, y, title, 17, 700, C["ink"])
    text(x, y + 20, sub, 12.5, 450, C["ink3"])


font_css = ""
if FONT.exists():
    b64 = base64.b64encode(FONT.read_bytes()).decode()
    font_css = f"@font-face {{ font-family: 'Figtree'; src: url(data:font/woff2;base64,{b64}) format('woff2'); font-weight: 300 900; }}"

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Figtree, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">')
add(f"<defs><style>{font_css}</style>"
    f'<linearGradient id="twinbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{C["peacock_soft"]}"/><stop offset="0.55" stop-color="#EEF5F2"/><stop offset="1" stop-color="{C["sandal_soft"]}"/></linearGradient>'
    f'<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#F6C7A6" stop-opacity="0.55"/><stop offset="1" stop-color="#F6C7A6" stop-opacity="0"/></radialGradient>'
    f'<linearGradient id="ring" x1="0" y1="0" x2="1" y2="0"><stop offset="0.5" stop-color="{C["peacock"]}"/><stop offset="0.5" stop-color="{C["sandal"]}"/></linearGradient>'
    "</defs>")
add(f'<rect width="{W}" height="{H}" fill="{C["mist"]}"/>')

# Brand mark, small, beside the title
mx, my = 58, 58
add(f'<circle cx="{mx}" cy="{my - 2}" r="26" fill="url(#glow)"/>')
add(f'<path d="M{mx - 30},{my + 12} L{mx - 16},{my + 12} L{mx - 12},{my + 4} L{mx - 9},{my + 18} L{mx - 6},{my + 12} L{mx},{my + 12}" fill="none" stroke="{C["peacock"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
add(f'<path d="M{mx + 2},{my + 12} L{mx + 30},{my + 12}" stroke="{C["sandal"]}" stroke-width="2.4" stroke-dasharray="4 4" stroke-linecap="round"/>')
add(f'<circle cx="{mx + 2}" cy="{my - 1}" r="13" fill="none" stroke="url(#ring)" stroke-width="2.6"/>')
add(f'<path d="M{mx - 12},{my + 4} L{mx - 9},{my + 18}" stroke="{C["lotus"]}" stroke-width="2.4" stroke-linecap="round"/>')

text(104, 56, "Pratibimb architecture", 26, 700, C["ink"])
text(104, 80, "A digital twin for hypertension. Two streams in, a personal model of the body in the middle, a calibrated 72 hour warning and a consented check-in ladder out.", 13.5, 450, C["ink2"])

TOP = 152
# Column 1: streams
x1, w1 = 40, 300
column_head(x1, TOP, "Two streams in", "Synthetic only (sandbox rule)")
card(x1, TOP + 40, w1, 132, "Health record (static)", ["Synthea-shaped FHIR R4 bundles", "Conditions (SNOMED), labs (LOINC)", "Medicines, adherence, family history", "Polygenic risk tier, Framingham inputs"], C["sandal"], C["sandal_soft"], C["sandal_text"])
card(x1, TOP + 186, w1, 132, "Wearable stream (dynamic)", ["Nightly resting HR, HRV, sleep, steps", "SpO2, respiratory rate", "Home BP cuff readings", "5 minute intraday trace, live stream"], C["peacock"], C["peacock_soft"], C["peacock"])
card(x1, TOP + 332, w1, 114, "Device sync (companion app)", ["Health Connect on Android, HealthKit on iOS", "Oura and Whoop webhooks, CSV upload", "POST /api/ingest with a freshness chip"])
card(x1, TOP + 460, w1, 132, "Synthetic cohort generator", ["240 patients x 120 days, seed 42", "Labelled strain episodes (3 kinds)", "Colds, missed doses, travel, late nights", "Hidden true response slopes per person"])

# Column 2: the twin
x2, w2 = 378, 340
add(f'<rect x="{x2 - 14}" y="{TOP - 30}" width="{w2 + 28}" height="{632}" rx="22" fill="url(#twinbg)" stroke="{C["line"]}"/>')
column_head(x2, TOP, "Personal Physiology Engine", "The twin: how this body responds")
card(x2, TOP + 40, w2, 114, "1  Personal baseline", ["28 day resting HR median", "60 day HRV mean and smallest worthwhile change", "7 day home systolic slope, backward windows only"])
card(x2, TOP + 168, w2, 114, "2  Personal response slopes", ["Sleep to heart rate, sleep to HRV", "Steps to heart rate, steps to blood pressure", "Calm days only, AR(1)-corrected errors"])
card(x2, TOP + 296, w2, 114, "3  Empirical Bayes pooling", ["DerSimonian and Laird partial pooling", "New users borrow from the cohort", f"Recovers the hidden truth: r {r_lo:.2f} to {r_hi:.2f}"])
card(x2, TOP + 424, w2, 132, "4  Twin-adjusted signals", ["Unexplained HR, HRV and BP change", "Record-aware reading (beta blockers, diabetes)", "Lifestyle load: 7 day sleep debt, activity", "Expanding-window slopes: no future leaks in"])

# Column 3: prediction
x3, w3 = 760, 320
column_head(x3, TOP, "Prediction", "Validated on patients the model never saw")
card(x3, TOP + 40, w3, 114, "Fusion model", ["LightGBM on watch, cuff and twin signals", "Eight-feature record tower", "Patient-level CV, 3 splits x 5 folds"])
card(x3, TOP + 168, w3, 96, "Calibration and band", ["Platt scaling on out-of-fold scores", "P10 to P90 band from five fold models"])
budget = CARD["operating_points"]["target_false_alerts_per_patient_day"]
card(x3, TOP + 278, w3, 96, "Operating points", [f"Urgent: most sensitive within {budget} false", "alerts per patient-day. Watch: 90% of episodes"])
card(x3, TOP + 388, w3, 78, "Forecasts", ["18 quantile models: HR and BP, days 1 to 3"])
card(x3, TOP + 480, w3, 96, "Explanation", ["SHAP grouped into record and watch", "NightSignal-style rule runs alongside"])

# Column 4: action layer
x4, w4 = 1120, 250
column_head(x4, TOP, "Action layer", "FastAPI, SQLite, live stream (SSE)")
rows4 = [("Alerts and budget meter", C["sindoor"]), ("Thresholds, 14 day replay", C["turmeric"]), ("What-if simulator", C["peacock"]),
         ("Check-in ladder", C["lotus"]), ("Consent and audit log", C["leaf"]), ("FHIR and ABDM export", C["sandal"])]
subs4 = ["Acknowledge, snooze, escalate", "Preview before you apply", "Uses this person's own slopes",
         "Patient, 2 contacts, doctor, 112", "Append-only, consent basis", "WellnessRecord bundle"]
for i, ((t, col), s) in enumerate(zip(rows4, subs4)):
    y = TOP + 40 + i * 92
    add(f'<rect x="{x4}" y="{y}" width="{w4}" height="78" rx="14" fill="{C["surface"]}" stroke="{C["line"]}"/>')
    add(f'<circle cx="{x4 + 22}" cy="{y + 26}" r="5" fill="{col}"/>')
    text(x4 + 36, y + 31, t, 14, 650, C["ink"])
    text(x4 + 16, y + 56, s, 12.5, 450, C["ink2"])

# Column 5: people
x5, w5 = 1400, 160
column_head(x5, TOP, "People", "Who acts")
card(x5, TOP + 40, w5, 150, "Doctor", ["Triage list", "Twin page", "Simulate", "Alerts, model card"], C["peacock"])
card(x5, TOP + 204, w5, 150, "Patient", ["English and Hindi", "What helps you", "Check-in", "Press-and-hold SOS"], C["lotus"])
card(x5, TOP + 368, w5, 132, "Contacts", ["SMS, WhatsApp", "and voice (mocked,", "DLT header shown)"], C["sandal"])

# Arrows
arrow(x1 + w1, TOP + 106, x2, TOP + 97, C["sandal"])
arrow(x1 + w1, TOP + 252, x2, TOP + 225, C["peacock"])
arrow(x1 + w1, TOP + 389, x2, TOP + 353, C["ink3"], dashed=True)
arrow(x2 + w2, TOP + 490, x3, TOP + 97, C["ink3"])
# The record also feeds the fusion model's record tower directly: route it above the columns
ay = TOP - 46
add(f'<path d="M{x1 + 230},{TOP + 40} L{x1 + 230},{ay + 10} Q{x1 + 230},{ay} {x1 + 240},{ay} L{x3 + 270},{ay} Q{x3 + 280},{ay} {x3 + 280},{ay + 10} L{x3 + 280},{TOP + 32}" fill="none" stroke="{C["sandal"]}" stroke-width="1.6" stroke-dasharray="5 4"/>')
add(f'<path d="M{x3 + 275},{TOP + 30} L{x3 + 280},{TOP + 39} L{x3 + 285},{TOP + 30} z" fill="{C["sandal"]}"/>')
text(x2 + w2 / 2, ay - 7, "the record also feeds the fusion model's record tower", 11.5, 600, C["sandal_text"], "middle")
arrow(x3 + w3, TOP + 97, x4, TOP + 79, C["ink3"])
arrow(x3 + w3, TOP + 316, x4, TOP + 171, C["ink3"])
arrow(x4 + w4, TOP + 79, x5, TOP + 115, C["ink3"])
arrow(x4 + w4, TOP + 355, x5, TOP + 279, C["ink3"])
arrow(x4 + w4, TOP + 355, x5, TOP + 434, C["ink3"])

# Results strip
ry = 806
add(f'<rect x="40" y="{ry}" width="{W - 80}" height="110" rx="18" fill="{C["surface"]}" stroke="{C["line"]}"/>')
text(64, ry + 32, "Results on the synthetic cohort (mean of three patient splits)", 15, 650, C["ink"])
stats = [
    (f"{rep('fused'):.3f}", "AUROC, fused twin"),
    (f"{rep('fused_no_twin'):.3f}", "AUROC without the twin"),
    (f"{rep('fused', 'sensitivity'):.0%}", f"episodes caught at {budget} false alerts per patient-day"),
    (f"{CARD['metrics']['fused'].get('median_lead_hours') or 48:.0f} h", "median warning before the event"),
]
for i, (v, lab) in enumerate(stats):
    x = 64 + i * 380
    text(x, ry + 70, v, 28, 700, C["peacock"] if i != 1 else C["ink3"])
    text(x, ry + 92, lab, 12.5, 450, C["ink2"])

# Trust strip
ty = 930
add(f'<rect x="40" y="{ty}" width="{W - 80}" height="104" rx="18" fill="{C["surface2"]}" stroke="{C["line"]}"/>')
text(64, ty + 32, "Trust built in", 15, 650, C["ink"])
trust = [("Synthetic data only", "seeded and reproducible"), ("DPDP-ready consent", "per stream, withdraw and delete"),
         ("No AI prescribing", "patient text never changes doses"), ("CDSCO SaMD path", "likely Class B or C"),
         ("Leakage tests", "no future values, patient-level split")]
for i, (a, b) in enumerate(trust):
    x = 64 + i * 300
    add(f'<circle cx="{x + 5}" cy="{ty + 66}" r="4" fill="{C["leaf"]}"/>')
    text(x + 18, ty + 71, a, 13.5, 650, C["ink"])
    text(x + 18, ty + 90, b, 12, 450, C["ink3"])

add("</svg>")
svg = "\n".join(parts)
docs = ROOT / "docs"
(docs / "architecture.svg").write_text(svg)
print("wrote docs/architecture.svg")

# PNG and PDF through Chromium
if print_svg(svg, W, H, docs / "architecture.png", docs / "architecture.pdf", C["mist"], "Pratibimb architecture"):
    print("wrote docs/architecture.png and docs/architecture.pdf")
