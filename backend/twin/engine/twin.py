"""View builders for one patient's twin: summary, timeline, intraday, forecast, explanation,
what-if simulation and the patient-facing view. Shapes follow docs/API.md exactly."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..config import MODEL_VERSION
from ..data.ehr import SNOMED, MEDS
from ..data.wearables import generate_intraday_hr
from ..features.build import ALL_FEATURES
from ..models.fusion import predict_with_band, probability_to_score
from ..models.forecast import forecast_row
from ..models.nightsignal import STATE_NAMES
from ..models.risk_scores import framingham_10y_risk, risk_label
from ..models import physiology as PH
from .cohort import Cohort
from ..store.db import DB

CONTACT_POOL = [
    ("Arjun", "Son"), ("Priya", "Daughter"), ("Ravi", "Husband"), ("Sunita", "Wife"), ("Kiran", "Brother"),
    ("Meena", "Sister"), ("Deepak", "Neighbour"), ("Anita", "Daughter-in-law"),
]


def _f(x, nd=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def _dbp(row) -> float:
    """Diastolic reading that goes with the latest systolic: today's when there is one, else the 7-day mean."""
    v = row.get("dbp_home")
    return float(v) if v is not None and pd.notna(v) and pd.notna(row.get("sbp_home")) else float(row["dbp_7d_mean"])


