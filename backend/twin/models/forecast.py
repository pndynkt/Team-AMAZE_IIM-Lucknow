"""Quantile forecasts of overnight RHR and morning home SBP for the next three days.

One LightGBM quantile model per (target, horizon, quantile): 2 x 3 x 3 = 18 small
models. They produce the dashed P50 line and the P10 to P90 fan on the twin page, and
their realised coverage on the last seven days is what the "twin accuracy on you" badge
reports. Forecast features are the same leakage-safe matrix as the classifier.
"""

from __future__ import annotations

from dataclasses import dataclass

import lightgbm as lgb
import numpy as np
import pandas as pd

from ..features.build import ALL_FEATURES

# The forecasters are stacked on the classifier: the twin's calibrated 72 h episode
# probability (out-of-fold during training) is an input, so a rising-risk patient gets a
# rising forecast instead of the population's mean reversion.
FORECAST_FEATURES = ALL_FEATURES + ["p_episode"]

TARGETS = {"rhr": "rhr", "sbp": "sbp_home"}
HORIZONS = (1, 2, 3)
QUANTILES = (0.1, 0.5, 0.9)

QPARAMS = dict(objective="quantile", learning_rate=0.05, num_leaves=15, min_data_in_leaf=40,
               feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=5.0, verbose=-1, num_threads=2)


def _shifted_targets(frame: pd.DataFrame) -> pd.DataFrame:
    """Add columns ``<target>_h<h>`` = value at t + h for each patient (NaN where unknown)."""
    f = frame.sort_values(["patient_id", "date"]).copy()
    for name, col in TARGETS.items():
        for h in HORIZONS:
            f[f"{name}_h{h}"] = f.groupby("patient_id")[col].shift(-h)
    return f


@dataclass
class ForecastArtifacts:
    models: dict  # key (target, h, q) -> Booster
    metrics: dict


def train_forecasters(frame: pd.DataFrame, train_ids: list[str], val_ids: list[str], test_ids: list[str]) -> ForecastArtifacts:
    f = _shifted_targets(frame)
    tr, va, te = (f[f["patient_id"].isin(ids)] for ids in (train_ids, val_ids, test_ids))
    models: dict = {}
    metrics: dict = {}
    for name in TARGETS:
        for h in HORIZONS:
            ycol = f"{name}_h{h}"
            trh, vah, teh = tr.dropna(subset=[ycol]), va.dropna(subset=[ycol]), te.dropna(subset=[ycol])
            preds = {}
            for q in QUANTILES:
                params = {**QPARAMS, "alpha": q, "seed": int(q * 100) + h}
                dtr = lgb.Dataset(trh[FORECAST_FEATURES], label=trh[ycol].to_numpy(), free_raw_data=False)
                dva = lgb.Dataset(vah[FORECAST_FEATURES], label=vah[ycol].to_numpy(), reference=dtr, free_raw_data=False)
                m = lgb.train(params, dtr, num_boost_round=400, valid_sets=[dva],
                              callbacks=[lgb.early_stopping(40, verbose=False)])
                models[(name, h, q)] = m
                preds[q] = m.predict(teh[FORECAST_FEATURES], num_iteration=m.best_iteration)
            y = teh[ycol].to_numpy()
            mae = float(np.mean(np.abs(preds[0.5] - y)))
            cov = float(np.mean((y >= preds[0.1]) & (y <= preds[0.9])))
            naive = float(np.nanmean(np.abs(teh[TARGETS[name]].to_numpy() - y)))  # persistence baseline
            metrics[f"{name}_h{h}"] = {"mae": round(mae, 2), "coverage_p10_p90": round(cov, 3),
                                        "persistence_mae": round(naive, 2), "n": int(len(teh))}
    return ForecastArtifacts(models=models, metrics=metrics)


def _with_p(X: pd.DataFrame) -> pd.DataFrame:
    """Runtime frames carry the twin's probability in ``p``; training frames in ``p_episode``."""
    if "p_episode" not in X.columns:
        X = X.copy()
        X["p_episode"] = X["p"] if "p" in X.columns else np.nan
    return X


def forecast_row(arts: ForecastArtifacts, X: pd.DataFrame) -> dict:
    """Forecast from the last row of X. Returns {target: [{h, p10, p50, p90}]}. Quantiles
    are sorted so p10 <= p50 <= p90 even if the models cross."""
    out: dict = {}
    X = _with_p(X)
    for name in TARGETS:
        rows = []
        for h in HORIZONS:
            qs = [float(arts.models[(name, h, q)].predict(X[FORECAST_FEATURES], num_iteration=arts.models[(name, h, q)].best_iteration)[-1]) for q in QUANTILES]
            qs = sorted(qs)
            rows.append({"h": h, "p10": qs[0], "p50": qs[1], "p90": qs[2]})
        out[name] = rows
    return out


def realised_accuracy(arts: ForecastArtifacts, feat: pd.DataFrame, days: int = 7) -> dict:
    """One-day-ahead forecast made on each of the last ``days`` days versus what happened.
    ``feat`` is one patient's full feature frame sorted by date."""
    f = feat.reset_index(drop=True)
    n = len(f)
    if n < 3:
        return {"rhr_mae": None, "sbp_mae": None, "coverage_p10_p90": None, "n": 0, "label": "insufficient"}
    lo_i = max(n - days - 1, 0)
    X = _with_p(f.iloc[lo_i:n - 1])
    errs = {"rhr": [], "sbp": []}
    inside = []
    for name, col in TARGETS.items():
        actual = f[col].iloc[lo_i + 1:n].to_numpy(dtype=float)
        qs = np.sort(np.stack([arts.models[(name, 1, q)].predict(X[FORECAST_FEATURES], num_iteration=arts.models[(name, 1, q)].best_iteration)
                               for q in QUANTILES]), axis=0)
        ok = ~np.isnan(actual)
        errs[name] = list(np.abs(qs[1][ok] - actual[ok]))
        inside += list((qs[0][ok] <= actual[ok]) & (actual[ok] <= qs[2][ok]))
    rhr_mae = float(np.mean(errs["rhr"])) if errs["rhr"] else None
    sbp_mae = float(np.mean(errs["sbp"])) if errs["sbp"] else None
    cov = float(np.mean(inside)) if inside else None
    if cov is None or len(inside) < 4:
        label = "insufficient"
    elif cov >= 0.75 and (rhr_mae or 0) <= 3.0:
        label = "good"
    elif cov >= 0.55:
        label = "fair"
    else:
        label = "poor"
    return {"rhr_mae": round(rhr_mae, 1) if rhr_mae is not None else None,
            "sbp_mae": round(sbp_mae, 1) if sbp_mae is not None else None,
            "coverage_p10_p90": round(cov, 2) if cov is not None else None, "n": len(inside), "label": label}
