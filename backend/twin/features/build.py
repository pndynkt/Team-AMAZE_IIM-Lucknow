"""Leakage-safe feature matrix for the fusion model.

For each patient-day ``t`` we compute:

- **personal baselines** from the prior window only (``shift(1)``): 28-day median RHR,
  60-day mean and SD of lnRMSSD (the AIS smallest-worthwhile-change method), 28-day
  means for sleep, steps, respiratory rate, SpO2 and home SBP;
- **deviations** of today's values (and short rolling means) from those baselines;
- the **NightSignal-style state** and how long the patient has been in it;
- **data quality**: missing nights in the last 7, wear percentage over 28 days, BP readings
  in the last 7 days;
- **static EHR** features including the Framingham 10-year risk.

The label is ``y72 = 1`` when a strain-episode event day falls within ``(t, t + 3]``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import Thresholds, DEFAULT_THRESHOLDS
from ..models.nightsignal import run_state_machine
from ..models.risk_scores import framingham_10y_risk

WEARABLE_FEATURES = [
    "rhr", "rhr_dev", "rhr_dev_3d", "rhr_dev_max3", "rhr_z",
    "lnrmssd", "hrv_7d", "hrv_dev", "hrv_drop_pct", "hrv_below_swc", "hrv_days_below",
    "sleep_min", "sleep_eff", "sleep_eff_dev", "sleep_min_dev", "deep_pct",
    "steps", "steps_z", "steps_z_3d",
    "resp_rate", "resp_dev", "spo2", "spo2_dev",
    "sbp_last", "sbp_7d_mean", "sbp_dev", "sbp_slope_7d", "dbp_7d_mean", "bp_readings_7d", "sbp_days_since",
    "missing_7d", "wear_pct_28d",
    "ns_state", "ns_days",
    "sleep_debt_7d", "activity_7d_z",
]

EHR_FEATURES = [
    "age", "sex_f", "bmi", "hba1c", "ldl", "hdl", "tc", "tg", "egfr",
    "smoker", "diabetes", "ckd", "ihd", "prior_mi", "afib_history",
    "on_ccb", "on_arb", "on_beta_blocker", "on_diuretic", "on_statin", "on_metformin", "on_aspirin",
    "n_bp_meds", "adherence_pct", "family_history_cvd", "genetic_tier", "framingham_10y",
]

BP_FEATURES = ["sbp_last", "sbp_7d_mean", "sbp_dev", "sbp_slope_7d", "dbp_7d_mean", "bp_readings_7d", "sbp_days_since"]

# Twin-adjusted signals from the personal physiology engine (see twin.models.physiology)
TWIN_WATCH_FEATURES = ["rhr_unexpl", "rhr_unexpl_3d", "hrv_unexpl"]
TWIN_CUFF_FEATURES = ["sbp_unexpl", "sbp_unexpl_7d"]
TWIN_RECORD_FEATURES = ["rhr_dev_bbadj"]
TWIN_FEATURES = TWIN_WATCH_FEATURES + TWIN_CUFF_FEATURES + TWIN_RECORD_FEATURES

# Watch-only: what a wrist wearable reports without a home BP cuff
WATCH_FEATURES = [f for f in WEARABLE_FEATURES if f not in BP_FEATURES] + TWIN_WATCH_FEATURES
# Plain wearable features before twin adjustment (kept for the ablation table)
WEARABLE_RAW_FEATURES = list(WEARABLE_FEATURES)
WEARABLE_FEATURES = WEARABLE_FEATURES + TWIN_WATCH_FEATURES + TWIN_CUFF_FEATURES

ALL_FEATURES = WEARABLE_FEATURES + EHR_FEATURES + TWIN_RECORD_FEATURES

# Plain-language labels used by the explanation layer
FEATURE_LABELS = {
    "rhr_dev": "Overnight HR {value:+.0f} bpm vs 28-day baseline",
    "rhr_dev_3d": "Overnight HR {value:+.0f} bpm vs baseline (3-night mean)",
    "rhr_dev_max3": "Peak overnight HR {value:+.0f} bpm vs baseline in last 3 nights",
    "rhr_z": "Overnight HR {value:+.1f} SD from your usual",
    "rhr": "Overnight HR {value:.0f} bpm",
    "lnrmssd": "HRV (lnRMSSD) {value:.2f}",
    "hrv_7d": "7-night HRV mean {value:.2f}",
    "hrv_dev": "HRV {value:+.2f} vs 60-day mean",
    "hrv_drop_pct": "HRV {value:+.0f}% vs your 60-day mean",
    "hrv_below_swc": "HRV below your smallest worthwhile change",
    "hrv_days_below": "HRV below your usual band for {value:.0f} nights",
    "sleep_min": "Sleep {value:.0f} min",
    "sleep_eff": "Sleep efficiency {value:.0%}",
    "sleep_eff_dev": "Sleep efficiency {value:+.0%} vs usual",
    "sleep_min_dev": "Sleep {value:+.0f} min vs usual",
    "deep_pct": "Deep sleep {value:.0%}",
    "steps": "Steps {value:,.0f}",
    "steps_z": "Steps {value:+.1f} SD vs your usual",
    "steps_z_3d": "Steps (3-day) {value:+.1f} SD vs your usual",
    "resp_rate": "Respiratory rate {value:.1f}/min",
    "resp_dev": "Respiratory rate {value:+.1f}/min vs usual",
    "spo2": "SpO2 {value:.1f}%",
    "spo2_dev": "SpO2 {value:+.1f} vs usual",
    "sbp_last": "Last home SBP {value:.0f} mmHg",
    "sbp_7d_mean": "7-day home SBP mean {value:.0f} mmHg",
    "sbp_dev": "Home SBP {value:+.0f} mmHg vs 28-day mean",
    "sbp_slope_7d": "Home SBP trending {value:+.1f} mmHg/day over 7 days",
    "dbp_7d_mean": "7-day home DBP mean {value:.0f} mmHg",
    "bp_readings_7d": "{value:.0f} home BP readings in 7 days",
    "sbp_days_since": "{value:.0f} days since last BP reading",
    "missing_7d": "{value:.0f} missing nights in last 7",
    "wear_pct_28d": "Wear time {value:.0%} over 28 days",
    "ns_state": "Rule state (0 green, 1 yellow, 2 red): {value:.0f}",
    "ns_days": "{value:.0f} days in current rule state",
    "age": "Age {value:.0f}",
    "sex_f": "Female",
    "bmi": "BMI {value:.1f}",
    "hba1c": "HbA1c {value:.1f}%",
    "ldl": "LDL {value:.0f} mg/dL",
    "hdl": "HDL {value:.0f} mg/dL",
    "tc": "Total cholesterol {value:.0f} mg/dL",
    "tg": "Triglycerides {value:.0f} mg/dL",
    "egfr": "eGFR {value:.0f}",
    "smoker": "Smoker",
    "diabetes": "Type 2 diabetes",
    "ckd": "Chronic kidney disease",
    "ihd": "Ischaemic heart disease",
    "prior_mi": "Prior myocardial infarction",
    "afib_history": "Atrial fibrillation history",
    "on_ccb": "On calcium channel blocker",
    "on_arb": "On ARB",
    "on_beta_blocker": "On beta blocker",
    "on_diuretic": "On diuretic",
    "on_statin": "On statin",
    "on_metformin": "On metformin",
    "on_aspirin": "On aspirin",
    "n_bp_meds": "{value:.0f} BP medicines",
    "adherence_pct": "Medication adherence {value:.0f}%",
    "family_history_cvd": "Family history of CVD",
    "genetic_tier": "Polygenic risk tier (0 low, 1 medium, 2 high): {value:.0f}",
    "framingham_10y": "10-year Framingham risk {value:.1f}%",
    "sleep_debt_7d": "Sleep debt {value:+.1f} h a night over the last week",
    "activity_7d_z": "Activity over the last week {value:+.1f} SD vs usual",
    "rhr_unexpl": "Overnight HR {value:+.0f} bpm beyond what sleep and activity explain",
    "rhr_unexpl_3d": "Overnight HR {value:+.0f} bpm beyond what sleep and activity explain (3 nights)",
    "hrv_unexpl": "HRV {value:+.0f}% versus what sleep explains",
    "sbp_unexpl": "Home SBP {value:+.0f} mmHg beyond what activity explains",
    "sbp_unexpl_7d": "Home SBP {value:+.0f} mmHg beyond what activity explains (7 days)",
    "rhr_dev_bbadj": "Overnight HR rise {value:+.0f} bpm, read against the beta blocker",
}

FEATURE_GROUP = {f: "wearable" for f in WEARABLE_FEATURES}
FEATURE_GROUP.update({f: "ehr" for f in EHR_FEATURES})
FEATURE_GROUP.update({f: "ehr" for f in TWIN_RECORD_FEATURES})


def static_vector(ehr_row: pd.Series) -> dict:
    r = ehr_row
    fram = framingham_10y_risk(age=r["age"], sex=r["sex"], tc=r["tc"], hdl=r["hdl"], sbp=r["sbp_clinic"],
                               treated=bool(r["n_bp_meds"]), smoker=bool(r["smoker"]), diabetes=bool(r["diabetes"]))
    return {
        "age": r["age"], "sex_f": int(r["sex"] == "F"), "bmi": r["bmi"], "hba1c": r["hba1c"], "ldl": r["ldl"],
        "hdl": r["hdl"], "tc": r["tc"], "tg": r["tg"], "egfr": r["egfr"], "smoker": r["smoker"],
        "diabetes": r["diabetes"], "ckd": r["ckd"], "ihd": r["ihd"], "prior_mi": r["prior_mi"],
        "afib_history": r["afib_history"], "on_ccb": r["on_ccb"], "on_arb": r["on_arb"],
        "on_beta_blocker": r["on_beta_blocker"], "on_diuretic": r["on_diuretic"], "on_statin": r["on_statin"],
        "on_metformin": r["on_metformin"], "on_aspirin": r["on_aspirin"], "n_bp_meds": r["n_bp_meds"],
        "adherence_pct": r["adherence_pct"], "family_history_cvd": r["family_history_cvd"],
        "genetic_tier": {"low": 0, "medium": 1, "high": 2}[r["genetic_risk_tier"]], "framingham_10y": fram,
    }


def _slope(y: np.ndarray) -> float:
    m = ~np.isnan(y)
    if m.sum() < 3:
        return np.nan
    x = np.arange(len(y))[m]
    yy = y[m]
    x = x - x.mean()
    return float((x * (yy - yy.mean())).sum() / (x ** 2).sum())


def dynamic_features(daily: pd.DataFrame, thr: Thresholds = DEFAULT_THRESHOLDS) -> pd.DataFrame:
    """Compute the wearable feature block for one patient's daily frame (sorted by date)."""
    d = daily.sort_values("date").reset_index(drop=True).copy()
    prior = lambda s, w, mp: s.shift(1).rolling(w, min_periods=mp)  # noqa: E731  baselines exclude today

    d["rhr_base28"] = prior(d["rhr"], 28, 7).median()
    d["rhr_sd28"] = prior(d["rhr"], 28, 7).std()
    d["rhr_dev"] = d["rhr"] - d["rhr_base28"]
    d["rhr_dev_3d"] = d["rhr_dev"].rolling(3, min_periods=1).mean()
    d["rhr_dev_max3"] = d["rhr_dev"].rolling(3, min_periods=1).max()
    d["rhr_z"] = d["rhr_dev"] / d["rhr_sd28"].clip(lower=1.0)

    d["hrv_7d"] = d["lnrmssd"].rolling(7, min_periods=3).mean()
    d["hrv_60d"] = prior(d["lnrmssd"], 60, 14).mean()
    d["hrv_sd60"] = prior(d["lnrmssd"], 60, 14).std()
    d["hrv_swc"] = thr.hrv_swc_multiplier * d["hrv_sd60"]
    d["hrv_dev"] = d["hrv_7d"] - d["hrv_60d"]
    d["hrv_drop_pct"] = (np.exp(d["hrv_dev"]) - 1) * 100
    below = (d["hrv_7d"] < d["hrv_60d"] - d["hrv_swc"]).astype(float)
    below[d["hrv_7d"].isna() | d["hrv_60d"].isna()] = np.nan
    d["hrv_below_swc"] = below
    run = 0
    runs = []
    for b in below.fillna(0).astype(int):
        run = run + 1 if b else 0
        runs.append(run)
    d["hrv_days_below"] = runs

    d["sleep_eff_dev"] = d["sleep_eff"] - prior(d["sleep_eff"], 28, 7).mean()
    d["sleep_min_dev"] = d["sleep_min"] - prior(d["sleep_min"], 28, 7).mean()

    log_steps = np.log(d["steps"].clip(lower=100))
    d["steps_z"] = (log_steps - prior(log_steps, 28, 7).mean()) / prior(log_steps, 28, 7).std().clip(lower=0.1)
    d["steps_z_3d"] = d["steps_z"].rolling(3, min_periods=1).mean()

    d["resp_dev"] = d["resp_rate"] - prior(d["resp_rate"], 28, 7).mean()
    d["spo2_dev"] = d["spo2"] - prior(d["spo2"], 28, 7).mean()

    sbp = d["sbp_home"]
    d["sbp_last"] = sbp.ffill(limit=6)
    d["sbp_days_since"] = (sbp.notna().cumsum().to_frame("c").assign(i=np.arange(len(d)))
                           .groupby("c")["i"].transform(lambda s: s - s.iloc[0]))
    d.loc[sbp.notna().cumsum() == 0, "sbp_days_since"] = 30
    d["sbp_7d_mean"] = sbp.rolling(7, min_periods=1).mean()
    d["sbp_28d_mean"] = prior(sbp, 28, 3).mean()
    d["sbp_dev"] = d["sbp_7d_mean"] - d["sbp_28d_mean"]
    d["sbp_slope_7d"] = sbp.rolling(7, min_periods=3).apply(_slope, raw=True)
    d["dbp_7d_mean"] = d["dbp_home"].rolling(7, min_periods=1).mean()
    d["bp_readings_7d"] = sbp.notna().rolling(7, min_periods=1).sum()

    # Lifestyle load: a week of short sleep or low activity versus the person's prior 60 days
    sleep60 = prior(d["sleep_min"], 60, 14).mean()
    d["sleep_debt_7d"] = -(d["sleep_min"].rolling(7, min_periods=3).mean() - sleep60) / 60.0
    steps60 = prior(log_steps, 60, 14)
    d["activity_7d_z"] = (log_steps.rolling(7, min_periods=3).mean() - steps60.mean()) / steps60.std().clip(lower=0.1)

    d["missing_7d"] = d["missing"].astype(float).rolling(7, min_periods=1).sum()
    d["wear_pct_28d"] = 1 - d["missing"].astype(float).rolling(28, min_periods=1).mean()

    state, days_in = run_state_machine(d["rhr_dev"].to_numpy(dtype=float), thr.ns_rhr_delta_yellow,
                                       thr.ns_rhr_delta_red, thr.ns_consecutive_nights)
    d["ns_state"] = state
    d["ns_days"] = days_in
    return d


