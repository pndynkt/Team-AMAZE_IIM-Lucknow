"""Personal physiology engine: how this person's body responds to sleep and activity.

The brief defines a digital twin as a model that simulates "a patient's unique physiology"
and can "personalize treatment protocols". A population risk score cannot do that. This
module learns each person's own response slopes from their own history and uses them for
what-if simulation, the clinician's "strongest lever" and the patient's "What helps you".

Method
------
1. **Lagged personal regression.** For every person and outcome we regress today's
   deviation from their own baseline on yesterday's lifestyle deviations:

       y_t = a + b_sleep * sleep_dev_h[t-1] + b_steps * steps_dev_k[t-1] + e_t

   with outcomes: overnight resting heart rate minus the 28-day median (bpm), morning
   home systolic BP minus the 28-day mean (mmHg), and nightly lnRMSSD minus the 60-day mean
   (x100, roughly percent). Lifestyle deviations are measured against the prior 28 days.

2. **Calm days only.** During a strain or infection-like episode, heart rate climbs while
   sleep and steps fall for reasons other than the person's everyday physiology, which
   would distort the slopes. We drop three days either side of any night on which the
   NightSignal-style rule turned red, using the person's own history only, never the
   labels. We do not filter on today's value, because truncating the outcome would bias
   every slope toward zero. Standard errors are inflated for day-to-day autocorrelation.

3. **Empirical-Bayes partial pooling.** One person's 100 nights give a noisy slope, so each
   slope is shrunk toward the cohort average in proportion to its uncertainty
   (DerSimonian-Laird estimate of between-person variance tau^2; posterior mean
   (b_i / se_i^2 + mu / tau^2) / (1 / se_i^2 + 1 / tau^2)). People with little data borrow
   strength from the cohort; people with a lot of data keep their own slope. A new
   enrolment starts at the cohort average and moves as nights accumulate.

4. **Validation against ground truth.** The cohort is synthetic, so each person's true
   slopes are known. The model card reports, per slope, the correlation between learned
   and true slopes and the error of the pooled estimate versus raw per-person OLS and
   versus a one-size-fits-all population slope, plus the coverage of the 80% interval.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

Z80 = 1.2816

PAIRS = {
    "sleep_rhr": dict(lever="sleep", outcome="rhr", lever_label="Sleep", outcome_label="Next-night resting heart rate",
                      per="extra hour of sleep", unit="bpm"),
    "steps_rhr": dict(lever="walking", outcome="rhr", lever_label="Walking", outcome_label="Next-night resting heart rate",
                      per="extra 1,000 steps", unit="bpm"),
    "steps_sbp": dict(lever="walking", outcome="sbp", lever_label="Walking", outcome_label="Next-morning systolic BP",
                      per="extra 1,000 steps", unit="mmHg"),
    "sleep_hrv": dict(lever="sleep", outcome="hrv", lever_label="Sleep", outcome_label="Next-night HRV",
                      per="extra hour of sleep", unit="% HRV"),
}
OUTCOMES = {"rhr": ("sleep_rhr", "steps_rhr"), "sbp": ("sleep_sbp", "steps_sbp"), "hrv": ("sleep_hrv", "steps_hrv")}

# A 30-minute brisk walk is about 3,450 steps (115 steps a minute)
STEPS_PER_MINUTE = 115
MIN_CALM_PAIRS = 12
CALM_WINDOW = 3


def design_frame(feat: pd.DataFrame) -> pd.DataFrame:
    """Lagged design matrix for one person (feature frame sorted by date)."""
    f = feat.sort_values("date").reset_index(drop=True)
    sleep_base = f["sleep_min"].shift(1).rolling(28, min_periods=7).mean()
    steps_base = f["steps"].shift(1).rolling(28, min_periods=7).median()
    sleep_dev_h = (f["sleep_min"] - sleep_base) / 60.0
    steps_dev_k = (f["steps"] - steps_base) / 1000.0
    # Calm days: drop a window of three days either side of any night the rule turned red
    # (strain or illness). The window uses the person's own history only. Filtering on
    # today's value instead would truncate the outcome and bias every slope toward zero.
    red = (f["ns_state"] >= 2).to_numpy()
    episode = np.zeros(len(f), dtype=bool)
    for i in np.where(red)[0]:
        episode[max(0, i - CALM_WINDOW): i + CALM_WINDOW + 1] = True
    calm = pd.Series(~episode, index=f.index)
    out = pd.DataFrame({
        "date": f["date"],
        "x_sleep": sleep_dev_h.shift(1),
        "x_steps": steps_dev_k.shift(1),
        "y_rhr": f["rhr"] - f["rhr_base28"],
        "y_sbp": f["sbp_home"] - f["sbp_28d_mean"],
        "y_hrv": 100.0 * (f["lnrmssd"] - f["hrv_60d"]),
        "calm": calm & calm.shift(1, fill_value=False),
    })
    return out


def personal_ols(dm: pd.DataFrame) -> dict:
    """Raw per-person slopes and standard errors for every outcome. Missing when there
    are too few calm, complete rows."""
    res: dict = {"calm_days": int(dm["calm"].sum())}
    for outcome, (k_sleep, k_steps) in OUTCOMES.items():
        d = dm[dm["calm"]].dropna(subset=["x_sleep", "x_steps", f"y_{outcome}"])
        n = len(d)
        res[f"n_{outcome}"] = n
        if n < MIN_CALM_PAIRS:
            res[k_sleep] = res[k_steps] = None
            continue
        X = np.column_stack([np.ones(n), d["x_sleep"].to_numpy(), d["x_steps"].to_numpy()])
        y = d[f"y_{outcome}"].to_numpy()
        XtX = X.T @ X
        try:
            inv = np.linalg.inv(XtX)
        except np.linalg.LinAlgError:
            res[k_sleep] = res[k_steps] = None
            continue
        beta = inv @ X.T @ y
        resid = y - X @ beta
        s2 = float(resid @ resid) / max(n - 3, 1)
        # Day-to-day residuals are autocorrelated (slow drifts), so inflate the standard
        # errors by the AR(1) factor sqrt((1 + rho) / (1 - rho)).
        rho = float(np.clip(np.corrcoef(resid[:-1], resid[1:])[0, 1], 0.0, 0.6)) if n > 5 else 0.0
        se = np.sqrt(np.diag(inv) * s2) * np.sqrt((1 + rho) / (1 - rho))
        res[k_sleep] = (float(beta[1]), float(se[1]))
        res[k_steps] = (float(beta[2]), float(se[2]))
    return res


def dersimonian_laird(est: np.ndarray, se: np.ndarray) -> tuple[float, float]:
    """Random-effects mean and between-person variance."""
    w = 1.0 / np.maximum(se, 1e-6) ** 2
    mu_fe = float(np.sum(w * est) / np.sum(w))
    q = float(np.sum(w * (est - mu_fe) ** 2))
    k = len(est)
    c = float(np.sum(w) - np.sum(w ** 2) / np.sum(w))
    tau2 = max(0.0, (q - (k - 1)) / c) if c > 0 else 0.0
    w_re = 1.0 / (np.maximum(se, 1e-6) ** 2 + tau2)
    mu = float(np.sum(w_re * est) / np.sum(w_re))
    return mu, tau2


def shrink(est: float | None, se: float | None, mu: float, tau2: float) -> tuple[float, float]:
    """Posterior mean and SD for one person's slope."""
    if est is None or se is None or not np.isfinite(est) or not np.isfinite(se):
        return mu, float(np.sqrt(tau2))
    if tau2 <= 0:
        return mu, 0.0
    prec = 1.0 / se ** 2 + 1.0 / tau2
    return float((est / se ** 2 + mu / tau2) / prec), float(np.sqrt(1.0 / prec))


