"""Render docs/algorithm.{svg,png,pdf}: the five steps of the twin, worked on one patient.

    python scripts/render_algorithm.py            # Meera Iyer (P-0007), the demo patient

Every number is computed here from the trained artifacts and the synthetic cohort, so the
picture always matches the model. See docs/ALGORITHM.md for the same steps in words.
"""

from __future__ import annotations

import base64
import json
import sys
from html import escape
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from svg_print import print_svg  # noqa: E402
from twin.engine.cohort import Cohort  # noqa: E402
from twin.models import physiology as PH  # noqa: E402

PID = sys.argv[1] if len(sys.argv) > 1 else "P-0007"
CARD = json.loads((ROOT / "backend" / "artifacts" / "model_card.json").read_text())
FONT = ROOT / "frontend" / "node_modules" / "@fontsource-variable" / "figtree" / "files" / "figtree-latin-wght-normal.woff2"
C = dict(mist="#F1F6F5", surface="#FFFFFF", surface2="#F7FAF9", line="#D5E2E0", band="#DDE8E6", ink="#10302F", ink2="#46605E",
         ink3="#5A7371", peacock="#0B7F86", peacock_soft="#DCEFEF", sandal="#A8703C", sandal_text="#8A5A2B", sandal_soft="#F5EADF",
         lotus="#D9668E", lotus_text="#B23F69", lotus_soft="#FBE6EE", leaf="#187A4C", turmeric="#946100", sindoor="#B03A23")
W, H = 1600, 876

# ---------------------------------------------------------------- numbers from the model
cohort = Cohort()
sp = cohort.scored(PID)
f = sp.feat.sort_values("date").reset_index(drop=True)
row = f.iloc[-1]
cur = cohort.current(PID)
first = str(cohort.ehr.loc[PID, "first_name"])
dm = PH.design_frame(f)
raw = PH.personal_ols(dm)
pri = cohort.phys_priors
ta = PH.twin_adjusted(f, pri)
calm_days = int((dm["calm"] & (dm["y_rhr"].notna() | dm["y_sbp"].notna())).sum())

est, se = raw["sleep_rhr"]
mu, tau = pri.mu["sleep_rhr"], float(np.sqrt(pri.tau2["sleep_rhr"]))
w_own = tau ** 2 / (tau ** 2 + se ** 2)
pooled = PH.shrink(est, se, mu, pri.tau2["sleep_rhr"])[0]

usual_hr, tonight_hr, dev_hr = float(row["rhr_base28"]), float(row["rhr"]), float(row["rhr_dev"])
x_sleep, x_steps = float(dm["x_sleep"].iloc[-1]), float(dm["x_steps"].iloc[-1])
s_sleep, s_steps = float(ta["slope_sleep_rhr"].iloc[-1]), float(ta["slope_steps_rhr"].iloc[-1])
explained = s_sleep * x_sleep + s_steps * x_steps
unexpl_hr = float(ta["rhr_unexpl"].iloc[-1])
unexpl_bp = float(ta["sbp_unexpl"].iloc[-1])
sd28 = float(row["rhr_sd28"]) if "rhr_sd28" in row and np.isfinite(row["rhr_sd28"]) else 3.0

p, (p_lo, p_hi), score, tier = cur["probability_72h"], cur["probability_band"], cur["risk_score"], cur["tier"]
usual_p = float(np.median(f["p"].tail(60)))
reasons = cohort.explain_for(PID)["contributors"][:3]
op = CARD["operating_points"]
rep = CARD["metrics"]["repeated"]
pairs = CARD["physiology"]["pairs"]
r_lo, r_hi = min(x["r_pooled"] for x in pairs), max(x["r_pooled"] for x in pairs)
slopes = {k: PH.shrink(*(raw[k] or (None, None)), pri.mu[k], pri.tau2[k])[0] for k in PH.PAIRS}

# ---------------------------------------------------------------- drawing helpers
parts: list[str] = []
add = parts.append


def text(x, y, s, size=13, weight=450, fill=C["ink2"], anchor="start"):
    add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')


def lines(x, y, rows, size=13, gap=19, fill=C["ink2"], weight=450):
    for i, r in enumerate(rows):
        text(x, y + i * gap, r, size, weight, fill)


