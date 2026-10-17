"""The consented check-in ladder.

    trigger → user_prompt (60 s, "I'm OK" cancels)
            → contact_1 (push + DLT "-S" SMS + WhatsApp utility template + 1600-series voice call)
            → contact_2 after 2 min with no acknowledgement
            → doctor (60-minute SLA)
            → resolved | cancelled

Design rules, each traceable to the research notes:
- the model never triggers the red ladder on its own; triggers are the patient's SOS, an OS
  fall event, a caregiver, a clinician, or a sustained acute reading on a live stream;
- an app cannot auto-dial 112 on Android or iOS, so the public call is always a one-tap
  user-confirmed dialer link, for the patient and for every contact;
- every transition and every message is written to the audit log with its consent basis;
- timings copy shipping flows (Apple, Pixel, Samsung) and run on a demo clock
  (``DEMO_SPEED``) so a 60 s countdown takes 6 s in a demo.

All channels are mocked: the exact template text that would be sent is rendered on screen
and labelled as a mock, with the TRAI header class it would carry.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from ..config import DEMO_SPEED, ESCALATION_TIMINGS
from ..store.db import DB, now_iso, IST

CITY_COORDS = {
    "Bengaluru": (12.9716, 77.5946), "Mysuru": (12.2958, 76.6394), "Chennai": (13.0827, 80.2707), "Coimbatore": (11.0168, 76.9558),
    "Hyderabad": (17.3850, 78.4867), "Mumbai": (19.0760, 72.8777), "Pune": (18.5204, 73.8567), "Nagpur": (21.1458, 79.0882),
    "Delhi": (28.6139, 77.2090), "Noida": (28.5355, 77.3910), "Lucknow": (26.8467, 80.9462), "Jaipur": (26.9124, 75.7873),
    "Kolkata": (22.5726, 88.3639), "Kochi": (9.9312, 76.2673), "Thiruvananthapuram": (8.5241, 76.9366), "Ahmedabad": (23.0225, 72.5714),
    "Indore": (22.7196, 75.8577), "Chandigarh": (30.7333, 76.7794), "Bhubaneswar": (20.2961, 85.8245), "Guwahati": (26.1445, 91.7362),
}


def _iso_in(seconds: float) -> str:
    return (datetime.now(IST) + timedelta(seconds=seconds)).isoformat(timespec="seconds")


class EscalationEngine:
    def __init__(self, db: DB, twin, speed: float = DEMO_SPEED):
        self.db = db
        self.twin = twin
        self.speed = max(speed, 0.01)
        self._tasks: dict[str, asyncio.Task] = {}
        self.loop: asyncio.AbstractEventLoop | None = None  # set by the API at startup

    # ------------------------------------------------------------------
    def _messages(self, patient: dict, contact: dict, esc_id: str, location: dict) -> list[dict]:
        first = patient["first_name"]
        maps = f"https://maps.google.com/?q={location['lat']:.4f},{location['lng']:.4f}"
        return [
            {"channel": "push", "to": contact["name"], "title": f"{first} has not responded to a health check-in",
             "body": "Open Pratibimb to call them or call 112.", "mock": True},
            {"channel": "sms", "to": contact["phone_masked"], "header": "PRTBMB-S", "template_id": "PRATIBIMB-S-001",
             "dlt_category": "service", "mock": True,
             "body": (f"Pratibimb: {patient['name']} has not responded to a health check-in at {datetime.now(IST).strftime('%H:%M')}. "
                      f"Last known location: {maps}. Please call them now, or tap to call 112: tel:112. Ref {esc_id}. Reply STOP to opt out.")},
            {"channel": "whatsapp", "to": contact["phone_masked"], "template": "emergency_checkin_v1", "category": "utility",
             "opt_in": contact["consented_at"], "mock": True,
             "body": (f"*Pratibimb check-in*\n{patient['name']} has not responded to a health alert. "
                      f"Last location: {maps}\n\n[Call {first}]  [Call 112]  [I have reached them]")},
            {"channel": "voice", "from": "1600-XXX-XXXX", "to": contact["phone_masked"], "mock": True,
             "script": (f"This is Pratibimb, a health service used by {patient['name']}. {first} has not responded to a check-in. "
                        f"Press 1 if you can reach {first}. Press 2 to hear the last known location. This call was automated.")},
        ]

    def _patient_info(self, pid: str) -> dict:
        r = self.twin.c.ehr.loc[pid]
        return {"id": pid, "name": r["name"], "first_name": r["first_name"], "city": r["city"]}

    # ------------------------------------------------------------------
    def start(self, pid: str, trigger: str, by: str, alert_id: str | None = None, location: dict | None = None) -> dict:
        patient = self._patient_info(pid)
        contacts = self.twin.contacts(pid)
        doctor = self.twin.clinician(pid)
        lat, lng = CITY_COORDS.get(patient["city"], (12.9716, 77.5946))
        location = location or {"lat": lat, "lng": lng, "accuracy_m": 35, "source": "last_known"}
        esc_id = self.db.next_id("escalation", "ES")
        prompt_s = ESCALATION_TIMINGS["user_prompt_s"]
        doc = {
            "id": esc_id, "patient_id": pid, "patient_name": patient["name"], "trigger": trigger, "triggered_by": by,
            "started_at": now_iso(), "state": "user_prompt", "countdown_ends_at": _iso_in(prompt_s / self.speed),
            "demo_speed": self.speed, "alert_id": alert_id,
            "steps": [
                {"n": 1, "state": "user_prompt", "at": now_iso(), "status": "waiting",
                 "detail": f"Full-screen alert with sound and vibration. {prompt_s} s to tap \"I'm OK\". Workout and rest modes suppress motion triggers."},
                {"n": 2, "state": "contact_1", "at": None, "status": "pending",
                 "detail": f"{contacts[0]['name']} ({contacts[0]['relation']}): push + SMS (DLT -S service template) + WhatsApp utility template + voice call from a 1600-series number. Press 1 to acknowledge.",
                 "contact": contacts[0], "messages": []},
                {"n": 3, "state": "contact_2", "at": None, "status": "pending",
                 "detail": f"{contacts[1]['name']} ({contacts[1]['relation']}) after {ESCALATION_TIMINGS['contact_retry_s'] // 60} min without acknowledgement: SMS + voice call.",
                 "contact": contacts[1], "messages": []},
                {"n": 4, "state": "doctor", "at": None, "status": "pending",
                 "detail": f"{doctor['name']} alerted with a {doctor['sla_minutes']}-minute response SLA; alert pinned to the triage list."},
            ],
            "location": location,
            "actions": {"call_112_url": "tel:112", "uhi_ambulance_url": f"https://uhi.example.in/ambulance?ref={esc_id}", "mock": True,
                        "note": "Public emergency numbers are never auto-dialled; the link opens the phone dialer for a confirmed tap."},
            "acknowledged_by": None, "resolved_by": None, "outcome": None, "resolved_at": None,
        }
        self.db.put_escalation(doc)
        self.db.audit(by, "patient" if by == "patient" else ("system" if trigger == "acute" else "clinician"), pid,
                      "escalation.started", esc_id, f"trigger={trigger}", consent_basis="emergency_contacts")
        if trigger == "sos" and by == "patient":
            # The patient's own device already ran the 60 s "I'm OK" prompt before calling us,
            # so the server ladder starts at the first contact straight away.
            doc["steps"][0]["detail"] += " Ran on the patient's phone before this request."
            doc = self.advance(doc, "contact_1")
            self._schedule(esc_id, from_state="contact_1")
        else:
            self._schedule(esc_id)
        return doc

    def _schedule(self, esc_id: str, from_state: str = "user_prompt") -> None:
        """Schedule the timer on the server's event loop. Endpoints run in worker threads,
        so the task is handed to the loop thread-safely. Without a loop (unit tests) the
        machine is driven manually with ``advance``."""
        loop = self.loop
        if loop is None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return
        old = self._tasks.get(esc_id)
        if old is not None and not old.done():
            loop.call_soon_threadsafe(old.cancel)
        fut = asyncio.run_coroutine_threadsafe(self._run(esc_id, from_state), loop)
        self._tasks[esc_id] = fut  # type: ignore[assignment]

    async def _run(self, esc_id: str, from_state: str = "user_prompt") -> None:
        try:
            if from_state == "user_prompt":
                await asyncio.sleep(ESCALATION_TIMINGS["user_prompt_s"] / self.speed)
                if not self._advance_if(esc_id, "user_prompt", "contact_1"):
                    return
            await asyncio.sleep(ESCALATION_TIMINGS["contact_retry_s"] / self.speed)
            if not self._advance_if(esc_id, "contact_1", "contact_2"):
                return
            await asyncio.sleep(ESCALATION_TIMINGS["contact_retry_s"] / self.speed)
            self._advance_if(esc_id, "contact_2", "doctor")
        except asyncio.CancelledError:  # pragma: no cover
            pass

    # ------------------------------------------------------------------
    def _advance_if(self, esc_id: str, expected: str, new_state: str) -> bool:
        doc = self.db.get_escalation(esc_id)
        if not doc or doc["state"] != expected or doc.get("acknowledged_by"):
            return False
        return self.advance(doc, new_state) is not None

    def advance(self, doc: dict, new_state: str) -> dict:
        """Move to ``new_state`` (used by the timer and by tests)."""
        pid = doc["patient_id"]
        patient = self._patient_info(pid)
        for step in doc["steps"]:
            if step["state"] == doc["state"] and step["status"] in ("waiting", "sent"):
                step["status"] = "no_response"
        doc["state"] = new_state
        step = next(s for s in doc["steps"] if s["state"] == new_state)
        step["at"] = now_iso()
        if new_state in ("contact_1", "contact_2"):
            msgs = self._messages(patient, step["contact"], doc["id"], doc["location"])
            if new_state == "contact_2":
                msgs = [m for m in msgs if m["channel"] in ("sms", "voice")]
            step["messages"] = msgs
            step["status"] = "sent"
            doc["countdown_ends_at"] = _iso_in(ESCALATION_TIMINGS["contact_retry_s"] / self.speed)
            for m in msgs:
                self.db.audit("system", "system", pid, "escalation.message_sent", doc["id"],
                              f"{m['channel']} to {step['contact']['name']} (mock)", consent_basis="emergency_contacts", channel=m["channel"])
        elif new_state == "doctor":
            step["status"] = "sent"
            doc["countdown_ends_at"] = _iso_in(ESCALATION_TIMINGS["doctor_sla_s"] / self.speed)
            self.db.audit("system", "system", pid, "escalation.doctor_notified", doc["id"],
                          f"{self.twin.clinician(pid)['name']} SLA 60 min", consent_basis="emergency_contacts")
        self.db.audit("system", "system", pid, "escalation.advanced", doc["id"], f"→ {new_state}", consent_basis="emergency_contacts")
        self.db.put_escalation(doc)
        return doc

    def respond(self, esc_id: str, by: str, action: str, note: str = "") -> dict:
        doc = self.db.get_escalation(esc_id)
        if not doc:
            raise KeyError(esc_id)
        pid = doc["patient_id"]
        actor_type = "patient" if by == "patient" else ("contact" if by.startswith("contact") else "clinician")
        if doc["state"] in ("resolved", "cancelled"):
            return doc
        if action == "im_ok":
            if doc["state"] == "user_prompt":
                doc["state"] = "cancelled"; doc["outcome"] = "user_ok"
                doc["steps"][0]["status"] = "cancelled"
            else:
                doc["state"] = "resolved"; doc["outcome"] = "patient_ok_after_contacts"
            doc["resolved_by"] = by; doc["resolved_at"] = now_iso()
            self._cancel_task(esc_id)
        elif action == "acknowledged":
            doc["acknowledged_by"] = by
            for s in doc["steps"]:
                if s["state"] == doc["state"]:
                    s["status"] = "acknowledged"
            self._cancel_task(esc_id)
        elif action in ("reached_patient", "resolved", "false_alarm"):
            doc["state"] = "resolved"
            doc["outcome"] = {"reached_patient": "reached_patient", "resolved": "handled", "false_alarm": "false_alarm"}[action]
            doc["resolved_by"] = by; doc["resolved_at"] = now_iso()
            self._cancel_task(esc_id)
        else:
            raise ValueError(f"unknown action {action}")
        doc.setdefault("responses", []).append({"at": now_iso(), "by": by, "action": action, "note": note})
        self.db.put_escalation(doc)
        self.db.audit(by, actor_type, pid, f"escalation.{action}", esc_id, note, consent_basis="emergency_contacts")
        return doc

    def _cancel_task(self, esc_id: str) -> None:
        t = self._tasks.get(esc_id)
        if t and not t.done():
            t.cancel()  # concurrent.futures.Future.cancel is thread-safe

    def active(self) -> list[dict]:
        return self.db.escalations(active_only=True)