class TwinService:
    def __init__(self, cohort: Cohort, db: DB):
        self.c = cohort
        self.db = db

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------
    def _ehr(self, pid: str) -> pd.Series:
        return self.c.ehr.loc[pid]

    def conditions(self, pid: str) -> list[dict]:
        r = self._ehr(pid)
        out = [{"code": SNOMED["hypertension"][0], "system": "SNOMED", "display": SNOMED["hypertension"][1], "onset": r["hypertension_onset"]}]
        for key, flag in (("t2d", r["diabetes"]), ("ckd", r["ckd"]), ("ihd", r["ihd"]), ("prior_mi", r["prior_mi"]), ("afib", r["afib_history"])):
            if flag:
                out.append({"code": SNOMED[key][0], "system": "SNOMED", "display": SNOMED[key][1], "onset": r["last_clinic_visit"]})
        if r["ldl"] > 130:
            out.append({"code": SNOMED["dyslipidemia"][0], "system": "SNOMED", "display": SNOMED["dyslipidemia"][1], "onset": r["last_clinic_visit"]})
        return out

    def medications(self, pid: str) -> list[dict]:
        r = self._ehr(pid)
        out = []
        for key, flag in (("amlodipine", r["on_ccb"]), ("telmisartan", r["on_arb"]), ("metoprolol", r["on_beta_blocker"]),
                          ("hctz", r["on_diuretic"]), ("atorvastatin", r["on_statin"]), ("metformin", r["on_metformin"]), ("aspirin", r["on_aspirin"])):
            if flag:
                name, cls, _ = MEDS[key]
                out.append({"name": name, "class": cls, "adherence_30d_pct": int(r["adherence_pct"])})
        return out

    def labs(self, pid: str) -> list[dict]:
        r = self._ehr(pid)
        d = r["last_clinic_visit"]
        def flag(v, lo=None, hi=None):
            if hi is not None and v > hi:
                return "high"
            if lo is not None and v < lo:
                return "low"
            return "normal"
        return [
            {"name": "HbA1c", "loinc": "4548-4", "value": _f(r["hba1c"]), "unit": "%", "date": d, "flag": flag(r["hba1c"], hi=6.4)},
            {"name": "LDL cholesterol", "loinc": "13457-7", "value": _f(r["ldl"], 0), "unit": "mg/dL", "date": d, "flag": flag(r["ldl"], hi=130)},
            {"name": "HDL cholesterol", "loinc": "2085-9", "value": _f(r["hdl"], 0), "unit": "mg/dL", "date": d, "flag": flag(r["hdl"], lo=40)},
            {"name": "Total cholesterol", "loinc": "2093-3", "value": _f(r["tc"], 0), "unit": "mg/dL", "date": d, "flag": flag(r["tc"], hi=200)},
            {"name": "Triglycerides", "loinc": "2571-8", "value": _f(r["tg"], 0), "unit": "mg/dL", "date": d, "flag": flag(r["tg"], hi=150)},
            {"name": "eGFR", "loinc": "33914-3", "value": _f(r["egfr"], 0), "unit": "mL/min/1.73m2", "date": d, "flag": flag(r["egfr"], lo=60)},
        ]

    def static_risk(self, pid: str) -> dict:
        r = self._ehr(pid)
        pct = framingham_10y_risk(r["age"], r["sex"], r["tc"], r["hdl"], r["sbp_clinic"], bool(r["n_bp_meds"]), bool(r["smoker"]), bool(r["diabetes"]))
        return {"framingham_10y_pct": pct, "label": risk_label(pct),
                "south_asian_note": "Framingham under-estimates risk in South Asians; WHO 2019 SEAR chart planned."}

    def device(self, pid: str) -> dict:
        r = self._ehr(pid)
        src = "simulated"
        last_ingest = self.db.ingest_sources(pid)
        if last_ingest:
            src = last_ingest[0]["source"]
        return {"brand": r["device_brand"], "model": r["device_model"], "source": src, "simulated": src == "simulated",
                "sync_interval": r["sync_interval"]}

    def contacts(self, pid: str) -> list[dict]:
        idx = int(pid.split("-")[-1])
        out = []
        for i in range(2):
            name, rel = CONTACT_POOL[(idx + i * 3) % len(CONTACT_POOL)]
            out.append({"id": f"C{i + 1}", "name": f"{name} {self._ehr(pid)['name'].split()[-1]}", "relation": rel,
                        "phone_masked": f"+91 9{(idx * 7 + i) % 9}XXX XX{(idx * 13 + i * 5) % 100:02d}{(idx * 3) % 10}",
                        "channels": ["sms", "whatsapp", "voice"] if i == 0 else ["sms", "voice"],
                        "consented_at": "2026-09-01T10:00:00+05:30"})
        return out

    def consent(self, pid: str) -> dict:
        doc = self.db.get_consent(pid)
        if doc:
            return doc
        return {"ehr": True, "wearable": True, "ai_predictions": True, "emergency_contacts": True, "updated_at": "2026-09-01T10:00:00+05:30"}

    def clinician(self, pid: str) -> dict:
        return {"name": self._ehr(pid)["clinician"], "role": "Physician", "sla_minutes": 60}

    # ------------------------------------------------------------------
    # Top reason (plain words) from the explainer
    # ------------------------------------------------------------------
    def top_reason(self, pid: str) -> str:
        try:
            ex = self.c.explain_for(pid)
            if ex["contributors"]:
                return ex["contributors"][0]["label"]
        except Exception:  # pragma: no cover
            pass
        return "No strong driver"

    # ------------------------------------------------------------------
    # Triage row
    # ------------------------------------------------------------------
    def triage_row(self, pid: str, open_alert: dict | None, escalation: dict | None) -> dict:
        r = self._ehr(pid)
        sp = self.c.scored(pid)
        f = sp.feat
        cur = self.c.current(pid)
        last7 = f.tail(7)
        prev = f.iloc[-8]["score"] if len(f) >= 8 else f.iloc[0]["score"]
        def spark(col, nd=0):
            return [_f(v, nd) for v in last7[col].tolist()]
        return {
            "id": pid, "name": r["name"], "age": int(r["age"]), "sex": r["sex"], "city": r["city"],
            "conditions": [c["display"] for c in self.conditions(pid)][:3],
            "device": {k: self.device(pid)[k] for k in ("brand", "model", "source", "simulated")},
            "risk_score": cur["risk_score"], "tier": cur["tier"], "ns_state": cur["ns_state"],
            "risk_delta_7d": None if cur["risk_score"] is None else int(cur["risk_score"] - prev),
            "top_reason": self.top_reason(pid) if cur["tier"] in ("watch", "urgent") else "Within personal baseline",
            "freshness": self.c.freshness_for(pid),
            "wear_time_pct_7d": int(round(100 * (1 - last7["missing"].mean()))),
            "sparklines": {"rhr": spark("rhr"), "hrv": spark("rmssd"), "sbp": spark("sbp_last")},
            "open_alert_id": open_alert["id"] if open_alert else None,
            "escalation_status": escalation["state"] if escalation else None,
            "confidence": sp.confidence,
        }

    # ------------------------------------------------------------------
    # Patient detail
    # ------------------------------------------------------------------
    def patient_detail(self, pid: str) -> dict:
        r = self._ehr(pid)
        sp = self.c.scored(pid)
        f = sp.feat
        last = f.iloc[-1]
        fam = ["Father: myocardial infarction at 61"] if r["family_history_cvd"] else []
        return {
            "id": pid, "name": r["name"], "age": int(r["age"]), "sex": r["sex"], "city": r["city"], "state": r["state"],
            "abha_masked": r["abha_masked"],
            "consent": self.consent(pid),
            "ehr": {
                "conditions": self.conditions(pid), "medications": self.medications(pid), "labs": self.labs(pid),
                "vitals_clinic": {"sbp": int(r["sbp_clinic"]), "dbp": int(r["dbp_clinic"]), "bmi": _f(r["bmi"]), "date": r["last_clinic_visit"]},
                "genetics": {"polygenic_risk_tier": r["genetic_risk_tier"], "note": "Simulated CAD polygenic risk tier (synthetic)"},
                "family_history": fam, "smoker": bool(r["smoker"]), "diabetes": bool(r["diabetes"]), "ckd": bool(r["ckd"]), "prior_mi": bool(r["prior_mi"]),
            },
            "static_risk": self.static_risk(pid),
            "device": self.device(pid),
            "baselines": {"rhr_28d_median": _f(last["rhr_base28"]), "lnrmssd_60d_mean": _f(last["hrv_60d"], 2), "lnrmssd_swc": _f(last["hrv_swc"], 3),
                          "sbp_28d_mean": _f(last["sbp_28d_mean"]), "nights_available": sp.nights_available},
            "current": self.c.current(pid),
            "emergency_contacts": self.contacts(pid),
            "clinician": self.clinician(pid),
            "freshness": self.c.freshness_for(pid),
        }

    # ------------------------------------------------------------------
    # Timeline
    # ------------------------------------------------------------------
    def timeline(self, pid: str, days: int = 30, reveal: bool = False) -> dict:
        sp = self.c.scored(pid)
        f = sp.feat.tail(days)
        opted = pid in self.c.opted_out
        rows = []
        ann = self.db.annotations(pid)
        ann_by_date: dict[str, list[dict]] = {}
        for a in ann:
            ann_by_date.setdefault(a["date"], []).append(a)
        for _, row in f.iterrows():
            ds = row["date"].date().isoformat()
            rows.append({
                "date": ds, "rhr": _f(row["rhr"]), "lnrmssd": _f(row["lnrmssd"], 2), "rmssd": _f(row["rmssd"]),
                "sleep_min": _f(row["sleep_min"], 0), "sleep_eff": _f(row["sleep_eff"], 2), "steps": _f(row["steps"], 0),
                "resp_rate": _f(row["resp_rate"]), "spo2": _f(row["spo2"]), "sbp_home": _f(row["sbp_home"], 0), "dbp_home": _f(row["dbp_home"], 0),
                "ns_state": STATE_NAMES[int(row["ns_state"])],
                "risk_score": None if opted else int(row["score"]), "tier": "opted_out" if opted else row["tier"],
                "missing": bool(row["missing"]), "events": [a["kind"] for a in ann_by_date.get(ds, [])],
            })
        last = sp.feat.iloc[-1]
        band = {
            "rhr": [_f(last["rhr_base28"] - self.c.thresholds.ns_rhr_delta_yellow), _f(last["rhr_base28"] + self.c.thresholds.ns_rhr_delta_yellow)],
            "lnrmssd": [_f(last["hrv_60d"] - last["hrv_swc"], 2), _f(last["hrv_60d"] + last["hrv_swc"], 2)],
            "sbp": [_f(last["sbp_28d_mean"] - 6, 0), _f(last["sbp_28d_mean"] + 6, 0)],
        }
        out = {"id": pid, "days": days, "rows": rows, "baseline_band": band, "annotations": ann}
        if reveal:
            ep = self.c.episodes[(self.c.episodes["patient_id"] == pid)]
            labels = []
            for e in ep.itertuples():
                if e.kind == "strain_episode":
                    labels.append({"date": pd.Timestamp(e.event_day).date().isoformat(), "kind": "strain_episode",
                                   "label": f"Synthetic ground truth: strain episode ({e.subtype}) event day", "visible_to_clinician": False,
                                   "start": pd.Timestamp(e.start).date().isoformat()})
                elif e.kind in ("infection", "missed_dose", "party", "travel", "device_off"):
                    labels.append({"date": pd.Timestamp(e.start).date().isoformat(), "kind": e.kind,
                                   "label": f"Synthetic confounder: {e.kind.replace('_', ' ')}", "visible_to_clinician": False,
                                   "end": pd.Timestamp(e.end).date().isoformat()})
            out["labels"] = labels
        return out

    def intraday(self, pid: str, day: date, acute: str | None = None) -> dict:
        d = self.c.daily_for(pid)
        row = d[d["date"] == pd.Timestamp(day)]
        if row.empty:
            raise KeyError(f"no data for {day}")
        row = row.iloc[0]
        rhr = float(row["rhr"]) if pd.notna(row["rhr"]) else float(d["rhr"].dropna().tail(7).mean())
        steps = float(row["steps"]) if pd.notna(row["steps"]) else 4000.0
        samples = generate_intraday_hr(pid, day, rhr, steps, self.c.seed, acute=acute)
        partial = False
        if day == self.c.as_of:
            last = self.c.freshness[pid].isoformat()
            samples = [s for s in samples if s["t"][:19] <= last[:19]] or samples[:1]
            partial = True
        return {"id": pid, "date": day.isoformat(), "interval_min": 5, "source": "simulated", "simulated": True,
                "samples": samples, "overnight_window": ["00:00", "07:00"], "overnight_rhr": round(rhr, 1), "partial": partial}

    # ------------------------------------------------------------------
    # Forecast
    # ------------------------------------------------------------------
    @staticmethod
    def _per_day(p: float, days: int = 3) -> list[float]:
        """Constant-hazard split of a 72 h probability into cumulative per-day probabilities."""
        p = min(max(p, 0.0), 0.999)
        h = 1 - (1 - p) ** (1 / days)
        return [round(1 - (1 - h) ** d, 3) for d in range(1, days + 1)]

    def forecast(self, pid: str, feat: pd.DataFrame | None = None) -> dict:
        sp = self.c.scored(pid)
        f = feat if feat is not None else sp.feat
        last = f.iloc[-1]
        fc = forecast_row(self.c.forecast, f)
        as_of = last["date"].date()
        hist = [{"date": r["date"].date().isoformat(), "rhr": _f(r["rhr"]), "sbp": _f(r["sbp_last"], 0)} for _, r in f.tail(7).iterrows()]
        p, lo, hi = float(last["p"]), float(last["p_lo"]), float(last["p_hi"])
        per = self._per_day(p)
        per_lo, per_hi = self._per_day(lo), self._per_day(hi)
        return {
            "id": pid, "as_of": as_of.isoformat(), "horizon_days": 3, "history": hist,
            "rhr": [{"date": (as_of + timedelta(days=r["h"])).isoformat(), "p10": round(r["p10"], 1), "p50": round(r["p50"], 1), "p90": round(r["p90"], 1)} for r in fc["rhr"]],
            "sbp": [{"date": (as_of + timedelta(days=r["h"])).isoformat(), "p10": round(r["p10"]), "p50": round(r["p50"]), "p90": round(r["p90"])} for r in fc["sbp"]],
            "episode_probability": [{"date": (as_of + timedelta(days=i + 1)).isoformat(), "p": per[i], "band": [per_lo[i], per_hi[i]]} for i in range(3)],
            "probability_72h": round(p, 3), "band_72h": [round(lo, 3), round(hi, 3)],
            "twin_accuracy_7d": sp.accuracy, "confidence": sp.confidence,
        }

    # ------------------------------------------------------------------
    # Explain
    # ------------------------------------------------------------------
    def explain(self, pid: str) -> dict:
        sp = self.c.scored(pid)
        f = sp.feat
        last = f.iloc[-1]
        ex = self.c.explain_for(pid)
        rule = {"ns_state": STATE_NAMES[int(last["ns_state"])],
                "rule": f"Overnight RHR ≥ +{self.c.thresholds.ns_rhr_delta_red:g} bpm above 28-day median for {self.c.thresholds.ns_consecutive_nights} consecutive nights, or ≥ +{self.c.thresholds.ns_rhr_delta_yellow:g} for three",
                "days_in_state": int(last["ns_days"])}
        n_hr = int(f["rhr"].tail(28).notna().sum())
        n_hrv = int(f["lnrmssd"].tail(28).notna().sum())
        n_bp = int(f["sbp_home"].tail(28).notna().sum())
        stale = []
        if last["sbp_days_since"] >= 4:
            stale.append(f"No home BP reading for {int(last['sbp_days_since'])} days")
        if last["missing_7d"] >= 3:
            stale.append(f"{int(last['missing_7d'])} missing nights in the last 7")
        return {
            "id": pid, "as_of": last["date"].date().isoformat(), "probability_72h": round(float(last["p"]), 3),
            "base_rate": round(float(self.c.model_card["data"]["event_rate_days"]), 4),
            "contributors": ex["contributors"], "protective": ex["protective"], "rule_state": rule,
            "model_version": MODEL_VERSION,
            "inputs_used": [f"{n_hr} nights of HR (28-day window)", f"{n_hrv} nights of HRV", f"{n_bp} home BP readings",
                            f"EHR: {len(self.conditions(pid))} conditions, {len(self.medications(pid))} medications, {len(self.labs(pid))} labs"],
            "stale_inputs": stale,
        }

    # ------------------------------------------------------------------
    # What-if
    # ------------------------------------------------------------------
    def simulate(self, pid: str, levers: dict) -> dict:
        """What-if on the person's own physiology. Walking and sleep use the slopes the
        personal physiology engine learned for this person (shown next to the cohort
        average); medicine adherence, salt and alcohol use population effect sizes because
        the twin has no personal data on them yet."""
        sp = self.c.scored(pid)
        base_f = sp.feat
        base_fc = self.forecast(pid)
        phys = self.c.physiology_for(pid)
        mine = phys["slopes"]
        pop = self.c.phys_priors.mu
        f = base_f.copy()
        last_idx = f.index[-1]
        first = self._ehr(pid)["first_name"]
        applied = []
        d_rhr = d_sbp = d_hrv_pct = d_sleep = 0.0
        walk = float(levers.get("walk_minutes_per_day") or 0)
        if walk > 0:
            me_eff = PH.lever_effects(mine, walk_minutes=walk)
            co_eff = PH.lever_effects(pop, walk_minutes=walk)
            d_rhr += me_eff["rhr"]; d_sbp += me_eff["sbp"]
            applied.append({"lever": "walk_minutes_per_day", "value": walk, "personalised": True,
                            "personal_effect": {"sbp": round(me_eff["sbp"], 1), "rhr": round(me_eff["rhr"], 1)},
                            "cohort_effect": {"sbp": round(co_eff["sbp"], 1), "rhr": round(co_eff["rhr"], 1)},
                            "effect": f"About {walk * PH.STEPS_PER_MINUTE:,.0f} more steps a day: morning BP {me_eff['sbp']:+.1f} mmHg for {first} (most people {co_eff['sbp']:+.1f}), night heart rate {me_eff['rhr']:+.1f} bpm"})
        sleep = float(levers.get("sleep_extra_hours") or 0)
        if sleep > 0:
            me_eff = PH.lever_effects(mine, sleep_hours=sleep)
            co_eff = PH.lever_effects(pop, sleep_hours=sleep)
            d_rhr += me_eff["rhr"]; d_hrv_pct += me_eff["hrv_pct"]; d_sleep += 60 * sleep
            applied.append({"lever": "sleep_extra_hours", "value": sleep, "personalised": True,
                            "personal_effect": {"rhr": round(me_eff["rhr"], 1), "hrv_pct": round(me_eff["hrv_pct"], 1)},
                            "cohort_effect": {"rhr": round(co_eff["rhr"], 1), "hrv_pct": round(co_eff["hrv_pct"], 1)},
                            "effect": f"{60 * sleep:.0f} more minutes of sleep: night heart rate {me_eff['rhr']:+.1f} bpm for {first} (most people {co_eff['rhr']:+.1f}), HRV {me_eff['hrv_pct']:+.0f}%"})
        adh = levers.get("bp_med_adherence_pct")
        cur_adh = float(f.loc[last_idx, "adherence_pct"])
        if adh is not None and float(adh) > cur_adh:
            gain = -(float(adh) - cur_adh) / 100 * 8
            d_sbp += gain
            f.loc[last_idx, "adherence_pct"] = float(adh)
            applied.append({"lever": "bp_med_adherence_pct", "value": float(adh), "personalised": False,
                            "personal_effect": {"sbp": round(gain, 1)}, "cohort_effect": {"sbp": round(gain, 1)},
                            "effect": f"Every dose taken: morning BP {gain:+.1f} mmHg (population estimate)"})
        if levers.get("sodium_reduction"):
            d_sbp -= 2.0
            applied.append({"lever": "sodium_reduction", "value": True, "personalised": False,
                            "personal_effect": {"sbp": -2.0}, "cohort_effect": {"sbp": -2.0}, "effect": "Less salt: morning BP -2 mmHg over 3 days (population estimate)"})
        if levers.get("alcohol_free"):
            d_rhr -= 1.0; d_hrv_pct += 3.0; d_sbp -= 2.0
            applied.append({"lever": "alcohol_free", "value": True, "personalised": False,
                            "personal_effect": {"rhr": -1.0, "sbp": -2.0, "hrv_pct": 3.0}, "cohort_effect": {"rhr": -1.0, "sbp": -2.0, "hrv_pct": 3.0},
                            "effect": "No alcohol: night heart rate -1 bpm, HRV +3%, morning BP -2 mmHg (population estimate)"})

        # Re-score the 72 h risk through the causes the twin models, not the symptoms. A week
        # of short sleep and low activity raises the chance that strain starts, and missed doses
        # raise it too; tonight's heart rate, BP trend and step count are symptoms of strain
        # already under way, so editing them would only hide it. Vitals move separately, by the
        # person's own slopes (forecast fans below).
        hist = base_f["steps"].tail(60).dropna()
        usual_steps = float(hist.median()) if len(hist) else 5000.0
        sd_log = float(np.log(hist.clip(lower=200)).std()) if len(hist) > 10 else 0.35
        d_act_z = float(np.log1p(walk * PH.STEPS_PER_MINUTE / max(usual_steps, 500.0))) / max(sd_log, 0.1) if walk > 0 else 0.0

        def causes(frame: pd.DataFrame) -> pd.DataFrame:
            g = frame.copy()
            g["sleep_debt_7d"] = g["sleep_debt_7d"] - d_sleep / 60.0
            g["activity_7d_z"] = g["activity_7d_z"] + d_act_z
            if adh is not None and float(adh) > cur_adh:
                g["adherence_pct"] = float(adh)
            return g

        f = causes(f)
        # An ordinary week: the person's last 60 scored days outside any warning. This is the
        # part of risk that habits can change, even while an episode is under way.
        calm = base_f.tail(60)
        calm = calm[calm["ns_state"].fillna(0) < 2] if "ns_state" in calm else calm
        usual = None
        if len(calm) >= 10:
            _, p0, _, _ = predict_with_band(self.c.fusion, calm, pid)
            _, p1, _, _ = predict_with_band(self.c.fusion, causes(calm), pid)
            u0, u1 = float(np.median(p0)), float(np.median(p1))
            rel = u1 / u0 - 1 if u0 > 0 else 0.0
            fmt = lambda x: f"{x * 100:.2f}%" if x < 0.01 else f"{x * 100:.1f}%"  # noqa: E731
            plain = (f"On an ordinary week, {first}'s chance of a strain episode would stay about the same ({fmt(u0)})." if abs(rel) < 0.03
                     else f"On an ordinary week, {first}'s chance of a strain episode would go from {fmt(u0)} to {fmt(u1)} ({rel * 100:+.0f}%).")
            usual = {"baseline": round(u0, 4), "scenario": round(u1, 4), "relative_change": round(rel, 3), "plain": plain}
        raw, p, lo, hi = predict_with_band(self.c.fusion, f.iloc[[-1]], pid)

        # Forecast fans move by the person's own effect: half on day 1, full from day 2
        ramp = (0.5, 1.0, 1.0)
        def shift(rows, delta, nd):
            return [{**r, **{q: round(r[q] + delta * ramp[i], nd) for q in ("p10", "p50", "p90")}} for i, r in enumerate(rows)]
        sc_rhr = shift(base_fc["rhr"], d_rhr, 1)
        sc_sbp = shift(base_fc["sbp"], d_sbp, 0)
        base_p = float(base_f.iloc[-1]["p"])
        return {
            "personalised": True,
            "baseline": {"probability_72h": round(base_p, 3), "band": base_fc["band_72h"],
                         "sbp_p50_day3": base_fc["sbp"][-1]["p50"], "rhr_p50_day3": base_fc["rhr"][-1]["p50"]},
            "scenario": {"probability_72h": round(float(p[0]), 3), "band": [round(float(lo[0]), 3), round(float(hi[0]), 3)],
                         "sbp_p50_day3": sc_sbp[-1]["p50"], "rhr_p50_day3": sc_rhr[-1]["p50"]},
            "delta": {"probability_72h": round(float(p[0]) - base_p, 3),
                      "sbp_p50_day3": round(sc_sbp[-1]["p50"] - base_fc["sbp"][-1]["p50"], 1),
                      "rhr_p50_day3": round(sc_rhr[-1]["p50"] - base_fc["rhr"][-1]["p50"], 1)},
            "usual_week": usual,
            "levers_applied": applied, "rhr": sc_rhr, "sbp": sc_sbp,
            "best_lever": phys["best_lever"],
            "note": "Assumes the change is kept up for a week. The 72 hour risk moves through what starts strain in the twin (a week of sleep and activity, missed doses); it cannot undo strain already under way. Walking and sleep move the vitals by the slopes the twin learned for this person; medicine, salt and alcohol use population estimates. Model estimates on synthetic data, not clinical advice.",
        }

    # ------------------------------------------------------------------
    # Personal physiology and twin summary
    # ------------------------------------------------------------------
    def physiology(self, pid: str, reveal: bool = False) -> dict:
        view = self.c.physiology_for(pid, reveal=reveal)
        out = {k: v for k, v in view.items() if k != "slopes"}
        out["id"] = pid
        return out

    def summary(self, pid: str) -> dict:
        r = self._ehr(pid)
        first = r["first_name"]
        poss = "her" if r["sex"] == "F" else "his"
        sp = self.c.scored(pid)
        f = sp.feat
        last = f.iloc[-1]
        cur = self.c.current(pid)
        tier = cur["tier"]
        n_hr = int(f["rhr"].notna().sum()); n_hrv = int(f["lnrmssd"].notna().sum()); n_bp = int(f["sbp_home"].notna().sum())
        conds = [c["display"] for c in self.conditions(pid)][:3]
        fram = self.static_risk(pid)["framingham_10y_pct"]
        streams = {"record": conds + [f"Framingham 10-year risk {fram}%"],
                   "wearable": [f"{n_hr} nights of heart rate", f"{n_hrv} nights of HRV", f"{n_bp} home BP readings"]}
        fresh = self.c.freshness_for(pid)
        usual = float(np.median(f["p"].tail(60))) if len(f) >= 14 else None
        if pid in self.c.opted_out:
            return {"id": pid, "headline": "Predictions switched off by the patient", "tier": "opted_out",
                    "sentences": [f"{first} has turned off AI predictions. The record and wearable data stay available to you."],
                    "next_step": "Review the record as usual. Ask at the next visit whether they would like predictions back on.",
                    "streams": streams, "usual_probability": None}
        if sp.nights_available < 7:
            return {"id": pid, "headline": f"Still learning {first}'s normal", "tier": tier,
                    "sentences": [f"The twin has {sp.nights_available} nights of data and needs at least 7 before it scores {first}.",
                                  f"Until then it shows the record-based risk only: Framingham 10-year risk {fram}%."],
                    "next_step": f"Ask {first} to wear the watch overnight and sync each morning.",
                    "streams": streams, "usual_probability": None}
        p = float(cur["probability_72h"] or 0)
        ex = self.c.explain_for(pid)
        phys = self.c.physiology_for(pid)
        headline = {"urgent": "Strain episode likely in the next 72 hours", "watch": "Early signs of strain, worth a check-in",
                    "low": "Steady, no strain expected in the next 72 hours"}.get(tier, "Twin summary")
        def _pct(x: float) -> str:  # small baselines keep one decimal: "0.7%", not "1%"
            return f"{x * 100:.1f}%" if x < 0.01 else f"{x * 100:.0f}%"

        if usual and usual > 0:
            mult = p / usual
            if mult >= 1.8:
                rel = f"about {mult:.0f} times {poss} usual {_pct(usual)}" if mult >= 2.5 else f"nearly double {poss} usual {_pct(usual)}"
            elif mult >= 1.2:
                rel = f"a little above {poss} usual {_pct(usual)}"
            else:
                rel = f"close to {poss} usual {_pct(usual)}"
        else:
            rel = "with no usual level yet"
        s1 = f"{first}'s twin puts the chance of a strain episode in the next 72 hours at {_pct(p)}, {rel}."
        labels = [c["label"] for c in ex["contributors"][:2]]
        def lower_first(t: str) -> str:
            return t if len(t) > 1 and t[1].isupper() else t[:1].lower() + t[1:]
        if tier == "low":
            s2 = f"Night heart rate, HRV and home BP are inside {poss} usual range."
        elif len(labels) >= 2:
            s2 = f"The main reasons are {lower_first(labels[0])} and {lower_first(labels[1])}."
        elif labels:
            s2 = f"The main reason is {lower_first(labels[0])}."
        else:
            s2 = "No single signal stands out."
        s3 = phys["best_lever"]["plain"]
        meds = self.medications(pid)
        bp_med = next((m["name"].split()[0].lower() for m in meds if m["class"] in ("Calcium channel blocker", "Angiotensin receptor blocker", "Thiazide diuretic", "Beta blocker")), None)
        missed = [a for a in self.db.annotations(pid) if a["kind"] == "missed_dose"]
        bp_driver = any(c["feature"].startswith("sbp") for c in ex["contributors"][:3])
        if fresh["label"] == "offline":
            step = f"Ask {first} to sync the watch. The last sample is {fresh['minutes_ago'] // 60} hours old, so the twin is working on old data."
        elif tier == "urgent":
            step = f"Call {first} today"
            if bp_driver and bp_med:
                step += f", confirm {bp_med} is being taken"
            step += ", and ask for an evening BP reading."
            if missed:
                step = step[:-1] + f". {first} logged a missed dose on {pd.Timestamp(missed[-1]['date']).strftime('%-d %b')}."
        elif tier == "watch":
            step = f"Send {first} a check-in and look again tomorrow morning after the overnight sync."
        else:
            step = "No action needed. The twin keeps scoring every night."
        return {"id": pid, "headline": headline, "tier": tier, "sentences": [s1, s2, s3], "next_step": step,
                "streams": streams, "usual_probability": round(usual, 3) if usual is not None else None,
                "probability_72h": round(p, 3), "best_lever": phys["best_lever"]}

    # ------------------------------------------------------------------
    # Patient view
    # ------------------------------------------------------------------
    def me(self, pid: str) -> dict:
        r = self._ehr(pid)
        sp = self.c.scored(pid)
        f = sp.feat
        last = f.iloc[-1]
        cur = self.c.current(pid)
        calibrating = sp.nights_available < 7
        score = cur["risk_score"]
        tier = cur["tier"]
        label = {"low": "Looking steady", "watch": "Worth a check-in", "urgent": "Needs attention", "opted_out": "Predictions off"}.get(tier, "Looking steady")
        ring = tier if tier in ("low", "watch", "urgent") else "low"

        def driver(label_, value, vs, arrow, good):
            return {"label": label_, "value": value, "vs_baseline": vs, "arrow": arrow, "good": good}

        rhr_dev = float(last["rhr_dev"]) if pd.notna(last["rhr_dev"]) else 0.0
        sleep_dev = float(last["sleep_min_dev"]) if pd.notna(last["sleep_min_dev"]) else 0.0
        steps_z = float(last["steps_z"]) if pd.notna(last["steps_z"]) else 0.0
        sleep_min = float(last["sleep_min"]) if pd.notna(last["sleep_min"]) else None
        drivers = [
            driver("Resting heart rate", f"{last['rhr']:.0f} bpm" if pd.notna(last["rhr"]) else "No data", f"{rhr_dev:+.0f} bpm",
                   "up" if rhr_dev > 1 else ("down" if rhr_dev < -1 else "flat"), rhr_dev <= 2),
            driver("Sleep", f"{int(sleep_min // 60)} h {int(sleep_min % 60)} m" if sleep_min else "No data",
                   f"{sleep_dev:+.0f} min", "down" if sleep_dev < -20 else ("up" if sleep_dev > 20 else "flat"), sleep_dev >= -30),
            driver("Steps", f"{last['steps']:,.0f}" if pd.notna(last["steps"]) else "No data", f"{(np.exp(steps_z * 0.35) - 1) * 100:+.0f}%",
                   "down" if steps_z < -0.5 else ("up" if steps_z > 0.5 else "flat"), steps_z >= -0.8),
        ]
        if pd.notna(last["sbp_last"]):
            sbp_dev = float(last["sbp_dev"]) if pd.notna(last["sbp_dev"]) else 0.0
            drivers.append(driver("Morning BP", f"{last['sbp_last']:.0f}/{_dbp(last):.0f}", f"{sbp_dev:+.0f} mmHg",
                                  "up" if sbp_dev > 3 else ("down" if sbp_dev < -3 else "flat"), sbp_dev <= 5))

        nights_up = int(last["ns_days"]) if int(last["ns_state"]) >= 1 else 0
        sentence = self._sentence(tier, calibrating, nights_up, rhr_dev, sbp_up=(pd.notna(last["sbp_dev"]) and float(last["sbp_dev"]) > 3), nights_needed=7 - sp.nights_available)
        today = last["date"].date().isoformat()
        checkins = [c for c in self.db.checkins(pid) if c["at"][:10] == pd.Timestamp.now().date().isoformat()]
        pending = tier in ("watch", "urgent") and not checkins
        contacts = self.contacts(pid)
        doctor = self.clinician(pid)
        sbp_line = f"BP: {last['sbp_last']:.0f}/{_dbp(last):.0f} this morning" if pd.notna(last["sbp_last"]) else "BP: no reading today"
        return {
            "id": pid, "first_name": r["first_name"],
            "score": {"value": score, "label": label, "ring_color": ring, "state": "calibrating" if calibrating else "ready",
                      "nights_needed": 7, "nights_available": sp.nights_available},
            "drivers": drivers, "sentence": sentence,
            "checkin": {"pending": pending, "question": {"en": "How do you feel today?", "hi": "आज आप कैसा महसूस कर रहे हैं?"},
                        "options": ["Fine", "Tired", "Dizzy", "Chest discomfort"]},
            "freshness": self.c.freshness_for(pid), "device": {"brand": r["device_brand"], "simulated": self.device(pid)["simulated"]},
            "contacts": [{"name": c["name"].split()[0], "relation": c["relation"]} for c in contacts],
            "doctor": {"name": doctor["name"], "reviewed_at": f"{today}T06:10:00+05:30"},
            "share_card": {"title": f"{r['first_name']}'s day",
                           "lines": [f"Heart: {'working harder' if rhr_dev > 2 else 'steady'} ({rhr_dev:+.0f} bpm)",
                                     f"Sleep: {int(sleep_min // 60)} h {int(sleep_min % 60)} m" if sleep_min else "Sleep: no data", sbp_line],
                           "footer": f"Reviewed by {doctor['name']}, Pratibimb"},
            "consent": self.consent(pid),
            "what_helps": PH.what_helps(self.c.physiology_for(pid)),
        }

    @staticmethod
    def _sentence(tier: str, calibrating: bool, nights_up: int, rhr_dev: float, sbp_up: bool, nights_needed: int) -> dict:
        if calibrating:
            return {"en": f"We are still learning your normal. {max(nights_needed, 1)} more nights of data are needed before your score is ready.",
                    "hi": f"हम अभी आपकी सामान्य स्थिति सीख रहे हैं। स्कोर तैयार होने के लिए {max(nights_needed, 1)} और रातों का डेटा चाहिए।"}
        if tier == "urgent":
            n = max(nights_up, 2)
            bp = " and your morning BP is rising" if sbp_up else ""
            bp_hi = " और सुबह का BP बढ़ रहा है" if sbp_up else ""
            return {"en": f"Your heart has been working harder than usual for {n} nights{bp}. Please check your BP this evening, rest, and reply to the check-in below.",
                    "hi": f"पिछली {n} रातों से आपका दिल सामान्य से ज़्यादा मेहनत कर रहा है{bp_hi}। कृपया आज शाम BP जाँचें, आराम करें और नीचे चेक-इन का जवाब दें।"}
        if tier == "watch":
            return {"en": "A few of your signals are a little off your usual. Take it easy today, drink water, and check your BP tonight.",
                    "hi": "आपके कुछ संकेत सामान्य से थोड़े अलग हैं। आज आराम से रहें, पानी पिएँ और रात में BP जाँचें।"}
        if tier == "opted_out":
            return {"en": "Predictions are switched off. Your data is still saved for your doctor.",
                    "hi": "भविष्यवाणियाँ बंद हैं। आपका डेटा अभी भी आपके डॉक्टर के लिए सुरक्षित है।"}
        return {"en": "Your signals are within your usual range. Keep doing what you are doing.",
                "hi": "आपके संकेत सामान्य सीमा में हैं। ऐसे ही चलते रहें।"}