def arrow(x1, x2, y):
    add(f'<path d="M{x1},{y} L{x2 - 8},{y}" stroke="{C["ink3"]}" stroke-width="1.8"/>')
    add(f'<path d="M{x2 - 9},{y - 5} L{x2},{y} L{x2 - 9},{y + 5} z" fill="{C["ink3"]}"/>')


def signed(v, nd=1):
    return f"{'+' if v > 0 else ''}{v:.{nd}f}"


font_css = ""
if FONT.exists():
    font_css = f"@font-face {{ font-family: 'Figtree'; src: url(data:font/woff2;base64,{base64.b64encode(FONT.read_bytes()).decode()}) format('woff2'); font-weight: 300 900; }}"
add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Figtree, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">')
add(f"<defs><style>{font_css}</style></defs>")
add(f'<rect width="{W}" height="{H}" fill="{C["mist"]}"/>')

text(50, 62, "How the twin decides, step by step", 28, 700, C["ink"])
text(50, 90, f"Worked on {first} Iyer ({PID}) on {row['date']:%d %B %Y}. Every number below is computed by the trained model on the synthetic cohort.", 14, 450, C["ink2"])

CW, GAP, X0, Y0, CH = 282, 22, 50, 130, 520
xs = [X0 + i * (CW + GAP) for i in range(5)]
titles = ["Her usual", "How her body responds", "Borrow from the cohort", "Explained or not?", "Fuse, calibrate, decide"]
subs = ["Personal baseline", "Personal response slopes", "Empirical Bayes pooling", "Twin-adjusted signal", "Calibrated early warning"]
for i, x in enumerate(xs):
    add(f'<rect x="{x}" y="{Y0}" width="{CW}" height="{CH}" rx="18" fill="{C["surface"]}" stroke="{C["line"]}"/>')
    add(f'<circle cx="{x + 34}" cy="{Y0 + 38}" r="15" fill="{C["peacock_soft"]}"/>')
    text(x + 34, Y0 + 43, str(i + 1), 14, 700, C["peacock"], "middle")
    text(x + 60, Y0 + 36, titles[i], 16.5, 700, C["ink"])
    text(x + 60, Y0 + 55, subs[i], 12.5, 500, C["ink3"])
    if i < 4:
        arrow(x + CW + 3, xs[i + 1] - 3, Y0 + 38)

# Step 1: personal baseline. A number line with her usual band and tonight's value.
x = xs[0] + 22
lines(x, Y0 + 92, ["Tonight is compared with her own", "last 28 nights, not with other people."])
lo_v, hi_v = 50, 75
sx = lambda v: x + (v - lo_v) / (hi_v - lo_v) * (CW - 44)  # noqa: E731
yl = Y0 + 190
add(f'<rect x="{sx(usual_hr - sd28):.1f}" y="{yl - 14}" width="{sx(usual_hr + sd28) - sx(usual_hr - sd28):.1f}" height="28" rx="6" fill="{C["band"]}"/>')
add(f'<line x1="{sx(lo_v):.1f}" y1="{yl}" x2="{sx(hi_v):.1f}" y2="{yl}" stroke="{C["line"]}" stroke-width="2"/>')
add(f'<line x1="{sx(usual_hr):.1f}" y1="{yl - 14}" x2="{sx(usual_hr):.1f}" y2="{yl + 14}" stroke="{C["ink3"]}" stroke-width="2"/>')
add(f'<circle cx="{sx(tonight_hr):.1f}" cy="{yl}" r="7" fill="{C["lotus"]}"/>')
for v in (50, 60, 70):
    text(sx(v), yl + 34, f"{v}", 11.5, 450, C["ink3"], "middle")
text(sx(usual_hr), yl - 22, "her usual", 11.5, 500, C["ink3"], "middle")
text(sx(tonight_hr), yl - 22, "tonight", 11.5, 600, C["lotus_text"], "middle")
text(x, Y0 + 290, "Resting heart rate, bpm", 12.5, 500, C["ink3"])
text(x, Y0 + 336, f"{usual_hr:.1f}", 26, 700, C["ink"])
text(x + 70, Y0 + 336, "usual (28-night median)", 12.5, 450, C["ink2"])
text(x, Y0 + 376, f"{tonight_hr:.1f}", 26, 700, C["lotus_text"])
text(x + 70, Y0 + 376, "tonight", 12.5, 450, C["ink2"])
add(f'<line x1="{x}" y1="{Y0 + 398}" x2="{x + CW - 44}" y2="{Y0 + 398}" stroke="{C["line"]}"/>')
text(x, Y0 + 432, f"{signed(dev_hr)} bpm", 26, 700, C["ink"])
text(x, Y0 + 456, "above her usual. Is that worrying?", 12.5, 450, C["ink2"])
text(x, Y0 + 494, "Same idea for HRV (60 nights) and", 12.5, 450, C["ink3"])
text(x, Y0 + 512, "home BP (28 days).", 12.5, 450, C["ink3"])