@dataclass
class Priors:
    mu: dict
    tau2: dict

    def to_dict(self) -> dict:
        return {"mu": self.mu, "tau2": self.tau2}


def fit_priors(raw: dict[str, dict]) -> Priors:
    mu, tau2 = {}, {}
    for key in PAIRS:
        vals = [(r[key][0], r[key][1]) for r in raw.values() if r.get(key)]
        est = np.array([v[0] for v in vals]); se = np.array([v[1] for v in vals])
        mu[key], tau2[key] = dersimonian_laird(est, se)
    return Priors(mu, tau2)


def evidence(post: float, sd: float, has_data: bool) -> str:
    if not has_data:
        return "learning"
    lo, hi = post - Z80 * sd, post + Z80 * sd
    if lo > 0 or hi < 0:
        return "strong" if sd < 0.4 * abs(post) else "moderate"
    return "weak"


def validate(raw: dict[str, dict], truth: pd.DataFrame) -> dict:
    """Recovery of the true per-person slopes: pooled vs raw OLS vs population. The prior
    mean for each person is computed leaving that person out."""
    t = truth.set_index("patient_id")
    out = []
    for key, meta in PAIRS.items():
        ids = [pid for pid, r in raw.items() if r.get(key) and pid in t.index]
        est = np.array([raw[p][key][0] for p in ids]); se = np.array([raw[p][key][1] for p in ids])
        true = np.array([t.loc[p, key] for p in ids])
        mu_all, tau2 = dersimonian_laird(est, se)
        pooled, sd = [], []
        w = 1.0 / (se ** 2 + tau2)
        for i in range(len(ids)):
            mask = np.arange(len(ids)) != i
            mu_loo = float(np.sum(w[mask] * est[mask]) / np.sum(w[mask]))
            m, s = shrink(est[i], se[i], mu_loo, tau2)
            pooled.append(m); sd.append(s)
        pooled = np.array(pooled); sd = np.array(sd)
        cover = float(np.mean((true >= pooled - Z80 * sd) & (true <= pooled + Z80 * sd)))
        out.append({
            "key": key, "label": f"{meta['lever_label']} to {meta['outcome_label'].lower()}", "unit": f"{meta['unit']} per {meta['per']}",
            "n_patients": int(len(ids)), "true_mean": round(float(true.mean()), 3), "true_sd": round(float(true.std()), 3),
            "r_pooled": round(float(np.corrcoef(pooled, true)[0, 1]), 3), "r_raw": round(float(np.corrcoef(est, true)[0, 1]), 3),
            "mae_pooled": round(float(np.mean(np.abs(pooled - true))), 3), "mae_raw": round(float(np.mean(np.abs(est - true))), 3),
            "mae_population": round(float(np.mean(np.abs(mu_all - true))), 3), "coverage_80": round(cover, 3),
            "cohort_mean_estimate": round(mu_all, 3), "tau": round(float(np.sqrt(tau2)), 3),
        })
    return {"method": "Empirical-Bayes partial pooling of per-person lagged slopes fitted on calm days",
            "pairs": out,
            "note": "On the synthetic cohort the generator's true per-person slopes are known, so the twin's recovery of each person's physiology is measured directly. Pooled = the twin's estimate; raw = per-person regression with no pooling; population = one slope for everyone."}


