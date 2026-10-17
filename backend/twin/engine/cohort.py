"""Cohort state: the synthetic data, the trained artifacts, and a per-patient cache of
features and scores that is invalidated when new observations arrive or thresholds change."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import joblib
import numpy as np
import pandas as pd

from ..config import ARTIFACT_DIR, DATA_DIR, Thresholds, DEFAULT_THRESHOLDS
from ..features.build import dynamic_features, static_vector, labels_for, add_twin_features, ALL_FEATURES
from ..models.fusion import FusionArtifacts, predict_with_band, probability_to_score, primary_model
from ..models.forecast import ForecastArtifacts, forecast_row, realised_accuracy
from ..models.explain import Explainer
from ..models.nightsignal import STATE_NAMES
from ..models import physiology as PH


@dataclass
class ScoredPatient:
    pid: str
    feat: pd.DataFrame  # full feature frame (one row per day) with p, lo, hi, score, tier
    nights_available: int
    confidence: str
    accuracy: dict


def nominal_now(as_of: date) -> datetime:
    """The demo clock's 'now': 07:30 IST on the cohort's as_of date, after overnight sync."""
    return datetime(as_of.year, as_of.month, as_of.day, 7, 30)


class Cohort:
    def __init__(self, data_dir=DATA_DIR, artifact_dir=ARTIFACT_DIR):
        self.ehr = pd.read_parquet(data_dir / "ehr.parquet").set_index("patient_id", drop=False)
        daily = pd.read_parquet(data_dir / "daily.parquet")
        daily["date"] = pd.to_datetime(daily["date"])
        self.daily: dict[str, pd.DataFrame] = {pid: g.sort_values("date").reset_index(drop=True) for pid, g in daily.groupby("patient_id")}
        self.episodes = pd.read_parquet(data_dir / "episodes.parquet")
        fresh = pd.read_parquet(data_dir / "freshness.parquet")
        self.freshness: dict[str, datetime] = {r.patient_id: pd.Timestamp(r.last_sample_at).to_pydatetime() for r in fresh.itertuples()}
        with open(data_dir / "cohort.json") as f:
            self.cfg = json.load(f)
        self.as_of = date.fromisoformat(self.cfg["as_of"])
        self.seed = int(self.cfg["seed"])
        self.horizon_days = int(self.cfg["horizon_days"])
        self.fhir_dir = data_dir / "fhir"

        self.fusion: FusionArtifacts = joblib.load(artifact_dir / "fusion.pkl")
        self.forecast: ForecastArtifacts = joblib.load(artifact_dir / "forecast.pkl")
        with open(artifact_dir / "model_card.json") as f:
            self.model_card = json.load(f)
        self._explainers: dict[int, Explainer] = {}
        # Personal physiology engine: cohort priors learned at training time, truth for validation
        phys_path = artifact_dir / "physiology.json"
        if phys_path.exists():
            with open(phys_path) as f:
                pj = json.load(f)
            self.phys_priors = PH.Priors(pj["priors"]["mu"], pj["priors"]["tau2"])
            self.phys_validation = pj.get("validation")
        else:  # pragma: no cover
            self.phys_priors = PH.Priors({k: 0.0 for k in PH.PAIRS}, {k: 0.0 for k in PH.PAIRS})
            self.phys_validation = None
        truth_path = data_dir / "physiology_truth.parquet"
        self.phys_truth = pd.read_parquet(truth_path).set_index("patient_id") if truth_path.exists() else None
        self._phys_cache: dict[str, dict] = {}

        self.thresholds = Thresholds(**{**DEFAULT_THRESHOLDS.to_dict()})
        self._cache: dict[str, ScoredPatient] = {}
        self._lock = threading.RLock()
        # Extra observations ingested at runtime, per patient (list of dicts)
        self.ingested: dict[str, list[dict]] = {}
        # Patients who opted out of AI predictions
        self.opted_out: set[str] = set()

    # ------------------------------------------------------------------
    @property
    def patient_ids(self) -> list[str]:
        return list(self.ehr.index)

    def set_thresholds(self, thr: Thresholds) -> None:
        with self._lock:
            self.thresholds = thr
            self._cache.clear()
            self._phys_cache.clear()

    def invalidate(self, pid: str) -> None:
        with self._lock:
            self._cache.pop(pid, None)
            self._phys_cache.pop(pid, None)

    # ------------------------------------------------------------------
    def daily_for(self, pid: str) -> pd.DataFrame:
        """Daily frame plus any runtime-ingested aggregates merged in."""
        d = self.daily[pid]
        extra = self.ingested.get(pid)
        if not extra:
            return d
        d = d.copy()
        for row in extra:
            dt = pd.Timestamp(row["date"])
            if (d["date"] == dt).any():
                for k, v in row.items():
                    if k != "date" and v is not None:
                        d.loc[d["date"] == dt, k] = v
                d.loc[d["date"] == dt, "missing"] = False
            else:
                new = {c: np.nan for c in d.columns}
                new.update({"patient_id": pid, "date": dt, "missing": False, "event_day": False})
                new.update({k: v for k, v in row.items() if k != "date"})
                d = pd.concat([d, pd.DataFrame([new])], ignore_index=True).sort_values("date").reset_index(drop=True)
        return d

    def scored(self, pid: str) -> ScoredPatient:
        with self._lock:
            if pid in self._cache:
                return self._cache[pid]
            d = self.daily_for(pid)
            f = dynamic_features(d, self.thresholds)
            for k, v in static_vector(self.ehr.loc[pid]).items():
                f[k] = v
            ev = self.episodes[(self.episodes["kind"] == "strain_episode") & (self.episodes["patient_id"] == pid)]["event_day"].dropna().tolist()
            f["y72"] = labels_for(f["date"], ev, self.horizon_days)
            f = add_twin_features(f, self.phys_priors)
            raw, p, lo, hi = predict_with_band(self.fusion, f, pid)
            f["p"], f["p_lo"], f["p_hi"] = p, lo, hi
            f["score"] = probability_to_score(p, self.fusion.p_watch, self.fusion.p_urgent)
            nights = int(f["rhr"].notna().sum())
            acc = realised_accuracy(self.forecast, f, days=7)
            conf = self._confidence(nights, acc)
            f["tier"] = [self.tier_for(s, int(ns), conf) for s, ns in zip(f["score"], f["ns_state"])]
            sp = ScoredPatient(pid, f, nights, conf, acc)
            self._cache[pid] = sp
            return sp

    @staticmethod
    def _confidence(nights: int, acc: dict) -> str:
        cov = acc.get("coverage_p10_p90")
        if nights < 14 or (cov is not None and cov < 0.6):
            return "low"
        if nights < 28 or (cov is not None and cov < 0.75):
            return "medium"
        return "high"

    def tier_for(self, score: float, ns_state: int, confidence: str) -> str:
        thr = self.thresholds
        if score >= thr.urgent:
            tier = "urgent"
        elif score >= thr.watch:
            tier = "watch"
        else:
            tier = "low"
        if ns_state >= 2 and tier == "low":
            tier = "watch"
        order = {"low": 0, "medium": 1, "high": 2}
        if tier == "urgent" and order[confidence] < order[thr.min_confidence_for_urgent]:
            tier = "watch"
        return tier

    # ------------------------------------------------------------------
    def current(self, pid: str) -> dict:
        """Today's row as a plain dict (last available day)."""
        sp = self.scored(pid)
        row = sp.feat.iloc[-1]
        opted = pid in self.opted_out
        return {
            "risk_score": None if opted else int(row["score"]),
            "tier": "opted_out" if opted else row["tier"],
            "ns_state": STATE_NAMES[int(row["ns_state"])],
            "probability_72h": None if opted else round(float(row["p"]), 3),
            "probability_band": None if opted else [round(float(row["p_lo"]), 3), round(float(row["p_hi"]), 3)],
            "as_of": row["date"].date().isoformat(),
            "confidence": sp.confidence,
        }

    def freshness_for(self, pid: str) -> dict:
        last = self.freshness[pid]
        now = nominal_now(self.as_of)
        mins = int((now - last).total_seconds() // 60)
        label = "fresh" if mins <= 90 else ("stale" if mins <= 24 * 60 else "offline")
        return {"last_sample_at": last.isoformat(timespec="minutes") + "+05:30", "minutes_ago": max(mins, 0), "label": label}

    def touch_freshness(self, pid: str) -> None:
        self.freshness[pid] = nominal_now(self.as_of)

    def forecast_for(self, pid: str) -> dict:
        sp = self.scored(pid)
        return forecast_row(self.forecast, sp.feat)

    def explainer_for(self, pid: str) -> Explainer:
        """SHAP explainer for the model that actually scored this patient."""
        m = primary_model(self.fusion, pid)
        key = id(m)
        if key not in self._explainers:
            self._explainers[key] = Explainer(m, self.fusion.features)
        return self._explainers[key]

    def explain_for(self, pid: str) -> dict:
        sp = self.scored(pid)
        return self.explainer_for(pid).explain(sp.feat)

    # ------------------------------------------------------------------
    def physiology_for(self, pid: str, reveal: bool = False) -> dict:
        """This person's learned response slopes (refit from their current history, so new
        nights from the companion app update the twin)."""
        with self._lock:
            if pid not in self._phys_cache:
                r = self.ehr.loc[pid]
                self._phys_cache[pid] = PH.personal_view(self.scored(pid).feat, self.phys_priors, r["first_name"], r["sex"])
            view = dict(self._phys_cache[pid])
        if reveal and self.phys_truth is not None and pid in self.phys_truth.index:
            view["validation"] = {"true": {k: float(self.phys_truth.loc[pid, k]) for k in PH.PAIRS}}
        return view
