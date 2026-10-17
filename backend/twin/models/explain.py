"""Per-alert explanations with SHAP TreeExplainer, rendered in clinical words.

Clinicians in the explainability literature prefer a short ranked list of contributors
with an actionable phrasing over raw SHAP plots, so the API returns the top drivers with
their value and a plain-language label, grouped by stream (wearable or EHR)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap

from ..features.build import ALL_FEATURES, FEATURE_LABELS, FEATURE_GROUP


class Explainer:
    def __init__(self, booster, features: list[str] | None = None):
        self._exp = shap.TreeExplainer(booster)
        self.features = features or ALL_FEATURES

    def explain(self, X: pd.DataFrame, top_k: int = 5) -> dict:
        row = X[self.features].iloc[[-1]]
        vals = np.asarray(self._exp.shap_values(row))
        if vals.ndim == 3:  # (n, features, classes) in some shap versions
            vals = vals[:, :, -1]
        vals = vals[0]
        base = float(np.ravel(self._exp.expected_value)[-1])
        contribs = []
        for f, s in zip(self.features, vals):
            v = row[f].iloc[0]
            if pd.isna(v):
                continue
            contribs.append({"feature": f, "value": round(float(v), 2), "shap": round(float(s), 4),
                             "direction": "up" if s > 0 else "down", "group": FEATURE_GROUP[f],
                             "label": _label(f, float(v))})
        up = sorted([c for c in contribs if c["shap"] > 0], key=lambda c: -c["shap"])[:top_k]
        down = sorted([c for c in contribs if c["shap"] < 0], key=lambda c: c["shap"])[:3]
        return {"contributors": up, "protective": down, "base_log_odds": base}


def _label(feature: str, value: float) -> str:
    tmpl = FEATURE_LABELS.get(feature, feature)
    try:
        if feature in ("sleep_eff", "deep_pct", "wear_pct_28d"):
            return tmpl.format(value=value)
        if feature == "sleep_eff_dev":
            return tmpl.format(value=value)
        if feature == "hrv_unexpl":  # a log-RMSSD residual, shown as a percent change
            return tmpl.format(value=(np.exp(value) - 1) * 100)
        if feature in ("sex_f", "smoker", "diabetes", "ckd", "ihd", "prior_mi", "afib_history", "on_ccb", "on_arb",
                       "on_beta_blocker", "on_diuretic", "on_statin", "on_metformin", "on_aspirin", "family_history_cvd",
                       "hrv_below_swc"):
            return tmpl if value >= 0.5 else f"Not: {tmpl.lower()}"
        return tmpl.format(value=value)
    except (ValueError, KeyError):
        return f"{feature} = {value:.2f}"
