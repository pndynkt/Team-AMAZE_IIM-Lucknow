"""Train everything and write artifacts plus the model card.

    python -m twin.models.train

Artifacts (``backend/artifacts/``):
- ``fusion.pkl``       FusionArtifacts (model, bag, calibrator, operating points, metrics)
- ``forecast.pkl``     ForecastArtifacts (18 quantile models)
- ``features.parquet`` the feature matrix used (for the leakage tests and the console)
- ``model_card.json``  everything the /api/model endpoint serves
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd

from ..config import ARTIFACT_DIR, DATA_DIR, DEFAULT_THRESHOLDS, MODEL_VERSION, DEFAULT_COHORT
from ..features.build import build_features, FEATURE_GROUP
from .fusion import train_fusion
from .forecast import train_forecasters
from . import physiology as PH

LIMITATIONS = [
    "Trained and evaluated on a synthetic cohort. Reported numbers describe how well the twin recovers injected episodes, not clinical performance.",
    "Strain-episode ground truth is defined by the generator; real adverse events are heterogeneous and rarer.",
    "Consumer-watch data syncs hourly to daily; the twin scores once per night and cannot see minute-level emergencies.",
    "Framingham 2008 under-estimates risk in South Asians; the WHO 2019 SEAR chart is the planned replacement.",
    "No validation on any Indian clinical dataset yet; BODH benchmarking and an ABDM-sandbox pilot are roadmap items.",
    "Personal response slopes come from everyday swings in sleep and activity (observational, not randomised); medicine, salt and alcohol effects in the what-if are population estimates because the twin has no personal data on them.",
    "Not a medical device. Outputs are decision support for a registered practitioner, never a diagnosis.",
]

PUBLISHED_ANCHORS = [
    {"name": "NightSignal, infection from overnight RHR (Alavi et al., Nat Med 2021)", "sensitivity": 0.80, "specificity": 0.877, "lead": "median 3 days", "note": "Rule family reused here; task differs"},
    {"name": "Epic Deterioration Index, inpatient (Singh et al., 2020)", "auroc": 0.76, "lead": "median 28 h", "note": "Inpatient EHR only"},
    {"name": "Dozee early warning, Indian wards (Yadav et al., 2024)", "specificity": 0.42, "lead": "mean 16 h", "note": "Contactless bedside sensor; specificity 0.19 to 0.42 across tiers"},
    {"name": "All of Us Fitbit + EHR fusion (2025)", "auroc_gain": "+8.9% average, +10.7% hypertension", "note": "Concatenation + logistic regression"},
]


def main() -> None:
    t0 = time.time()
    ehr = pd.read_parquet(DATA_DIR / "ehr.parquet")
    daily = pd.read_parquet(DATA_DIR / "daily.parquet")
    episodes = pd.read_parquet(DATA_DIR / "episodes.parquet")
    with open(DATA_DIR / "cohort.json") as f:
        cohort_cfg = json.load(f)

    print("building features ...")
    fb = build_features(ehr, daily, episodes, horizon_days=cohort_cfg["horizon_days"], thr=DEFAULT_THRESHOLDS)
    frame = fb.frame
    # Oracle prior for the ceiling analysis only (never a model input): the generator's own risk multiplier
    from ..data.wearables import episode_risk_multiplier
    from ..data.ehr import EHRRecord

    mult = {r["patient_id"]: float(np.log(episode_risk_multiplier(EHRRecord(**r)))) for r in ehr.to_dict("records")}
    frame["oracle_prior"] = frame["patient_id"].map(mult)
    print(f"  {len(frame):,} patient-days, {int(frame['y72'].sum()):,} positive days")

    print("training fusion model + ablations ...")
    arts = train_fusion(frame, episodes, seed=cohort_cfg["seed"], thr=DEFAULT_THRESHOLDS)
    print("  fused:", {k: arts.metrics[k] for k in ("auroc", "auprc", "sensitivity", "specificity", "false_alerts_per_patient_day", "median_lead_hours")})
    for k, v in arts.ablation.items():
        if k not in ("confounder", "repeated") and v:
            print(f"  {k}:", {kk: v[kk] for kk in ("auroc", "sensitivity", "specificity", "false_alerts_per_patient_day")})
    print("  confounder:", arts.ablation["confounder"])

    print("training forecasters ...")
    # Forecasters: hold out fold 0 for reporting, fold 1 for early stopping
    folds = arts.folds
    frame["p_episode"] = arts.extra["oof_cal"]
    fc = train_forecasters(frame, [p for f in folds[2:] for p in f], folds[1], folds[0])
    print("  forecast:", fc.metrics)

    print("fitting the personal physiology engine ...")
    raw = fb.raw_physiology
    priors = fb.priors
    truth_path = DATA_DIR / "physiology_truth.parquet"
    phys_validation = PH.validate(raw, pd.read_parquet(truth_path)) if truth_path.exists() else None
    if phys_validation:
        for pr in phys_validation["pairs"]:
            print(f"  {pr['key']}: r {pr['r_pooled']} (raw {pr['r_raw']}), MAE {pr['mae_pooled']} vs population {pr['mae_population']}, 80% coverage {pr['coverage_80']}")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    with open(ARTIFACT_DIR / "physiology.json", "w") as f:
        json.dump({"priors": priors.to_dict(), "validation": phys_validation}, f, indent=2)
    joblib.dump(arts, ARTIFACT_DIR / "fusion.pkl")
    joblib.dump(fc, ARTIFACT_DIR / "forecast.pkl")
    frame.drop(columns=["oracle_prior", "p_episode"]).to_parquet(ARTIFACT_DIR / "features.parquet", index=False)

    n_events = int(episodes[episodes["kind"] == "strain_episode"].shape[0])
    rep = arts.ablation["repeated"]
    conf = arts.ablation["confounder"]

    def rm(name: str, key: str = "auroc") -> float:
        return rep[name][key]["mean"]

    print("  repeated (mean of 3 splits):", {n: (rep[n]["auroc"]["mean"], rep[n]["sensitivity"]["mean"]) for n in ("fused", "fused_no_twin", "wearable_only", "watch_only", "ehr_only")})
    card = {
        "name": "Pratibimb fusion model",
        "version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "task": "Binary: cardiovascular strain episode onset within 72 h, scored once per night from the latest synced data",
        "condition": "Hypertension with cardiovascular risk (Indian adults)",
        "algorithm": "LightGBM gradient-boosted trees on dynamic (wearable) features, twin-adjusted residuals and a compact static tower of eight record features; patient-level 5-fold CV repeated on three patient splits; Platt calibration on pooled out-of-fold scores; the five fold models form the bag for the probability band; NightSignal-style rule run alongside",
        "data": {
            "cohort": int(ehr.shape[0]), "patient_days": int(len(frame)), "events": n_events,
            "positive_days": int(frame["y72"].sum()), "event_rate_days": round(float(frame["y72"].mean()), 4),
            "event_rate": round(float(frame["y72"].mean()), 4),
            "split": "patient-level 5-fold cross-validation repeated on three patient splits (seeds 42, 43, 44); every metric on pooled out-of-fold predictions; headline numbers are the mean of the three splits",
            "synthetic": True, "generator_seed": cohort_cfg["seed"],
            "sources": ["Synthetic EHR, Synthea-shaped FHIR R4 (twin.data.ehr)",
                        "Synthetic wearable streams with labelled strain episodes and unlabelled infection, lifestyle and missing-data confounders (twin.data.wearables)"],
            "confounders": {"infection_like": int((episodes["kind"] == "infection").sum()),
                            "missed_dose": int((episodes["kind"] == "missed_dose").sum()),
                            "late_nights": int((episodes["kind"] == "party").sum()),
                            "travel": int((episodes["kind"] == "travel").sum())},
            "folds": arts.extra["k_folds"],
        },
        "metrics": {
            "fused": arts.metrics,
            "watch_only": arts.ablation["watch_only"],
            "wearable_only": arts.ablation["wearable_only"],
            "ehr_only": arts.ablation["ehr_only"],
            "rule_only": arts.ablation["rule_only"],
            "fused_no_twin": arts.ablation["fused_no_twin"],
            "ceiling_wearable_plus_oracle_prior": arts.ablation.get("ceiling_oracle_prior"),
            "repeated": rep,
        },
        "ablation_note": (
            f"At a matched 90% event sensitivity on out-of-fold predictions: watch-only (HR, HRV, sleep, steps, SpO2, respiratory rate) "
            f"alerted inside {conf['watch_only']['infection_windows_alerted']} of {conf['infection_windows']} infection-like windows at "
            f"{conf['watch_only']['false_alerts_per_patient_day']} false alerts per patient-day; adding the home BP cuff gave "
            f"{conf['wearable_only']['infection_windows_alerted']} windows at {conf['wearable_only']['false_alerts_per_patient_day']}; "
            f"the fused model with the record gave {conf['fused']['infection_windows_alerted']} windows at {conf['fused']['false_alerts_per_patient_day']}. "
            f"The blood-pressure cuff is what separates strain from a cold. Mean over three patient splits: AUROC {rm('ehr_only')} for the record alone, "
            f"{rm('watch_only')} for the watch alone, {rm('wearable_only')} for watch + cuff and {rm('fused')} fused "
            f"(fused ahead of watch + cuff on {rep['fused_beats_wearable_auroc']} splits)."),
        "twin_note": (
            f"Twin adjustment: the personal physiology engine removes the part of each night's heart rate, HRV and BP change that the person's own "
            f"sleep and activity explain, and the record tells the model how to read the heart-rate rise (beta blockers dampen it). "
            f"Mean over three patient splits: without it the fused model reaches AUROC {rm('fused_no_twin')} and catches "
            f"{rm('fused_no_twin', 'sensitivity'):.0%} of events at the false-alert budget; with it, AUROC {rm('fused')} and "
            f"{rm('fused', 'sensitivity'):.0%} (better AUROC on {rep['twin_beats_no_twin_auroc']} splits)."),
        "ceiling_note": "Even an oracle static prior (the generator's own risk multiplier) adds only a little over the wearable-only model: on a 72-hour horizon, when matters more than who. The EHR stream's job is prioritisation, interpretation (diabetic silent episodes, beta-blocker dampening) and the static risk panel, not timing.",
        "operating_points": {"p_watch": arts.p_watch, "p_urgent": arts.p_urgent, "curve": arts.extra["operating_curve"],
                             "target_false_alerts_per_patient_day": DEFAULT_THRESHOLDS.target_false_alerts_per_patient_day,
                             "score_mapping": "0 to 0, p_watch to 30, p_urgent to 60, 1 to 100 (piecewise linear on calibrated probability)"},
        "confounder": arts.ablation["confounder"],
        "forecast": {**fc.metrics,
                     "rhr_mae_day1": fc.metrics["rhr_h1"]["mae"], "sbp_mae_day1": fc.metrics["sbp_h1"]["mae"],
                     "coverage_p10_p90": round(float(np.mean([v["coverage_p10_p90"] for v in fc.metrics.values()])), 3)},
        "physiology": phys_validation,
        "calibration": {"method": "Platt scaling (logistic on logit of raw score) fit on pooled out-of-fold predictions", "bins": arts.calibration_bins},
        "features": [{**d, "group": FEATURE_GROUP[d["name"]]} for d in arts.importance],
        "limitations": LIMITATIONS,
        "published_anchors": PUBLISHED_ANCHORS,
        "regulatory": {
            "status": "Research proof-of-concept on synthetic data; not a medical device under the Medical Devices Rules 2017",
            "cdsco": "A production version would be Medical Device Software, likely Class B or C under CDSCO's medical device software guidance (30 July 2026); training-data composition and synthetic-versus-real disclosure are in this card; retraining follows a versioned Algorithm Change Protocol",
            "dpdp": "Built DPDP-ready ahead of the 13 May 2027 commencement of the consent, breach and retention rules",
            "telemedicine": "No AI prescribing; patient-facing text never changes doses (Telemedicine Practice Guidelines 2020)",
        },
        "leakage_tests": {"passed": None, "tests": ["no_future_values_in_features", "patient_level_split", "label_window_excludes_t"],
                          "note": "Set by `pytest backend/tests/test_leakage.py`; see docs/MODEL_CARD.md"},
        "training_seconds": round(time.time() - t0, 1),
    }
    with open(ARTIFACT_DIR / "model_card.json", "w") as f:
        json.dump(card, f, indent=2, default=str)
    print(f"done in {card['training_seconds']} s → {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