# Step 2: personal response slopes.
x = xs[1] + 22
lines(x, Y0 + 92, [f"Learned from {calm_days} calm days: what a", "short night or a lazy day does to her."])
cohort_mu = pri.mu
rows2 = [
    ("1 hour less sleep", "heart rate next night", -slopes["sleep_rhr"], -cohort_mu["sleep_rhr"], "bpm"),
    ("1,000 fewer steps", "heart rate next night", -slopes["steps_rhr"], -cohort_mu["steps_rhr"], "bpm"),
    ("1,000 more steps", "BP next morning", slopes["steps_sbp"], cohort_mu["steps_sbp"], "mmHg"),
    ("1 hour more sleep", "HRV next night", slopes["sleep_hrv"], cohort_mu["sleep_hrv"], "%"),
]
for j, (cause, effect, me, co, unit) in enumerate(rows2):
    y = Y0 + 152 + j * 80
    add(f'<rect x="{x - 8}" y="{y - 26}" width="{CW - 28}" height="72" rx="12" fill="{C["surface2"]}"/>')
    text(x, y - 4, cause, 13.5, 650, C["ink"])
    text(x, y + 14, effect, 12.5, 450, C["ink3"])
    text(x, y + 36, f"{signed(me)} {unit}", 15, 700, C["lotus_text"])
    text(x + 112, y + 36, f"most people {signed(co)} {unit}", 12.5, 450, C["ink3"])
text(x, Y0 + 482, "A regression of tomorrow on today, one", 12.5, 450, C["ink3"])
text(x, Y0 + 500, "person at a time, corrected for drift.", 12.5, 450, C["ink3"])

# Step 3: pooling on a number line.
x = xs[2] + 22
lines(x, Y0 + 92, ["A few months of one person's data is noisy.", "So each estimate is pulled toward the", "cohort, by exactly as much as it is unsure."])
lo_v, hi_v = -2.2, -0.6
sx = lambda v: x + (v - lo_v) / (hi_v - lo_v) * (CW - 44)  # noqa: E731
yl = Y0 + 236
add(f'<line x1="{sx(lo_v):.1f}" y1="{yl}" x2="{sx(hi_v):.1f}" y2="{yl}" stroke="{C["line"]}" stroke-width="2"/>')
add(f'<line x1="{sx(est - se):.1f}" y1="{yl - 16}" x2="{sx(est + se):.1f}" y2="{yl - 16}" stroke="{C["ink3"]}" stroke-width="1.5"/>')
add(f'<circle cx="{sx(est):.1f}" cy="{yl - 16}" r="6" fill="{C["surface"]}" stroke="{C["ink2"]}" stroke-width="2"/>')
add(f'<line x1="{sx(mu):.1f}" y1="{yl + 6}" x2="{sx(mu):.1f}" y2="{yl + 26}" stroke="{C["ink3"]}" stroke-width="2.5"/>')
add(f'<circle cx="{sx(pooled):.1f}" cy="{yl}" r="7.5" fill="{C["lotus"]}"/>')
text(sx(est), yl - 30, f"her data {est:.2f}", 11.5, 500, C["ink2"], "middle")
text(sx(mu), yl + 44, f"cohort {mu:.2f}", 11.5, 500, C["ink3"], "middle")
text(sx(pooled), yl + 26, f"twin {pooled:.2f}", 11.5, 700, C["lotus_text"], "middle")
text(x, Y0 + 312, "Sleep to heart rate, bpm per hour", 12.5, 500, C["ink3"])
add(f'<rect x="{x - 8}" y="{Y0 + 330}" width="{CW - 28}" height="118" rx="12" fill="{C["surface2"]}"/>')
text(x, Y0 + 356, "Weight on her own data", 13, 650, C["ink"])
text(x, Y0 + 378, f"= spread² / (spread² + noise²)", 12.5, 450, C["ink2"])
text(x, Y0 + 398, f"= {tau:.2f}² / ({tau:.2f}² + {se:.2f}²) = {w_own:.0%}", 12.5, 450, C["ink2"])
text(x, Y0 + 430, f"Twin = {w_own:.0%} \u00d7 ({est:.2f}) + {1 - w_own:.0%} \u00d7 ({mu:.2f}) = {pooled:.2f}", 12, 650, C["lotus_text"])
text(x, Y0 + 482, "New users start at the cohort value;", 12.5, 450, C["ink3"])
text(x, Y0 + 500, "the more calm days, the more it is theirs.", 12.5, 450, C["ink3"])

