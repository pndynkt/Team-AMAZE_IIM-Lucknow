"""Fusion classifier: strain-episode onset within 72 hours.

Design choices, in order of importance:

1. **Plain fusion, compact static tower.** Dynamic wearable features are concatenated
   with a compact set of static EHR features (age, sex, BMI, HbA1c, diabetes, CKD, prior
   MI, beta blocker, adherence, family history, polygenic tier and the Framingham 10-year
   risk) and fed to a gradient-boosted tree model. A compact static set matters: with a
   few hundred patients, a wide static vector lets trees identify individual patients and
   memorise their episode days. The largest published EHR + Fitbit study (8,477 All of Us
   participants) gained +8.9% AUROC on average from exactly this kind of concatenation.
2. **Patient-level 5-fold cross-validation.** Every reported metric is on pooled
   out-of-fold predictions, so all 240 patients and all events count. Each fold keeps an
   inner validation split for early stopping. The deployed model is retrained on everyone;
   its calibrator is fit on the pooled out-of-fold scores (cross-validated calibration) and
   the five fold models form the bag that gives a P10 to P90 band.
3. **Ablations are first-class.** Watch-only (no BP cuff), watch + home BP cuff, EHR-only
   and rule-only are trained the same way and reported side by side, because the brief
   asks for the fusion of two streams and the honest question is "what did fusion buy?".
4. **Operating point from a false-alert budget.** The urgent threshold is the most
   sensitive point whose false alerts per patient-day stay within
   ``Thresholds.target_false_alerts_per_patient_day`` on the out-of-fold predictions; the
   watch threshold catches 90% of events. The console's alert-budget meter shows both.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from ..config import Thresholds, DEFAULT_THRESHOLDS
from ..features.build import WEARABLE_FEATURES, EHR_FEATURES, WATCH_FEATURES, WEARABLE_RAW_FEATURES, TWIN_RECORD_FEATURES

# Compact static tower used by the fused model (see module docstring)
# Eight record features chosen once on repeated CV: a wider static tower lets the trees
# memorise individual patients (each has about 120 identical static rows) and lowers AUROC.
FUSION_EHR_FEATURES = ["framingham_10y", "genetic_tier", "adherence_pct", "diabetes", "prior_mi", "ckd",
                       "family_history_cvd", "on_beta_blocker"]
# Extra fold seeds for repeated patient-level CV. Metrics vary by up to 15 points of
# sensitivity between single splits of 240 patients, so headline numbers are the mean
# over all repeats; the primary split (seed 42) supplies the deployed fold models.
REPEAT_SEEDS = (43, 44)
FUSION_FEATURES = WEARABLE_FEATURES + FUSION_EHR_FEATURES + TWIN_RECORD_FEATURES
# The fused model before twin adjustment, kept for the ablation table
FUSION_NO_TWIN_FEATURES = WEARABLE_RAW_FEATURES + FUSION_EHR_FEATURES

LGB_PARAMS = dict(
    objective="binary", learning_rate=0.02, num_leaves=15, min_data_in_leaf=200,
    feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=20.0, min_gain_to_split=0.01,
    verbose=-1, seed=7, num_threads=2,
)


def patient_folds(patient_ids: list[str], seed: int = 42, k: int = 5) -> list[list[str]]:
    rng = np.random.default_rng(seed)
    ids = np.array(sorted(set(patient_ids)))
    rng.shuffle(ids)
    return [list(x) for x in np.array_split(ids, k)]


# Clinical sanity built into the trees: risk may only rise with these record features and
# with a week of sleep debt, and only fall with activity and medicine adherence. It keeps
# the what-if simulator monotone (more sleep can never raise risk) and makes the record
# tower read like a clinician would.
MONOTONE = {"framingham_10y": 1, "genetic_tier": 1, "prior_mi": 1, "ckd": 1, "family_history_cvd": 1, "diabetes": 1,
            "adherence_pct": -1, "sleep_debt_7d": 1, "activity_7d_z": -1}


def _fit(X: pd.DataFrame, y: np.ndarray, Xv: pd.DataFrame, yv: np.ndarray, seed: int = 7) -> lgb.Booster:
    params = {**LGB_PARAMS, "seed": seed}
    mono = [MONOTONE.get(c, 0) for c in X.columns]
    if any(mono):
        params["monotone_constraints"] = mono
        params["monotone_constraints_method"] = "intermediate"
    pos = max(y.sum(), 1)
    params["scale_pos_weight"] = float(min((len(y) - pos) / pos, 25.0))
    dtrain = lgb.Dataset(X, label=y, free_raw_data=False)
    dval = lgb.Dataset(Xv, label=yv, reference=dtrain, free_raw_data=False)
    return lgb.train(params, dtrain, num_boost_round=800, valid_sets=[dval],
                     callbacks=[lgb.early_stopping(60, verbose=False)])


# ---------------------------------------------------------------------------
# Event-level evaluation
# ---------------------------------------------------------------------------

def _events_in(frame: pd.DataFrame, episodes: pd.DataFrame, horizon_days: int) -> pd.DataFrame:
    ids = set(frame["patient_id"])
    ev = episodes[(episodes["kind"] == "strain_episode") & episodes["patient_id"].isin(ids)].dropna(subset=["event_day"])
    lo = frame["date"].min() + pd.Timedelta(days=horizon_days)
    hi = frame["date"].max() + pd.Timedelta(days=horizon_days)
    return ev[(ev["event_day"] > lo) & (ev["event_day"] <= hi)]


def event_metrics(frame: pd.DataFrame, p: np.ndarray, thr: float, episodes: pd.DataFrame,
                  horizon_days: int = 3, min_lead_days: int = 0) -> dict:
    """Day-level specificity and false alerts per patient-day; event-level sensitivity and
    lead time. An event is caught when any alert fires in the ``horizon_days`` days before
    the event day (and at least ``min_lead_days`` before it)."""
    alert = p >= thr
    y = frame["y72"].to_numpy()
    fa = int((alert & (y == 0)).sum())
    spec = float(((~alert) & (y == 0)).sum() / max((y == 0).sum(), 1))
    ev = _events_in(frame, episodes, horizon_days)
    f = frame[["patient_id", "date"]].assign(alert=alert)
    f = f[f["alert"]]
    by_pid = {pid: g["date"].to_numpy() for pid, g in f.groupby("patient_id")}
    caught, leads = 0, []
    for pid, e in zip(ev["patient_id"], ev["event_day"]):
        dates = by_pid.get(pid)
        if dates is None:
            continue
        lo = (e - pd.Timedelta(days=horizon_days)).to_datetime64()
        hi = (e - pd.Timedelta(days=min_lead_days)).to_datetime64()
        hits = dates[(dates >= lo) & (dates < e.to_datetime64()) & (dates <= hi)]
        if len(hits):
            caught += 1
            leads.append((e.to_datetime64() - hits.min()) / np.timedelta64(1, "h"))
    return {
        "threshold": float(thr), "events": int(len(ev)), "events_caught": int(caught),
        "sensitivity": round(caught / max(len(ev), 1), 3), "specificity": round(spec, 3),
        "false_alerts": fa, "patient_days": int(len(frame)),
        "false_alerts_per_patient_day": round(fa / max(len(frame), 1), 4),
        "median_lead_hours": float(np.median(leads)) if leads else None,
        "alerts_total": int(alert.sum()),
    }


def choose_operating_points(frame: pd.DataFrame, p: np.ndarray, episodes: pd.DataFrame,
                            thr: Thresholds = DEFAULT_THRESHOLDS) -> dict:
    """Urgent = most sensitive threshold within the false-alert budget; watch = the
    threshold catching 90% of events (strictly below urgent)."""
    grid = np.unique(np.quantile(p, np.linspace(0.5, 0.9995, 160)))
    rows = [event_metrics(frame, p, t, episodes) for t in grid]
    within = [r for r in rows if r["false_alerts_per_patient_day"] <= thr.target_false_alerts_per_patient_day]
    urgent = max(within, key=lambda r: (r["sensitivity"], -r["false_alerts_per_patient_day"])) if within else rows[-1]
    cands = [r for r in rows if r["sensitivity"] >= 0.9 and r["threshold"] < urgent["threshold"]]
    watch = max(cands, key=lambda r: r["threshold"]) if cands else event_metrics(frame, p, urgent["threshold"] * 0.5, episodes)
    return {"urgent": urgent, "watch": watch, "curve": rows}


def probability_to_score(p, p_watch: float, p_urgent: float):
    """Monotone piecewise-linear map of the calibrated probability: 0 → 0, p_watch → 30,
    p_urgent → 60, 1 → 100. The tiers are the validated operating points."""
    p = np.asarray(p, dtype=float)
    out = np.where(p <= p_watch, 30 * p / max(p_watch, 1e-6),
          np.where(p <= p_urgent, 30 + 30 * (p - p_watch) / max(p_urgent - p_watch, 1e-6),
                   60 + 40 * (p - p_urgent) / max(1 - p_urgent, 1e-6)))
    out = np.clip(np.round(out), 0, 100)
    return out if out.ndim else float(out)


# ---------------------------------------------------------------------------
# Cross-validated training
# ---------------------------------------------------------------------------

class PlattCalibrator:
    """Smooth monotone calibration: logistic regression on the logit of the raw score.
    Preferred over isotonic here because isotonic plateaus give many patients identical
    probabilities (and therefore identical scores)."""

    def __init__(self):
        self._lr = LogisticRegression(C=1e4, max_iter=1000)

    @staticmethod
    def _logit(p):
        p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)

    def fit(self, raw, y):
        self._lr.fit(self._logit(raw), np.asarray(y))
        return self

    def predict(self, raw):
        return self._lr.predict_proba(self._logit(raw))[:, 1]


@dataclass
class CVResult:
    name: str
    features: list[str]
    oof_raw: np.ndarray
    oof_cal: np.ndarray
    fold_models: list[lgb.Booster]


def cross_validate(frame: pd.DataFrame, features: list[str], folds: list[list[str]], name: str,
                   seed: int = 7) -> CVResult:
    y_all = frame["y72"].to_numpy()
    oof_raw = np.zeros(len(frame))
    oof_cal = np.zeros(len(frame))
    fold_models = []
    pid = frame["patient_id"].to_numpy()
    for k, held in enumerate(folds):
        held_mask = np.isin(pid, held)
        train_ids = [p for f in folds if f is not held for p in f]
        rng = np.random.default_rng(seed + k)
        rng.shuffle(train_ids)
        n_val = max(int(0.15 * len(train_ids)), 10)
        val_ids, tr_ids = train_ids[:n_val], train_ids[n_val:]
        tr_mask, va_mask = np.isin(pid, tr_ids), np.isin(pid, val_ids)
        m = _fit(frame.loc[tr_mask, features], y_all[tr_mask], frame.loc[va_mask, features], y_all[va_mask], seed + k)
        pv = m.predict(frame.loc[va_mask, features], num_iteration=m.best_iteration)
        cal = PlattCalibrator().fit(pv, y_all[va_mask])
        ph = m.predict(frame.loc[held_mask, features], num_iteration=m.best_iteration)
        oof_raw[held_mask] = ph
        oof_cal[held_mask] = cal.predict(ph)
        fold_models.append(m)
    return CVResult(name, features, oof_raw, oof_cal, fold_models)


def _bins(p: np.ndarray, y: np.ndarray, n: int = 8) -> list[dict]:
    qs = np.quantile(p, np.linspace(0, 1, n + 1))
    out = []
    for i in range(n):
        m = (p >= qs[i]) & (p <= qs[i + 1]) if i == n - 1 else (p >= qs[i]) & (p < qs[i + 1])
        if m.sum() == 0:
            continue
        out.append({"p_mean": round(float(p[m].mean()), 4), "obs": round(float(y[m].mean()), 4), "n": int(m.sum())})
    return out


@dataclass
class FusionArtifacts:
    model: lgb.Booster
    bag: list[lgb.Booster]
    calibrator: PlattCalibrator
    features: list[str]
    p_watch: float
    p_urgent: float
    metrics: dict
    ablation: dict
    calibration_bins: list[dict]
    importance: list[dict]
    folds: list[list[str]]
    fold_of: dict = field(default_factory=dict)  # patient_id -> index of the fold model that never saw them
    extra: dict = field(default_factory=dict)


def _summary(frame: pd.DataFrame, cv: CVResult, episodes: pd.DataFrame, thr: Thresholds) -> tuple[dict, dict]:
    y = frame["y72"].to_numpy()
    ops = choose_operating_points(frame, cv.oof_cal, episodes, thr)
    em = ops["urgent"]
    out = {
        "name": cv.name, "auroc": round(float(roc_auc_score(y, cv.oof_raw)), 3),
        "auprc": round(float(average_precision_score(y, cv.oof_raw)), 3),
        "brier": round(float(brier_score_loss(y, np.clip(cv.oof_cal, 0, 1))), 4),
        **{k: em[k] for k in ("sensitivity", "specificity", "false_alerts_per_patient_day", "median_lead_hours", "events", "events_caught", "threshold", "alerts_total")},
        "sensitivity_48h_lead": event_metrics(frame, cv.oof_cal, em["threshold"], episodes, min_lead_days=2)["sensitivity"],
        "watch_point": {k: ops["watch"][k] for k in ("threshold", "sensitivity", "false_alerts_per_patient_day")},
    }
    return out, ops


def train_fusion(frame: pd.DataFrame, episodes: pd.DataFrame, seed: int = 42,
                 thr: Thresholds = DEFAULT_THRESHOLDS, k: int = 5, repeat_seeds: tuple = REPEAT_SEEDS) -> FusionArtifacts:
    folds = patient_folds(frame["patient_id"].tolist(), seed, k)
    y = frame["y72"].to_numpy()

    cv_f = cross_validate(frame, FUSION_FEATURES, folds, "fused")
    cv_w = cross_validate(frame, WEARABLE_FEATURES, folds, "wearable_only")
    cv_wo = cross_validate(frame, WATCH_FEATURES, folds, "watch_only")
    cv_e = cross_validate(frame, EHR_FEATURES, folds, "ehr_only")
    cv_nt = cross_validate(frame, FUSION_NO_TWIN_FEATURES, folds, "fused_no_twin")

    fused_metrics, ops = _summary(frame, cv_f, episodes, thr)
    wearable_metrics, _ = _summary(frame, cv_w, episodes, thr)
    watch_metrics, _ = _summary(frame, cv_wo, episodes, thr)
    ehr_metrics, _ = _summary(frame, cv_e, episodes, thr)
    no_twin_metrics, _ = _summary(frame, cv_nt, episodes, thr)

    # Repeated patient-level CV: same features, fresh patient splits
    variants = {"fused": FUSION_FEATURES, "wearable_only": WEARABLE_FEATURES, "watch_only": WATCH_FEATURES,
                "ehr_only": EHR_FEATURES, "fused_no_twin": FUSION_NO_TWIN_FEATURES}
    first = {"fused": fused_metrics, "wearable_only": wearable_metrics, "watch_only": watch_metrics,
             "ehr_only": ehr_metrics, "fused_no_twin": no_twin_metrics}
    runs = {name: [first[name]] for name in variants}
    for rs in repeat_seeds:
        rfolds = patient_folds(frame["patient_id"].tolist(), rs, k)
        for name, feats in variants.items():
            runs[name].append(_summary(frame, cross_validate(frame, feats, rfolds, name), episodes, thr)[0])
    keys = ("auroc", "auprc", "brier", "sensitivity", "sensitivity_48h_lead", "false_alerts_per_patient_day", "median_lead_hours")
    repeated = {}
    for name, rr in runs.items():
        repeated[name] = {"seeds": [seed, *repeat_seeds]}
        for key in keys:
            vals = [r[key] for r in rr if r.get(key) is not None]
            if vals:
                repeated[name][key] = {"mean": round(float(np.mean(vals)), 3), "min": round(float(np.min(vals)), 3),
                                       "max": round(float(np.max(vals)), 3)}
    wins = sum(a["auroc"] > b["auroc"] for a, b in zip(runs["fused"], runs["fused_no_twin"]))
    repeated["twin_beats_no_twin_auroc"] = f"{wins} of {len(runs['fused'])}"
    wins = sum(a["auroc"] > b["auroc"] for a, b in zip(runs["fused"], runs["wearable_only"]))
    repeated["fused_beats_wearable_auroc"] = f"{wins} of {len(runs['fused'])}"

    ns = frame["ns_state"].to_numpy().astype(float)
    rule_em = event_metrics(frame, ns, 2.0, episodes)
    rule_metrics = {"name": "rule_only", "auroc": round(float(roc_auc_score(y, ns)), 3),
                    "auprc": round(float(average_precision_score(y, ns)), 3), "brier": None,
                    **{k: rule_em[k] for k in ("sensitivity", "specificity", "false_alerts_per_patient_day", "median_lead_hours", "events", "events_caught", "threshold", "alerts_total")},
                    "sensitivity_48h_lead": event_metrics(frame, ns, 2.0, episodes, min_lead_days=2)["sensitivity"]}

    # Confounder analysis at matched 90% sensitivity: how many infection-like windows alert?
    inf = episodes[episodes["kind"] == "infection"]

    def alerts_in_infection(p_, t_):
        f = frame[["patient_id", "date"]].assign(alert=p_ >= t_)
        f = f[f["alert"]]
        by_pid = {pid: g["date"].to_numpy() for pid, g in f.groupby("patient_id")}
        n = 0
        for pid, s, e in zip(inf["patient_id"], inf["start"], inf["end"]):
            d = by_pid.get(pid)
            if d is None:
                continue
            n += int(((d >= s.to_datetime64()) & (d <= (e + pd.Timedelta(days=2)).to_datetime64())).any())
        return n

    def matched(cv: CVResult):
        grid = np.unique(np.quantile(cv.oof_cal, np.linspace(0.3, 0.9995, 220)))
        rows = [event_metrics(frame, cv.oof_cal, t, episodes) for t in grid]
        ok = [r for r in rows if r["sensitivity"] >= 0.9]
        r = max(ok, key=lambda r: r["threshold"]) if ok else rows[0]
        return {"threshold": round(float(r["threshold"]), 4), "sensitivity": r["sensitivity"],
                "false_alerts_per_patient_day": r["false_alerts_per_patient_day"],
                "infection_windows_alerted": alerts_in_infection(cv.oof_cal, r["threshold"])}

    confounder = {"infection_windows": int(len(inf)), "matched_sensitivity_target": 0.9,
                  "fused": matched(cv_f), "wearable_only": matched(cv_w), "watch_only": matched(cv_wo)}

    # Ceiling analysis: what if the static tower were perfect? Use the generator's own
    # log risk multiplier as an oracle prior. The gap between this and the fused model is
    # the most the EHR stream could add on a 72-hour horizon.
    ceiling = None
    if "oracle_prior" in frame.columns:
        cv_o = cross_validate(frame, WEARABLE_FEATURES + TWIN_RECORD_FEATURES + ["oracle_prior"], folds, "wearable_plus_oracle_prior")
        ceiling, _ = _summary(frame, cv_o, episodes, thr)

    # Deployed model: all patients, inner split for early stopping; calibrator from pooled OOF raw
    rng = np.random.default_rng(seed)
    ids = np.array(sorted(set(frame["patient_id"])))
    rng.shuffle(ids)
    n_val = max(int(0.15 * len(ids)), 10)
    va_mask = frame["patient_id"].isin(ids[:n_val]).to_numpy()
    model = _fit(frame.loc[~va_mask, FUSION_FEATURES], y[~va_mask], frame.loc[va_mask, FUSION_FEATURES], y[va_mask], seed=7)
    calibrator = PlattCalibrator().fit(cv_f.oof_raw, y)

    imp = model.feature_importance(importance_type="gain")
    imp = imp / max(imp.sum(), 1)
    importance = sorted([{"name": f, "importance": round(float(v), 4)} for f, v in zip(FUSION_FEATURES, imp)],
                        key=lambda d: -d["importance"])

    return FusionArtifacts(
        model=model, bag=cv_f.fold_models, calibrator=calibrator, features=FUSION_FEATURES,
        p_watch=float(ops["watch"]["threshold"]), p_urgent=float(ops["urgent"]["threshold"]),
        metrics=fused_metrics,
        ablation={"watch_only": watch_metrics, "wearable_only": wearable_metrics, "ehr_only": ehr_metrics,
                  "rule_only": rule_metrics, "fused_no_twin": no_twin_metrics, "confounder": confounder, "ceiling_oracle_prior": ceiling,
                  "repeated": repeated},
        calibration_bins=_bins(cv_f.oof_cal, y), importance=importance, folds=folds,
        fold_of={pid: i for i, fold in enumerate(folds) for pid in fold},
        extra={"n_days": int(len(frame)), "k_folds": k, "best_iteration": int(model.best_iteration or 0),
               "oof_cal": cv_f.oof_cal,
               "operating_curve": [{k_: r[k_] for k_ in ("threshold", "sensitivity", "false_alerts_per_patient_day", "specificity")} for r in ops["curve"]]},
    )


def predict_with_band(arts: FusionArtifacts, X: pd.DataFrame, patient_id: str | None = None) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Returns ``(raw, p, lo, hi)``: raw score, calibrated probability, and a P10 to P90
    calibrated band across the fold models.

    Patients who were in the training cohort are scored by the fold model that never saw
    them (true out-of-fold scoring), so the dashboard shows what a held-out patient would
    get. New patients (not in any fold) are scored by the model trained on everyone."""
    primary = primary_model(arts, patient_id)
    raw = primary.predict(X[arts.features], num_iteration=primary.best_iteration)
    p = arts.calibrator.predict(raw)
    preds = np.stack([arts.calibrator.predict(m.predict(X[arts.features], num_iteration=m.best_iteration)) for m in arts.bag] + [p])
    lo = np.minimum(np.quantile(preds, 0.1, axis=0), p)
    hi = np.maximum(np.quantile(preds, 0.9, axis=0), p)
    return raw, p, lo, hi


def primary_model(arts: FusionArtifacts, patient_id: str | None):
    """The fold model that held this patient out, or the full model for new patients."""
    if patient_id is not None and patient_id in arts.fold_of and arts.fold_of[patient_id] < len(arts.bag):
        return arts.bag[arts.fold_of[patient_id]]
    return arts.model


def score_from_probability(arts: FusionArtifacts, p):
    return probability_to_score(p, arts.p_watch, arts.p_urgent)
