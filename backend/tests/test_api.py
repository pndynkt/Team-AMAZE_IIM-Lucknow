"""End-to-end API tests against the real app (TestClient runs the startup hook)."""

import os
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    os.environ["PRATIBIMB_DB"] = os.environ.get("PRATIBIMB_DB", "test_pratibimb.db")
    from twin.api.main import app
    with TestClient(app) as c:
        for _ in range(120):
            if c.get("/api/health").json().get("warm"):
                break
            time.sleep(1)
        yield c


def test_meta_and_health(client):
    m = client.get("/api/meta").json()
    assert m["app"] == "Pratibimb" and m["cohort_size"] == 240
    assert client.get("/api/health").json()["ok"]


def test_triage_shape_and_budget(client):
    d = client.get("/api/patients").json()
    assert d["summary"]["total"] == 240
    row = d["patients"][0]
    for key in ("risk_score", "tier", "ns_state", "top_reason", "freshness", "sparklines", "device"):
        assert key in row
    assert row["device"]["simulated"] is True
    b = client.get("/api/alerts?status=open").json()["budget"]
    assert b["status"] in ("within_budget", "over_budget") and b["target_false_alerts_per_patient_day"] > 0


def test_patient_views(client):
    p = "P-0007"
    d = client.get(f"/api/patients/{p}").json()
    assert d["name"] == "Meera Iyer" and d["ehr"]["conditions"][0]["display"] == "Essential hypertension"
    tl = client.get(f"/api/patients/{p}/timeline?days=30").json()
    assert len(tl["rows"]) == 30 and "labels" not in tl
    assert "labels" in client.get(f"/api/patients/{p}/timeline?days=30&reveal=1").json()
    fc = client.get(f"/api/patients/{p}/forecast").json()
    assert len(fc["rhr"]) == 3 and fc["band_72h"][0] <= fc["probability_72h"] <= fc["band_72h"][1]
    ex = client.get(f"/api/patients/{p}/explain").json()
    assert ex["contributors"] and ex["model_version"]
    sim = client.post(f"/api/patients/{p}/simulate", json={"walk_minutes_per_day": 30, "sleep_extra_hours": 1}).json()
    assert sim["scenario"]["probability_72h"] <= sim["baseline"]["probability_72h"]
    me = client.get(f"/api/me/{p}").json()
    assert me["sentence"]["hi"] and me["score"]["state"] == "ready"
    assert client.get("/api/me/P-0240").json()["score"]["state"] == "calibrating"


def test_alert_lifecycle_and_escalation(client):
    alerts = client.get("/api/alerts?status=open").json()["alerts"]
    a = next(x for x in alerts if x["kind"] == "model")
    assert client.post(f"/api/alerts/{a['id']}/ack", json={"by": "Dr Test"}).json()["status"] == "acknowledged"
    assert client.post(f"/api/alerts/{a['id']}/snooze", json={"by": "Dr Test", "hours": 3}).json()["status"] == "snoozed"
    esc = client.post("/api/escalations", json={"patient_id": a["patient_id"], "trigger": "sos", "by": "patient"}).json()
    assert esc["state"] == "contact_1" and esc["actions"]["call_112_url"] == "tel:112"
    got = client.post(f"/api/escalations/{esc['id']}/respond", json={"by": "patient", "action": "im_ok"}).json()
    assert got["state"] == "resolved"
    audit = client.get(f"/api/audit?patient_id={a['patient_id']}&limit=20").json()["entries"]
    assert any(e["action"] == "escalation.im_ok" for e in audit)


def test_consent_opt_out_hides_scores(client):
    p = "P-0010"
    client.post(f"/api/patients/{p}/consent", json={"ai_predictions": False})
    row = next(r for r in client.get("/api/patients?q=P-0010").json()["patients"] if r["id"] == p)
    assert row["tier"] == "opted_out" and row["risk_score"] is None
    assert client.get(f"/api/patients/{p}/forecast").status_code == 403
    client.post(f"/api/patients/{p}/consent", json={"ai_predictions": True})
    assert client.get(f"/api/patients/{p}/forecast").status_code == 200