# ---------------------------------------------------------------------------
# Runtime: one person's physiology view
# ---------------------------------------------------------------------------

def _pron(sex: str) -> tuple[str, str]:
    return ("her", "she") if sex == "F" else ("his", "he")


def personal_view(feat: pd.DataFrame, priors: Priors, first: str, sex: str, truth: dict | None = None) -> dict:
    dm = design_frame(feat)
    raw = personal_ols(dm)
    poss, _ = _pron(sex)
    responses = []
    post_by_key = {}
    for key, meta in PAIRS.items():
        r = raw.get(key)
        m, s = shrink(r[0] if r else None, r[1] if r else None, priors.mu[key], priors.tau2[key])
        ev = evidence(m, s, r is not None)
        cohort = priors.mu[key]
        post_by_key[key] = (m, s, ev)
        rel = abs(m) / abs(cohort) if abs(cohort) > 1e-6 else 1.0
        responses.append({
            "key": key, **{k: meta[k] for k in ("lever", "lever_label", "outcome", "outcome_label", "per", "unit")},
            "personal": round(m, 2), "interval": [round(m - Z80 * s, 2), round(m + Z80 * s, 2)],
            "cohort": round(cohort, 2), "relative_to_cohort": round(rel, 2), "evidence": ev,
            "raw": round(r[0], 2) if r else None, "n_days": raw.get(f"n_{meta['outcome']}", 0),
            "plain": _plain(key, m, cohort, first, poss, ev),
        })
    best = best_lever(post_by_key, first, poss)
    return {"method": "Empirical-Bayes partial pooling of per-person response slopes fitted on calm days",
            "calm_days_used": int((dm["calm"] & (dm["y_rhr"].notna() | dm["y_sbp"].notna() | dm["y_hrv"].notna())).sum()),
            "days_available": int(len(feat)),
            "responses": responses, "best_lever": best, "slopes": {k: v[0] for k, v in post_by_key.items()},
            "validation": {"true": truth} if truth else None}