# Step 4: explained versus unexplained, as a stacked bar.
x = xs[3] + 22
lines(x, Y0 + 92, ["Subtract what her own habits explain.", "What is left is the warning signal."])
text(x, Y0 + 150, f"Last night {abs(x_sleep):.1f} h {'less' if x_sleep < 0 else 'more'} sleep than usual,", 12.5, 450, C["ink2"])
text(x, Y0 + 169, f"yesterday {abs(x_steps) * 1000:,.0f} {'more' if x_steps > 0 else 'fewer'} steps.", 12.5, 450, C["ink2"])
bar_w = CW - 44
scale = bar_w / max(dev_hr, 1)
yb = Y0 + 200
ew = max(explained, 0) * scale
add(f'<rect x="{x}" y="{yb}" width="{ew:.1f}" height="34" rx="6" fill="{C["band"]}"/>')
add(f'<rect x="{x + ew:.1f}" y="{yb}" width="{max(unexpl_hr, 0) * scale:.1f}" height="34" rx="6" fill="{C["lotus"]}"/>')
text(x, yb + 58, f"explained {signed(explained)}", 12.5, 600, C["ink3"])
text(x + bar_w, yb + 58, f"unexplained {signed(unexpl_hr)}", 12.5, 700, C["lotus_text"], "end")
add(f'<rect x="{x - 8}" y="{Y0 + 290}" width="{CW - 28}" height="96" rx="12" fill="{C["surface2"]}"/>')
text(x, Y0 + 314, "Explained = her slopes \u00d7 her habits", 12.5, 650, C["ink"])
text(x, Y0 + 336, f"= ({s_sleep:.2f}) \u00d7 ({x_sleep:.2f}) + ({s_steps:.2f}) \u00d7 ({x_steps:.2f})", 12.5, 450, C["ink2"])
text(x, Y0 + 358, f"= {signed(explained, 2)} bpm", 12.5, 450, C["ink2"])
text(x, Y0 + 378, f"Unexplained = {dev_hr:.1f} - {explained:.1f} = {unexpl_hr:.1f} bpm", 12.5, 650, C["lotus_text"])
text(x, Y0 + 420, f"Home BP: {signed(unexpl_bp, 0)} mmHg her activity", 13.5, 650, C["ink"])
text(x, Y0 + 440, "cannot explain.", 13.5, 650, C["ink"])
text(x, Y0 + 482, "Slopes use only days before tonight,", 12.5, 450, C["ink3"])
text(x, Y0 + 500, "so no future data leaks into the score.", 12.5, 450, C["ink3"])

