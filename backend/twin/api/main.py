"""Pratibimb API. Routes follow docs/API.md.

Run:  uvicorn twin.api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import csv
import io
import json
import threading
from datetime import date
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..config import APP_NAME, CONDITION, EVENT_DEFINITION, MODEL_VERSION, DB_PATH, DEMO_SPEED, Thresholds, ARTIFACT_DIR
from ..engine.alerts import AlertService
from ..engine.cohort import Cohort
from ..engine.escalation import EscalationEngine
from ..engine.fhir import parse_observations, wellness_record
from ..engine.stream import StreamService
from ..engine.twin import TwinService
from ..store.db import DB, now_iso
from . import schemas as S

app = FastAPI(title=f"{APP_NAME} API", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class State:
    cohort: Cohort
    db: DB
    twin: TwinService
    alerts: AlertService
    escalation: EscalationEngine
    stream: StreamService


st = State()


@app.on_event("startup")
async def _startup() -> None:
    import asyncio
    st.cohort = Cohort()
    st.db = DB(DB_PATH)
    saved = st.db.get_setting("thresholds")
    if saved:
        st.cohort.set_thresholds(Thresholds(**{**st.cohort.thresholds.to_dict(), **saved}))
    st.twin = TwinService(st.cohort, st.db)
    st.alerts = AlertService(st.cohort, st.db)
    st.escalation = EscalationEngine(st.db, st.twin, DEMO_SPEED)
    st.escalation.loop = asyncio.get_running_loop()
    st.stream = StreamService(st.twin, st.alerts, st.escalation, DEMO_SPEED)
    for pid in st.cohort.patient_ids:  # consent state persists across restarts
        c = st.db.get_consent(pid)
        if c and not c.get("ai_predictions", True):
            st.cohort.opted_out.add(pid)
    def _warm():
        for pid in st.cohort.patient_ids:
            try:
                st.cohort.scored(pid)
            except Exception:  # pragma: no cover
                pass
        if not st.db.get_setting("seeded"):
            n = st.alerts.seed_from_scores()
            st.db.put_setting("seeded", {"at": now_iso(), "alerts": n})
        st.warm = True

    st.warm = False
    threading.Thread(target=_warm, daemon=True).start()
    if not st.db.get_setting("demo_annotations"):
        st.db.put_setting("demo_annotations", {"at": now_iso()})
        # A couple of demo annotations so the twin page has markers
        p = "P-0007"
        if p in st.cohort.patient_ids:
            as_of = st.cohort.as_of
            st.db.add_annotation(p, (pd.Timestamp(as_of) - pd.Timedelta(days=9)).date().isoformat(), "missed_dose", "Missed amlodipine", "patient")
            st.db.add_annotation(p, (pd.Timestamp(as_of) - pd.Timedelta(days=3)).date().isoformat(), "note", "Called patient, advised evening BP check", "Dr Kavya Rao")
            st.db.add_annotation(p, (pd.Timestamp(as_of) - pd.Timedelta(days=1)).date().isoformat(), "symptom", "Felt dizzy after lunch", "patient")


def _pid(pid: str) -> str:
    if pid not in st.cohort.patient_ids:
        raise HTTPException(404, f"unknown patient {pid}")
    return pid


# ---------------------------------------------------------------------------
# Meta and health
# ---------------------------------------------------------------------------

@app.get("/api/meta")
def meta():
    return {"app": APP_NAME, "version": __version__, "as_of": st.cohort.as_of.isoformat(), "cohort_size": len(st.cohort.patient_ids),
            "days": st.cohort.cfg["days"], "condition": CONDITION, "event_definition": EVENT_DEFINITION,
            "model_version": MODEL_VERSION, "demo_speed": DEMO_SPEED}


@app.get("/api/health")
def health():
    return {"ok": True, "model_loaded": st.cohort.fusion is not None, "cohort_loaded": len(st.cohort.patient_ids) > 0, "warm": getattr(st, "warm", False)}


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

@app.get("/api/patients")
def patients(tier: str | None = None, sort: str = "risk_score", q: str | None = None):
    active = {e["patient_id"]: e for e in st.escalation.active()}
    rows = []
    for pid in st.cohort.patient_ids:
        row = st.twin.triage_row(pid, st.alerts.open_alert_for(pid), active.get(pid))
        rows.append(row)
    if tier:
        rows = [r for r in rows if r["tier"] == tier]
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["name"].lower() or ql in r["id"].lower() or ql in r["city"].lower()]
    if sort == "name":
        rows.sort(key=lambda r: r["name"])
    elif sort == "freshness":
        rows.sort(key=lambda r: r["freshness"]["minutes_ago"])
    else:
        rows.sort(key=lambda r: (-(r["risk_score"] or -1), r["name"]))
    summary = {"total": len(st.cohort.patient_ids),
               "urgent": sum(1 for r in rows if r["tier"] == "urgent"), "watch": sum(1 for r in rows if r["tier"] == "watch"),
               "low": sum(1 for r in rows if r["tier"] == "low"), "opted_out": sum(1 for r in rows if r["tier"] == "opted_out"),
               "open_alerts": len([a for a in st.db.alerts("open")]),
               "false_alert_rate_per_patient_day": st.cohort.model_card["metrics"]["fused"]["false_alerts_per_patient_day"],
               "active_escalations": len(active)}
    return {"as_of": st.cohort.as_of.isoformat(), "summary": summary, "patients": rows}


@app.get("/api/patients/{pid}")
def patient(pid: str):
    return st.twin.patient_detail(_pid(pid))


@app.get("/api/patients/{pid}/timeline")
def timeline(pid: str, days: int = Query(30, ge=7, le=120), reveal: int = 0):
    return st.twin.timeline(_pid(pid), days, reveal=bool(reveal))


@app.get("/api/patients/{pid}/intraday")
def intraday(pid: str, date_: str | None = Query(None, alias="date")):
    d = date.fromisoformat(date_) if date_ else st.cohort.as_of
    try:
        return st.twin.intraday(_pid(pid), d)
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.get("/api/patients/{pid}/forecast")
def forecast(pid: str):
    _pid(pid)
    if pid in st.cohort.opted_out:
        raise HTTPException(403, "patient has opted out of AI predictions")
    return st.twin.forecast(pid)


@app.get("/api/patients/{pid}/explain")
def explain(pid: str):
    _pid(pid)
    if pid in st.cohort.opted_out:
        raise HTTPException(403, "patient has opted out of AI predictions")
    return st.twin.explain(pid)


@app.post("/api/patients/{pid}/simulate")
def simulate(pid: str, body: S.SimulateBody):
    _pid(pid)
    if pid in st.cohort.opted_out:
        raise HTTPException(403, "patient has opted out of AI predictions")
    return st.twin.simulate(pid, body.model_dump())


@app.get("/api/patients/{pid}/physiology")
def physiology(pid: str, reveal: int = 0):
    return st.twin.physiology(_pid(pid), reveal=bool(reveal))


@app.get("/api/patients/{pid}/summary")
def summary(pid: str):
    return st.twin.summary(_pid(pid))


@app.post("/api/patients/{pid}/annotate")
def annotate_clinician(pid: str, body: S.AnnotateBody):
    _pid(pid)
    a = st.db.add_annotation(pid, body.date, body.kind, body.label, body.by)
    st.db.audit(body.by, "clinician", pid, "annotation.added", str(a["id"]), f"{body.kind}: {body.label}")
    return {"ok": True, "annotation": a}


@app.get("/api/patients/{pid}/consent")
def get_consent(pid: str):
    return st.twin.consent(_pid(pid))


@app.post("/api/patients/{pid}/consent")
def set_consent(pid: str, body: S.ConsentBody):
    _pid(pid)
    doc = st.twin.consent(pid)
    changes = {k: v for k, v in body.model_dump().items() if v is not None and k != "withdraw"}
    doc.update(changes)
    doc["updated_at"] = now_iso()
    if body.withdraw:
        doc.update({"ehr": False, "wearable": False, "ai_predictions": False, "emergency_contacts": False, "withdrawn_at": now_iso()})
        st.cohort.ingested.pop(pid, None)
        st.db.audit("patient", "patient", pid, "consent.withdrawn", pid, "All consents withdrawn; runtime wearable rows deleted (soft delete of synthetic rows)", consent_basis="withdrawal")
    st.db.put_consent(pid, doc)
    if doc.get("ai_predictions", True):
        st.cohort.opted_out.discard(pid)
    else:
        st.cohort.opted_out.add(pid)
    st.cohort.invalidate(pid)
    st.db.audit("patient", "patient", pid, "consent.updated", pid, json.dumps(changes), consent_basis="consent")
    return doc


@app.get("/api/patients/{pid}/export/wellnessrecord")
def export_wellness(pid: str):
    detail = st.twin.patient_detail(_pid(pid))
    bundle = wellness_record(detail, st.cohort.daily_for(pid))
    st.db.audit("Dr Kavya Rao", "clinician", pid, "export.wellnessrecord", pid, f"{len(bundle['entry'])} entries", consent_basis="wearable")
    return JSONResponse(bundle, headers={"Content-Disposition": f'attachment; filename="{pid}-wellnessrecord.json"'})


@app.get("/api/patients/{pid}/export/ehr")
def export_ehr(pid: str):
    path = st.cohort.fhir_dir / f"{_pid(pid)}.json"
    if not path.exists():
        raise HTTPException(404, "no FHIR bundle for this patient")
    return FileResponse(path, media_type="application/fhir+json", filename=f"{pid}-ehr.json")


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@app.get("/api/alerts")
def alerts(status: str = "all", patient_id: str | None = None):
    return {"budget": st.alerts.budget(), "alerts": st.db.alerts(status if status != "all" else None, patient_id)}


def _alert_or_404(alert_id: str) -> dict:
    doc = st.db.get_alert(alert_id)
    if not doc:
        raise HTTPException(404, f"unknown alert {alert_id}")
    return doc


@app.post("/api/alerts/{alert_id}/ack")
def ack(alert_id: str, body: S.AckBody):
    _alert_or_404(alert_id)
    return st.alerts.ack(alert_id, body.by, body.note)


@app.post("/api/alerts/{alert_id}/snooze")
def snooze(alert_id: str, body: S.SnoozeBody):
    _alert_or_404(alert_id)
    return st.alerts.snooze(alert_id, body.by, body.hours)


@app.post("/api/alerts/{alert_id}/escalate")
def escalate(alert_id: str, body: S.EscalateBody):
    doc = _alert_or_404(alert_id)
    esc = st.escalation.start(doc["patient_id"], "clinician", body.by, alert_id=alert_id)
    out = st.alerts.mark_escalated(alert_id, body.by, esc["id"], body.reason)
    out["escalation"] = esc
    return out


@app.post("/api/alerts/{alert_id}/resolve")
def resolve(alert_id: str, body: S.ResolveBody):
    _alert_or_404(alert_id)
    return st.alerts.resolve(alert_id, body.by, body.outcome, body.note)


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

@app.get("/api/thresholds")
def thresholds():
    return st.cohort.thresholds.to_dict()


@app.post("/api/thresholds/preview")
def thresholds_preview(body: S.ThresholdsBody):
    draft = {k: v for k, v in body.model_dump().items() if v is not None and k not in ("patient_id", "by")}
    return st.alerts.preview(draft, body.patient_id)


@app.post("/api/thresholds")
def thresholds_apply(body: S.ThresholdsBody):
    draft = {k: v for k, v in body.model_dump().items() if v is not None and k not in ("patient_id", "by")}
    return st.alerts.apply(draft, body.by)


# ---------------------------------------------------------------------------
# Escalations
# ---------------------------------------------------------------------------

@app.post("/api/escalations")
def start_escalation(body: S.EscalationStart):
    _pid(body.patient_id)
    kind = {"sos": "sos", "fall": "fall", "caregiver": "caregiver", "acute": "acute", "clinician": "model"}[body.trigger]
    alert_id = body.alert_id
    if body.trigger in ("sos", "fall", "caregiver"):
        a = st.alerts.create(body.patient_id, "urgent", kind,
                             {"sos": "Patient pressed SOS", "fall": "Fall detected by phone or watch", "caregiver": "Caregiver raised an alarm"}[body.trigger],
                             "Red tier: human or OS trigger, not the model", "high",
                             actor=body.by, actor_type="patient" if body.by == "patient" else "contact", consent_basis="emergency_contacts")
        alert_id = a["id"]
    esc = st.escalation.start(body.patient_id, body.trigger, body.by, alert_id=alert_id, location=body.location)
    if alert_id:
        st.alerts.mark_escalated(alert_id, body.by, esc["id"], f"trigger={body.trigger}")
    return esc


@app.get("/api/escalations")
def list_escalations(status: str = "active"):
    return {"escalations": st.db.escalations(active_only=(status == "active"))}


@app.get("/api/escalations/{esc_id}")
def get_escalation(esc_id: str):
    doc = st.db.get_escalation(esc_id)
    if not doc:
        raise HTTPException(404, f"unknown escalation {esc_id}")
    return doc


@app.post("/api/escalations/{esc_id}/respond")
def respond_escalation(esc_id: str, body: S.EscalationRespond):
    try:
        doc = st.escalation.respond(esc_id, body.by, body.action, body.note)
    except KeyError:
        raise HTTPException(404, f"unknown escalation {esc_id}")
    if doc["state"] in ("resolved", "cancelled") and doc.get("alert_id"):
        a = st.db.get_alert(doc["alert_id"])
        if a and a["status"] != "resolved":
            st.alerts.resolve(doc["alert_id"], body.by, "false_alarm" if doc["outcome"] in ("user_ok", "false_alarm") else "handled", f"escalation {esc_id} {doc['outcome']}")
    return doc


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

@app.get("/api/audit")
def audit(patient_id: str | None = None, limit: int = Query(100, ge=1, le=1000)):
    return {"entries": st.db.audit_entries(patient_id, limit)}


# ---------------------------------------------------------------------------
# Patient view
# ---------------------------------------------------------------------------

@app.get("/api/me/{pid}")
def me(pid: str):
    return st.twin.me(_pid(pid))


@app.post("/api/me/{pid}/checkin")
def checkin(pid: str, body: S.CheckinBody):
    _pid(pid)
    st.db.add_checkin(pid, body.answer, body.note)
    st.db.audit("patient", "patient", pid, "checkin.answered", pid, body.answer, consent_basis="wearable")
    created = None
    if body.answer.lower() != "fine":
        tier = "urgent" if body.answer.lower() == "chest discomfort" else "watch"
        a = st.alerts.create(pid, tier, "caregiver" if tier == "urgent" else "model", f"Patient reports: {body.answer}",
                             f"Check-in answer: {body.answer}. {body.note}".strip(), "high", actor="patient", actor_type="patient", consent_basis="wearable")
        created = a["id"]
    return {"ok": True, "alert_created": created is not None, "alert_id": created}


@app.post("/api/me/{pid}/annotate")
def annotate_patient(pid: str, body: S.AnnotateBody):
    _pid(pid)
    a = st.db.add_annotation(pid, body.date, body.kind, body.label, "patient")
    st.db.audit("patient", "patient", pid, "annotation.added", str(a["id"]), f"{body.kind}: {body.label}", consent_basis="wearable")
    return {"ok": True, "annotation": a}


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

def _ingest(pid: str, source: str, device: dict | None, observations) -> dict:
    consent = st.twin.consent(pid)
    if not consent.get("wearable", True):
        raise HTTPException(403, "wearable consent is off for this patient")
    rows, accepted, rejected = parse_observations({"observations": observations})
    st.cohort.ingested.setdefault(pid, []).extend(rows)
    st.cohort.touch_freshness(pid)
    st.cohort.invalidate(pid)
    st.db.log_ingest(pid, source, accepted, rejected, {"device": device, "days": [r["date"] for r in rows]})
    st.db.audit("companion" if source != "csv" else "upload", "system", pid, "ingest.received", pid,
                f"source={source} accepted={accepted} rejected={rejected} days={len(rows)}", consent_basis="wearable", channel=source)
    cur = st.cohort.current(pid)
    return {"accepted": accepted, "rejected": rejected, "days_updated": [r["date"] for r in rows],
            "freshness": st.cohort.freshness_for(pid), "rescored": True, "risk_score": cur["risk_score"], "tier": cur["tier"]}


@app.post("/api/ingest")
def ingest(body: S.IngestBody):
    _pid(body.patient_id)
    return _ingest(body.patient_id, body.source, body.device, body.observations)


@app.post("/api/ingest/csv")
async def ingest_csv(patient_id: str, file: UploadFile = File(...)):
    _pid(patient_id)
    text = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    obs = []
    for r in reader:
        t = r.get("type")
        if t == "blood_pressure":
            obs.append({"type": t, "t": r["t"], "systolic": float(r["value"]), "diastolic": float(r.get("value2") or 0)})
        elif t == "sleep_session":
            obs.append({"type": t, "start": r["t"], "end": r.get("t2"), "efficiency": float(r["value"]) if r.get("value") else None})
        else:
            obs.append({"type": t, "t": r["t"], "value": float(r["value"])})
    return _ingest(patient_id, "csv", None, obs)


# ---------------------------------------------------------------------------
# Simulated live stream
# ---------------------------------------------------------------------------

@app.get("/api/stream/{pid}")
async def stream(pid: str):
    _pid(pid)
    return StreamingResponse(st.stream.events(pid), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/stream/{pid}/inject")
def inject(pid: str, body: S.InjectBody):
    _pid(pid)
    return st.stream.inject(pid, body.scenario)


# ---------------------------------------------------------------------------
# Model card
# ---------------------------------------------------------------------------

@app.get("/api/model")
def model():
    card = dict(st.cohort.model_card)
    results = ARTIFACT_DIR / "leakage_tests.json"
    if results.exists():
        with open(results) as f:
            lt = json.load(f)
        card["leakage_tests"] = {
            "passed": lt.get("passed"),
            "tests": [f"{t['name']}: {'pass' if t['passed'] else 'FAIL'} ({t['at'][:10]})" if isinstance(t, dict) else str(t) for t in lt.get("tests", [])],
            "note": "Results written by pytest (backend/tests/test_leakage.py)",
        }
    card["thresholds"] = st.cohort.thresholds.to_dict()
    return card


# ---------------------------------------------------------------------------
# Static front end (production build)
# ---------------------------------------------------------------------------

_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        target = _dist / full_path
        if full_path and target.exists() and target.is_file():
            return FileResponse(target)
        return FileResponse(_dist / "index.html")
