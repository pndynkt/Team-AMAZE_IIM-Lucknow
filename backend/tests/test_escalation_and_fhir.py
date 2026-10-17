import json
import os

import pandas as pd
import pytest

from twin.engine.escalation import EscalationEngine
from twin.engine.fhir import parse_observations, wellness_record
from twin.engine.twin import TwinService
from twin.store.db import DB


@pytest.fixture()
def twin(cohort, tmp_path):
    return TwinService(cohort, DB(tmp_path / "t.db"))


def test_ladder_transitions_and_audit(twin):
    eng = EscalationEngine(twin.db, twin, speed=1000)
    doc = eng.start("P-0007", "fall", "system")
    assert doc["state"] == "user_prompt"
    doc = eng.advance(doc, "contact_1")
    assert doc["state"] == "contact_1"
    channels = [m["channel"] for m in doc["steps"][1]["messages"]]
    assert channels == ["push", "sms", "whatsapp", "voice"]
    sms = doc["steps"][1]["messages"][1]
    assert sms["header"].endswith("-S") and sms["mock"] is True and "112" in sms["body"]
    assert doc["actions"]["call_112_url"] == "tel:112"
    doc = eng.advance(doc, "contact_2")
    assert [m["channel"] for m in doc["steps"][2]["messages"]] == ["sms", "voice"]
    doc = eng.advance(doc, "doctor")
    assert doc["state"] == "doctor" and doc["steps"][3]["status"] == "sent"
    doc = eng.respond(doc["id"], "doctor", "resolved", "handled")
    assert doc["state"] == "resolved" and doc["outcome"] == "handled"
    actions = [e["action"] for e in twin.db.audit_entries("P-0007", 50)]
    assert "escalation.started" in actions and "escalation.message_sent" in actions and "escalation.resolved" in actions
    assert all(e["consent_basis"] == "emergency_contacts" for e in twin.db.audit_entries("P-0007", 50) if e["action"].startswith("escalation."))


def test_patient_sos_skips_the_prompt_the_phone_already_ran(twin):
    eng = EscalationEngine(twin.db, twin, speed=1000)
    doc = eng.start("P-0007", "sos", "patient")
    assert doc["state"] == "contact_1" and doc["steps"][0]["status"] == "no_response"
    assert [m["channel"] for m in doc["steps"][1]["messages"]] == ["push", "sms", "whatsapp", "voice"]
    doc = eng.respond(doc["id"], "patient", "im_ok")
    assert doc["state"] == "resolved" and doc["outcome"] == "patient_ok_after_contacts"


def test_im_ok_cancels_during_prompt_and_acknowledgement_stops_the_ladder(twin):
    eng = EscalationEngine(twin.db, twin, speed=1000)
    doc = eng.start("P-0007", "caregiver", "contact:C1")
    doc = eng.respond(doc["id"], "patient", "im_ok")
    assert doc["state"] == "cancelled" and doc["outcome"] == "user_ok"
    doc2 = eng.start("P-0008", "fall", "system")
    doc2 = eng.advance(doc2, "contact_1")
    doc2 = eng.respond(doc2["id"], "contact:C1", "acknowledged")
    assert doc2["acknowledged_by"] == "contact:C1"
    # the timer path refuses to advance once acknowledged
    assert eng._advance_if(doc2["id"], "contact_1", "contact_2") is False


def test_parse_simple_observations_and_fhir_bundle():
    simple = {"observations": [
        {"type": "heart_rate", "t": "2026-10-12T03:00:00+05:30", "value": 70},
        {"type": "heart_rate", "t": "2026-10-12T04:00:00+05:30", "value": 62},
        {"type": "heart_rate", "t": "2026-10-12T05:00:00+05:30", "value": 64},
        {"type": "blood_pressure", "t": "2026-10-12T07:00:00+05:30", "systolic": 150, "diastolic": 92},
        {"type": "steps", "date": "2026-10-12", "value": 4000},
        {"type": "bogus", "value": 1},
    ]}
    rows, acc, rej = parse_observations(simple)
    assert acc == 5 and rej == 1 and rows[0]["date"] == "2026-10-12"
    assert 62 <= rows[0]["rhr"] <= 64 and rows[0]["sbp_home"] == 150 and rows[0]["steps"] == 4000

    bundle = {"resourceType": "Bundle", "type": "collection", "entry": [
        {"resource": {"resourceType": "Observation", "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4"}]},
                      "effectiveDateTime": "2026-10-12T02:00:00+05:30", "valueQuantity": {"value": 58}}},
        {"resource": {"resourceType": "Observation", "code": {"coding": [{"system": "http://loinc.org", "code": "85354-9"}]},
                      "effectiveDateTime": "2026-10-12T07:00:00+05:30",
                      "component": [{"code": {"coding": [{"code": "8480-6"}]}, "valueQuantity": {"value": 140}},
                                    {"code": {"coding": [{"code": "8462-4"}]}, "valueQuantity": {"value": 88}}]}},
    ]}
    rows, acc, rej = parse_observations({"observations": bundle})
    assert acc == 2 and rows[0]["rhr"] == 58 and rows[0]["sbp_home"] == 140


def test_wellness_record_shape(twin):
    detail = twin.patient_detail("P-0007")
    b = wellness_record(detail, twin.c.daily_for("P-0007"), days=7)
    assert b["resourceType"] == "Bundle" and b["type"] == "document"
    kinds = [e["resource"]["resourceType"] for e in b["entry"]]
    assert kinds[0] == "Composition" and kinds[1] == "Patient" and kinds.count("Observation") > 20
    codes = {e["resource"]["code"]["coding"][0]["code"] for e in b["entry"] if e["resource"]["resourceType"] == "Observation"}
    assert {"8867-4", "8480-6", "55423-8"} <= codes
    assert "XXXX" in b["entry"][1]["resource"]["identifier"][0]["value"]  # ABHA stays masked
    json.dumps(b)  # serialisable