# Step 5: fusion, calibration and the tier.
x = xs[4] + 22
lines(x, Y0 + 92, ["LightGBM joins the unexplained signals,", "BP trend and eight health-record facts."])
text(x, Y0 + 168, f"{p:.0%}", 40, 700, C["ink"])
text(x + 92, Y0 + 152, "chance of a strain", 12.5, 450, C["ink2"])
text(x + 92, Y0 + 170, "episode in 72 hours", 12.5, 450, C["ink2"])
text(x, Y0 + 196, f"likely {p_lo:.0%} to {p_hi:.0%}, her usual {usual_p:.1%}", 12.5, 450, C["ink3"])
yb = Y0 + 240
bw = CW - 44
add(f'<rect x="{x}" y="{yb}" width="{bw * 0.3:.1f}" height="12" rx="6" fill="#E3F4EB"/>')
add(f'<rect x="{x + bw * 0.3:.1f}" y="{yb}" width="{bw * 0.3:.1f}" height="12" fill="#FDF1D6"/>')
add(f'<rect x="{x + bw * 0.6:.1f}" y="{yb}" width="{bw * 0.4:.1f}" height="12" rx="6" fill="#FCE6E1"/>')
add(f'<line x1="{x + bw * score / 100:.1f}" y1="{yb - 8}" x2="{x + bw * score / 100:.1f}" y2="{yb + 20}" stroke="{C["ink"]}" stroke-width="3"/>')
text(x, yb + 38, "0", 11.5, 450, C["ink3"])
text(x + bw * 0.3, yb + 38, "30 watch", 11.5, 500, C["turmeric"], "middle")
text(x + bw * 0.6, yb + 38, "60 urgent", 11.5, 500, C["sindoor"], "middle")
text(x + bw, yb + 38, "100", 11.5, 450, C["ink3"], "end")
text(x, Y0 + 316, f"Score {score} of 100: {'Urgent' if tier == 'urgent' else tier.title()}", 15, 700, C["sindoor"] if tier == "urgent" else C["ink"])
text(x, Y0 + 352, "Why, in her doctor's words", 12.5, 600, C["ink"])
for j, rs in enumerate(reasons):
    label = rs["label"].replace("Home SBP", "Home BP").replace("Overnight HR", "Heart rate")
    words = label.split()
    l1, l2 = [], []
    for wd in words:
        (l1 if len(" ".join(l1 + [wd])) <= 34 and not l2 else l2).append(wd)
    yy = Y0 + 378 + j * 44
    add(f'<circle cx="{x + 4}" cy="{yy - 4}" r="3.5" fill="{C["peacock"]}"/>')
    text(x + 14, yy, " ".join(l1), 12.5, 450, C["ink2"])
    if l2:
        text(x + 14, yy + 17, " ".join(l2), 12.5, 450, C["ink2"])

# Results strip
ry = Y0 + CH + 30
add(f'<rect x="50" y="{ry}" width="{W - 100}" height="156" rx="18" fill="{C["surface"]}" stroke="{C["line"]}"/>')
text(76, ry + 36, "Does it work? Mean of three patient splits, on people the model never saw", 15, 700, C["ink"])
stats = [
    (f"{rep['fused']['auroc']['mean']:.3f}", "AUROC with steps 1 to 5", C["peacock"]),
    (f"{rep['fused_no_twin']['auroc']['mean']:.3f}", "AUROC without steps 2 to 4 (no twin)", C["ink3"]),
    (f"{rep['fused']['sensitivity']['mean']:.0%}", f"of episodes caught at {op['target_false_alerts_per_patient_day']} false alerts per patient-day", C["peacock"]),
    (f"r {r_lo:.2f} to {r_hi:.2f}", "match between the twin's slopes and each person's hidden true slopes", C["peacock"]),
]
for j, (v, lab, col) in enumerate(stats):
    sx0 = 76 + j * 375
    text(sx0, ry + 92, v, 30, 700, col)
    words, l1, l2 = lab.split(), [], []
    for wd in words:
        (l1 if len(" ".join(l1 + [wd])) <= 44 and not l2 else l2).append(wd)
    text(sx0, ry + 118, " ".join(l1), 12.5, 450, C["ink2"])
    if l2:
        text(sx0, ry + 136, " ".join(l2), 12.5, 450, C["ink2"])

add("</svg>")
svg = "\n".join(parts)
docs = ROOT / "docs"
(docs / "algorithm.svg").write_text(svg)
print("wrote docs/algorithm.svg")
if print_svg(svg, W, H, docs / "algorithm.png", docs / "algorithm.pdf", C["mist"], "How the Pratibimb twin decides"):
    print("wrote docs/algorithm.png and docs/algorithm.pdf")
print(json.dumps({"usual_hr": round(usual_hr, 1), "tonight": tonight_hr, "dev": round(dev_hr, 2), "x_sleep": round(x_sleep, 2),
                  "x_steps": round(x_steps, 2), "s_sleep": round(s_sleep, 2), "s_steps": round(s_steps, 2), "explained": round(explained, 2),
                  "unexpl_hr": round(unexpl_hr, 2), "unexpl_bp": round(unexpl_bp, 1), "raw": round(est, 2), "se": round(se, 2), "mu": round(mu, 2),
                  "tau": round(tau, 2), "w": round(w_own, 2), "pooled": round(pooled, 2), "p": p, "band": [p_lo, p_hi], "score": score,
                  "usual_p": round(usual_p, 4), "calm_days": calm_days, "slopes": {k: round(v, 2) for k, v in slopes.items()},
                  "reasons": [r["label"] for r in reasons]}))