def test_ingest_rescored_and_export(client):
    """Three nights of rising heart rate and BP from a companion app raise a steady
    person's risk, refresh freshness and show up in the export."""
    p = "P-0024"
    d = client.get(f"/api/patients/{p}").json()
    base_hr, base_sbp = d["baselines"]["rhr_28d_median"], d["baselines"]["sbp_28d_mean"]
    before = d["current"]["probability_72h"]
    obs = []
    for day, bump in (("2026-10-10", 3), ("2026-10-11", 6), ("2026-10-12", 9)):
        for h in (2, 3, 4):
            obs.append({"type": "heart_rate", "t": f"{day}T0{h}:00:00+05:30", "value": base_hr + bump})
        obs.append({"type": "blood_pressure", "t": f"{day}T07:00:00+05:30", "systolic": round(base_sbp + 2.2 * bump), "diastolic": 92})
    r = client.post("/api/ingest", json={"patient_id": p, "source": "health_connect", "observations": obs}).json()
    assert r["accepted"] == 12 and r["rescored"] and r["freshness"]["label"] == "fresh"
    after = client.get(f"/api/patients/{p}").json()["current"]["probability_72h"]
    assert after > before
    wr = client.get(f"/api/patients/{p}/export/wellnessrecord").json()
    assert wr["type"] == "document"
    assert client.get(f"/api/patients/{p}/export/ehr").json()["resourceType"] == "Bundle"


def test_physiology_summary_and_personal_simulate(client):
    p = "P-0007"
    ph = client.get(f"/api/patients/{p}/physiology?reveal=1").json()
    assert {r["key"] for r in ph["responses"]} == {"sleep_rhr", "steps_rhr", "steps_sbp", "sleep_hrv"}
    for r in ph["responses"]:
        assert r["interval"][0] <= r["personal"] <= r["interval"][1]
    assert ph["validation"]["true"]["steps_sbp"] < 0 and ph["best_lever"]["plain"]
    sm = client.get(f"/api/patients/{p}/summary").json()
    assert len(sm["sentences"]) == 3 and sm["next_step"] and sm["streams"]["record"] and sm["streams"]["wearable"]
    sim = client.post(f"/api/patients/{p}/simulate", json={"walk_minutes_per_day": 30}).json()
    lever = sim["levers_applied"][0]
    assert sim["personalised"] and lever["personalised"] and lever["personal_effect"]["sbp"] < 0 and lever["cohort_effect"]["sbp"] < 0
    me = client.get(f"/api/me/{p}").json()
    assert me["what_helps"] and me["what_helps"][0]["hi"]
    card = client.get("/api/model").json()
    assert len(card["physiology"]["pairs"]) == 4 and "fused_no_twin" in card["metrics"]


def test_simulate_is_monotone_and_causal(client):
    """More sleep or walking never raises risk, and a what-if moves risk only through
    causes: the symptoms of an episode already under way stay in the score."""
    for pid in ("P-0007", "P-0120", "P-0042"):
        for body in ({"sleep_extra_hours": 1}, {"walk_minutes_per_day": 30}, {"walk_minutes_per_day": 45, "sleep_extra_hours": 1.5}):
            sim = client.post(f"/api/patients/{pid}/simulate", json=body).json()
            assert sim["scenario"]["probability_72h"] <= sim["baseline"]["probability_72h"] + 1e-9, (pid, body)
            uw = sim["usual_week"]
            assert uw is None or uw["scenario"] <= uw["baseline"] + 1e-9, (pid, body)
    card = client.get("/api/model").json()
    rep = card["metrics"]["repeated"]
    assert len(rep["fused"]["seeds"]) == 3 and rep["fused"]["auroc"]["mean"] > rep["fused_no_twin"]["auroc"]["mean"]


def test_thresholds_preview_and_model_card(client):
    pv = client.post("/api/thresholds/preview", json={"urgent": 75}).json()
    assert pv["draft"]["alerts"] <= pv["current"]["alerts"]
    card = client.get("/api/model").json()
    assert "fused" in card["metrics"] and "wearable_only" in card["metrics"] and card["data"]["synthetic"] is True
