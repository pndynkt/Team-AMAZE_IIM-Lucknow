"""Alerts with a visible false-alert budget, and the threshold editor's preview.

An alert is a document in SQLite. Model alerts are created from the twin's daily scores;
rule alerts from the NightSignal-style state; sos, fall, caregiver and acute alerts come
from the escalation ladder or the live stream. Every state change writes an audit entry.
"""

from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from ..config import Thresholds, MODEL_VERSION
from ..models.fusion import probability_to_score
from ..models.nightsignal import run_state_machine, STATE_NAMES
from .cohort import Cohort
from ..store.db import DB, now_iso


class AlertService:
    def __init__(self, cohort: Cohort, db: DB):
        self.c = cohort
        self.db = db

    # ------------------------------------------------------------------
    def open_alert_for(self, pid: str) -> dict | None:
        for a in self.db.alerts(patient_id=pid):
            if a["status"] in ("open", "acknowledged", "snoozed", "escalated"):
                return a
        return None

    def create(self, pid: str, tier: str, kind: str, title: str, reason: str, confidence: str = "high",
               actor: str = "system", actor_type: str = "system", consent_basis: str = "ai_predictions") -> dict:
        existing = self.open_alert_for(pid)
        if existing and existing["kind"] == kind and existing["tier"] == tier:
            return existing
        name = self.c.ehr.loc[pid, "name"]
        doc = {
            "id": self.db.next_id("alert", "AL"), "patient_id": pid, "patient_name": name, "created_at": now_iso(),
            "tier": tier, "kind": kind, "title": title, "reason": reason, "status": "open", "confidence": confidence,
            "snoozed_until": None, "acknowledged_by": None, "escalation_id": None,
            "owner": self.c.ehr.loc[pid, "clinician"], "model_version": MODEL_VERSION, "history": [],
        }
        self.db.put_alert(doc)
        self.db.audit(actor, actor_type, pid, "alert.created", doc["id"],
                      f"tier={tier} kind={kind} {reason}", consent_basis=consent_basis)
        return doc

    def seed_from_scores(self) -> int:
        """At startup, raise alerts for patients whose current tier warrants one."""
        n = 0
        for pid in self.c.patient_ids:
            if pid in self.c.opted_out or self.open_alert_for(pid):
                continue
            cur = self.c.current(pid)
            sp = self.c.scored(pid)
            last = sp.feat.iloc[-1]
            if cur["tier"] == "urgent":
                self.create(pid, "urgent", "model", f"Strain episode risk {int(cur['probability_72h'] * 100)}% in next 72 h",
                            self._reason(pid), sp.confidence)
                n += 1
            elif cur["tier"] == "watch" and (int(last["ns_state"]) >= 2 or int(last["score"]) >= self.c.thresholds.watch):
                kind = "rule" if int(last["ns_state"]) >= 2 and int(last["score"]) < self.c.thresholds.watch else "model"
                title = ("Overnight heart rate above personal baseline" if kind == "rule"
                         else f"Strain episode risk {int(cur['probability_72h'] * 100)}% in next 72 h")
                self.create(pid, "watch", kind, title, self._reason(pid), sp.confidence)
                n += 1
        return n

    def _reason(self, pid: str) -> str:
        try:
            ex = self.c.explain_for(pid)
            labels = [c["label"] for c in ex["contributors"][:2]]
            return "; ".join(labels) if labels else "Pattern change versus personal baseline"
        except Exception:  # pragma: no cover
            return "Pattern change versus personal baseline"

    # ------------------------------------------------------------------
    def budget(self) -> dict:
        """Alert economics over the last 7 days. False alerts are counted against the
        synthetic ground truth here; in deployment the same number comes from alerts the
        clinician resolved as false alarms."""
        thr = self.c.thresholds
        window = 7
        alerts = false_alerts = days = 0
        for pid in self.c.patient_ids:
            f = self.c.scored(pid).feat.tail(window)
            urgent = (f["score"] >= thr.urgent).to_numpy()
            alerts += int(urgent.sum())
            false_alerts += int((urgent & (f["y72"].to_numpy() == 0)).sum())
            days += len(f)
        observed_val = self.c.model_card["metrics"]["fused"]["false_alerts_per_patient_day"]
        rate = false_alerts / max(days, 1)
        return {"target_false_alerts_per_patient_day": thr.target_false_alerts_per_patient_day,
                "observed_validation": observed_val, "cohort_alerts_last_7d": alerts, "cohort_false_alerts_last_7d": false_alerts,
                "cohort_patient_days_last_7d": days, "observed_rate": round(rate, 4),
                "observed_total_alert_rate": round(alerts / max(days, 1), 4),
                "status": "within_budget" if rate <= thr.target_false_alerts_per_patient_day else "over_budget"}

    # ------------------------------------------------------------------
    def _update(self, alert_id: str, status: str, by: str, action: str, detail: str, **fields) -> dict:
        doc = self.db.get_alert(alert_id)
        if not doc:
            raise KeyError(alert_id)
        doc["status"] = status
        doc.update(fields)
        doc["history"].append({"at": now_iso(), "by": by, "action": action, "detail": detail})
        self.db.put_alert(doc)
        entry = self.db.audit(by, "clinician", doc["patient_id"], f"alert.{action}", alert_id, detail)
        doc["audit"] = [entry]
        return doc

    def ack(self, alert_id: str, by: str, note: str = "") -> dict:
        return self._update(alert_id, "acknowledged", by, "acknowledged", note or "Acknowledged", acknowledged_by=by)

    def snooze(self, alert_id: str, by: str, hours: int = 3) -> dict:
        until = (pd.Timestamp(now_iso()) + timedelta(hours=hours)).isoformat(timespec="seconds")
        return self._update(alert_id, "snoozed", by, "snoozed", f"Snoozed {hours} h", snoozed_until=until)

    def mark_escalated(self, alert_id: str, by: str, escalation_id: str, reason: str) -> dict:
        return self._update(alert_id, "escalated", by, "escalated", reason or "Escalated", escalation_id=escalation_id)

    def resolve(self, alert_id: str, by: str, outcome: str, note: str = "") -> dict:
        return self._update(alert_id, "resolved", by, "resolved", f"outcome={outcome} {note}".strip(), outcome=outcome)

    # ------------------------------------------------------------------
    def preview(self, draft: dict, patient_id: str | None = None, window_days: int = 14) -> dict:
        """Replay the last ``window_days`` under current and draft thresholds."""
        cur_thr = self.c.thresholds
        draft_thr = Thresholds(**{**cur_thr.to_dict(), **{k: v for k, v in draft.items() if k in cur_thr.to_dict()}})
        pids = [patient_id] if patient_id else self.c.patient_ids

        def replay(thr: Thresholds) -> dict:
            alerts, days, caught, events = 0, 0, 0, 0
            for pid in pids:
                sp = self.c.scored(pid)
                f = sp.feat
                dev = f["rhr_dev"].to_numpy(dtype=float)
                st, _ = run_state_machine(dev, thr.ns_rhr_delta_yellow, thr.ns_rhr_delta_red, thr.ns_consecutive_nights)
                w = f.tail(window_days)
                st_w = st[-window_days:]
                urgent = (w["score"].to_numpy() >= thr.urgent) | (st_w >= 2)
                alerts += int(urgent.sum())
                days += len(w)
                ev = self.c.episodes[(self.c.episodes["kind"] == "strain_episode") & (self.c.episodes["patient_id"] == pid)]["event_day"].dropna()
                for e in ev:
                    e = pd.Timestamp(e)
                    if w["date"].min() < e <= w["date"].max() + timedelta(days=3):
                        events += 1
                        mask = (w["date"] < e) & (w["date"] >= e - timedelta(days=3))
                        if urgent[mask.to_numpy()].any():
                            caught += 1
            return {"alerts": alerts, "per_patient_day": round(alerts / max(days, 1), 4), "would_have_caught_events": caught, "events": events}

        cur, dr = replay(cur_thr), replay(draft_thr)
        return {"window_days": window_days, "scope": "patient" if patient_id else "cohort", "current": cur, "draft": dr,
                "delta_alerts_pct": round(100 * (dr["alerts"] - cur["alerts"]) / max(cur["alerts"], 1), 1),
                "sensitivity_change": round((dr["would_have_caught_events"] - cur["would_have_caught_events"]) / max(cur["events"], 1), 3),
                "note": "Preview replays stored scores with the draft cut-offs and re-runs the rule; the learned model is not retrained."}

    def apply(self, draft: dict, by: str) -> dict:
        cur = self.c.thresholds.to_dict()
        new = Thresholds(**{**cur, **{k: v for k, v in draft.items() if k in cur}})
        self.c.set_thresholds(new)
        self.db.put_setting("thresholds", new.to_dict())
        self.db.audit(by, "clinician", None, "thresholds.applied", "thresholds", f"{draft}")
        return new.to_dict()