def _plain(key: str, m: float, cohort: float, first: str, poss: str, ev: str) -> str:
    a, c = abs(m), abs(cohort)
    if ev == "learning":
        return f"The twin is still learning how {first}'s body responds. For now it uses the average for people like {first}."
    if key == "sleep_rhr":
        s = f"An extra hour of sleep usually lowers {first}'s next-night heart rate by about {a:.1f} bpm. Most people: {c:.1f} bpm."
    elif key == "steps_rhr":
        s = f"1,000 more steps usually lowers {first}'s next-night heart rate by about {a:.1f} bpm. Most people: {c:.1f} bpm."
    elif key == "steps_sbp":
        s = f"1,000 more steps usually lowers {first}'s next-morning systolic BP by about {a:.1f} mmHg. Most people: {c:.1f} mmHg."
    else:
        s = f"An extra hour of sleep usually lifts {first}'s next-night HRV by about {a:.0f}%. Most people: {c:.0f}%."
    if ev == "weak":
        s += " The evidence is still thin, so treat this as a rough guide."
    return s


def lever_effects(slopes: dict, walk_minutes: float = 0.0, sleep_hours: float = 0.0) -> dict:
    """Expected steady-state change in next-day outcomes for a daily dose of each lever."""
    k = walk_minutes * STEPS_PER_MINUTE / 1000.0
    return {
        "rhr": slopes["steps_rhr"] * k + slopes["sleep_rhr"] * sleep_hours,
        "sbp": slopes["steps_sbp"] * k,
        "hrv_pct": slopes["sleep_hrv"] * sleep_hours,
    }


def best_lever(post: dict, first: str, poss: str) -> dict:
    slopes = {k: v[0] for k, v in post.items()}
    walk = lever_effects(slopes, walk_minutes=30)
    sleep = lever_effects(slopes, sleep_hours=1)
    # Benefit in units of normal day-to-day variation (SBP about 6 mmHg, RHR about 2 bpm, HRV about 12%)
    walk_score = abs(walk["sbp"]) / 6 + abs(walk["rhr"]) / 2
    sleep_score = abs(sleep["rhr"]) / 2 + abs(sleep["hrv_pct"]) / 12
    learning = all(v[2] == "learning" for v in post.values())
    if walk_score >= sleep_score:
        plain = (f"Walking is {first}'s strongest lever. A 30-minute walk (about 3,500 steps) is expected to lower "
                 f"{poss} next-morning BP by about {abs(walk['sbp']):.0f} mmHg and {poss} night heart rate by about {abs(walk['rhr']):.1f} bpm.")
        out = {"key": "steps_sbp", "lever": "walking", "plain": plain, "effect": {"sbp": round(walk["sbp"], 1), "rhr": round(walk["rhr"], 1)}}
    else:
        plain = (f"Sleep is {first}'s strongest lever. An extra hour of sleep is expected to lower {poss} night heart rate "
                 f"by about {abs(sleep['rhr']):.1f} bpm and lift {poss} HRV by about {abs(sleep['hrv_pct']):.0f}%.")
        out = {"key": "sleep_rhr", "lever": "sleep", "plain": plain, "effect": {"rhr": round(sleep["rhr"], 1), "hrv_pct": round(sleep["hrv_pct"], 1)}}
    if learning:
        out["plain"] = f"The twin is still learning {first}'s responses; this uses the average for people like {first}. " + out["plain"]
    out["scores"] = {"walking": round(walk_score, 3), "sleep": round(sleep_score, 3)}
    return out


def what_helps(view: dict) -> list[dict]:
    """Patient-facing, second person, positive framing, strongest first."""
    s = view["slopes"]
    ev = {r["key"]: r["evidence"] for r in view["responses"]}
    walk = lever_effects(s, walk_minutes=30)
    sleep = lever_effects(s, sleep_hours=1)
    items = [
        {"lever": "walking", "score": view["best_lever"]["scores"]["walking"], "strength": ev["steps_sbp"],
         "en": f"A 30-minute walk usually brings your morning BP down by about {abs(walk['sbp']):.0f} mmHg.",
         "hi": f"30 मिनट की सैर से आपका सुबह का BP आम तौर पर लगभग {abs(walk['sbp']):.0f} mmHg कम होता है।"},
        {"lever": "sleep", "score": view["best_lever"]["scores"]["sleep"], "strength": ev["sleep_rhr"],
         "en": f"An extra hour of sleep usually calms your night heart rate by about {abs(sleep['rhr']):.1f} bpm.",
         "hi": f"एक घंटा ज़्यादा सोने से रात में आपकी धड़कन आम तौर पर लगभग {abs(sleep['rhr']):.1f} bpm कम होती है।"},
    ]
    items.sort(key=lambda d: -d["score"])
    items.append({"lever": "medicine", "score": 0, "strength": "general",
                  "en": "Taking your BP medicine at the same time every day keeps your mornings steadier.",
                  "hi": "रोज़ एक ही समय पर BP की दवा लेने से आपकी सुबह का BP ज़्यादा स्थिर रहता है।"})
    for it in items:
        it.pop("score", None)
    return items