def labels_for(dates: pd.Series, event_days: list[pd.Timestamp], horizon_days: int) -> np.ndarray:
    """1 when an event day falls in (t, t + horizon]."""
    y = np.zeros(len(dates), dtype=int)
    if not event_days:
        return y
    ev = np.array(sorted(pd.to_datetime(event_days)), dtype="datetime64[ns]")
    dt = dates.to_numpy(dtype="datetime64[ns]")
    for e in ev:
        lo = e - np.timedelta64(horizon_days, "D")
        y |= ((dt >= lo) & (dt < e)).astype(int)
    return y


@dataclass
class FeatureBundle:
    frame: pd.DataFrame  # one row per patient-day with ALL_FEATURES, y72, patient_id, date
    feature_names: list[str]
    priors: object = None  # physiology.Priors used for the twin-adjusted signals
    raw_physiology: dict | None = None


def add_twin_features(f: pd.DataFrame, priors) -> pd.DataFrame:
    """Append the twin-adjusted signals to one person's feature frame (sorted by date)."""
    from ..models.physiology import twin_adjusted
    f = f.sort_values("date").reset_index(drop=True)
    tw = twin_adjusted(f, priors)
    for c in tw.columns:
        f[c] = tw[c].to_numpy()
    return f


def build_features(ehr: pd.DataFrame, daily: pd.DataFrame, episodes: pd.DataFrame,
                   horizon_days: int = 3, thr: Thresholds = DEFAULT_THRESHOLDS,
                   as_of: pd.Timestamp | None = None, priors=None) -> FeatureBundle:
    """Build the full matrix. ``as_of`` truncates the daily stream (used by leakage tests
    and by live rescoring). When ``priors`` is None the personal physiology priors are
    fitted from the cohort's own lifestyle responses (no labels are used)."""
    from ..models import physiology as PH
    if as_of is not None:
        daily = daily[daily["date"] <= as_of]
    statics = {row["patient_id"]: static_vector(row) for _, row in ehr.iterrows()}
    ev_by_patient = (episodes[episodes["kind"] == "strain_episode"].dropna(subset=["event_day"])
                     .groupby("patient_id")["event_day"].apply(list).to_dict())
    frames = {}
    for pid, g in daily.groupby("patient_id", sort=False):
        f = dynamic_features(g, thr)
        for k, v in statics[pid].items():
            f[k] = v
        f["y72"] = labels_for(f["date"], ev_by_patient.get(pid, []), horizon_days)
        frames[pid] = f
    raw = {pid: PH.personal_ols(PH.design_frame(f)) for pid, f in frames.items()}
    if priors is None:
        priors = PH.fit_priors(raw)
    frame = pd.concat([add_twin_features(f, priors) for f in frames.values()], ignore_index=True)
    return FeatureBundle(frame=frame, feature_names=ALL_FEATURES, priors=priors, raw_physiology=raw)