# ---------------------------------------------------------------------------
# Twin-adjusted signals: remove what the person's own lifestyle already explains
# ---------------------------------------------------------------------------

LAG_ROWS = 4  # slopes at day t use calm rows up to t - 4, so every row's episode window is already in the past


def expanding_slopes(dm: pd.DataFrame, priors: Priors) -> dict[str, np.ndarray]:
    """Leakage-safe personal slopes for every day: an empirical-Bayes estimate from this
    person's calm rows at least ``LAG_ROWS`` days in the past. Before enough history
    exists the slope is the cohort prior. Vectorised with cumulative sums."""
    n = len(dm)
    out = {k: np.full(n, priors.mu[k], dtype=float) for k in PAIRS}
    xs = dm["x_sleep"].to_numpy(dtype=float)
    xt = dm["x_steps"].to_numpy(dtype=float)
    calm = dm["calm"].to_numpy(dtype=bool)
    for outcome, (k_sleep, k_steps) in OUTCOMES.items():
        keys = [k for k in (k_sleep, k_steps) if k in PAIRS]
        if not keys:
            continue
        y = dm[f"y_{outcome}"].to_numpy(dtype=float)
        ok = calm & np.isfinite(y) & np.isfinite(xs) & np.isfinite(xt)
        X = np.column_stack([np.ones(n), np.where(ok, xs, 0.0), np.where(ok, xt, 0.0)])
        X[~ok, 0] = 0.0
        yy = np.where(ok, y, 0.0)
        XtX = np.cumsum(X[:, :, None] * X[:, None, :], axis=0)
        Xty = np.cumsum(X * yy[:, None], axis=0)
        yty = np.cumsum(yy * yy)
        cnt = np.cumsum(ok)
        for t in range(LAG_ROWS, n):
            j = t - LAG_ROWS
            if cnt[j] < MIN_CALM_PAIRS:
                continue
            A, b = XtX[j], Xty[j]
            try:
                inv = np.linalg.inv(A)
            except np.linalg.LinAlgError:
                continue
            beta = inv @ b
            rss = float(yty[j] - 2 * beta @ b + beta @ A @ beta)
            s2 = max(rss, 1e-6) / max(int(cnt[j]) - 3, 1)
            se = np.sqrt(np.clip(np.diag(inv) * s2, 1e-12, None)) * 1.2
            for key, idx in ((k_sleep, 1), (k_steps, 2)):
                if key in PAIRS:
                    out[key][t] = shrink(float(beta[idx]), float(se[idx]), priors.mu[key], priors.tau2[key])[0]
    return out


def twin_adjusted(feat: pd.DataFrame, priors: Priors) -> pd.DataFrame:
    """Columns aligned to ``feat`` (sorted by date): the part of tonight's heart rate, HRV
    and this morning's BP that the person's own sleep and activity do not explain, plus a
    record-informed heart-rate deviation that accounts for beta blockade."""
    f = feat.sort_values("date").reset_index(drop=True)
    dm = design_frame(f)
    sl = expanding_slopes(dm, priors)
    xs = dm["x_sleep"].fillna(0.0).to_numpy()
    xt = dm["x_steps"].fillna(0.0).to_numpy()
    out = pd.DataFrame(index=f.index)
    out["rhr_unexpl"] = f["rhr_dev"] - (sl["sleep_rhr"] * xs + sl["steps_rhr"] * xt)
    out["rhr_unexpl_3d"] = out["rhr_unexpl"].rolling(3, min_periods=1).mean()
    out["sbp_unexpl"] = (f["sbp_home"] - f["sbp_28d_mean"]) - sl["steps_sbp"] * xt
    out["sbp_unexpl_7d"] = out["sbp_unexpl"].rolling(7, min_periods=2).mean()
    out["hrv_unexpl"] = (f["lnrmssd"] - f["hrv_60d"]) - sl["sleep_hrv"] * xs / 100.0
    bb = f["on_beta_blocker"] if "on_beta_blocker" in f.columns else 0
    out["rhr_dev_bbadj"] = f["rhr_dev_3d"] / np.where(np.asarray(bb) == 1, 0.55, 1.0)
    for k in PAIRS:
        out[f"slope_{k}"] = sl[k]
    return out
