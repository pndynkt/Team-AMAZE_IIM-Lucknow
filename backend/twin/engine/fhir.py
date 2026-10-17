"""FHIR R4 in and out.

- ``parse_observations``: accepts the simple observation list from an Android companion,
  Oura/Whoop webhook relay, Apple Health Auto Export or CSV, **or** a FHIR R4 Bundle of
  Observation resources (vital-signs profile LOINC codes), and folds them into daily
  aggregates the twin understands.
- ``wellness_record``: renders a patient's recent wearable data as an ABDM-style
  WellnessRecord document bundle (Composition + Patient + Observations with LOINC
  codes), the formal home for wearable data in the NRCeS ABDM FHIR implementation guide.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

LOINC_IN = {
    "8867-4": "heart_rate", "80404-7": "hrv_rmssd", "55423-8": "steps", "41950-7": "steps", "93832-4": "sleep_duration",
    "8480-6": "systolic", "8462-4": "diastolic", "9279-1": "resp_rate", "2708-6": "spo2", "59408-5": "spo2", "85354-9": "blood_pressure",
}

LOINC_OUT = {
    "rhr": ("8867-4", "Heart rate", "/min"), "rmssd": ("80404-7", "R-R interval.standard deviation (Heart rate variability)", "ms"),
    "sleep_min": ("93832-4", "Sleep duration", "min"), "steps": ("55423-8", "Number of steps in unspecified time Pedometer", "{steps}"),
    "sbp_home": ("8480-6", "Systolic blood pressure", "mm[Hg]"), "dbp_home": ("8462-4", "Diastolic blood pressure", "mm[Hg]"),
    "resp_rate": ("9279-1", "Respiratory rate", "/min"), "spo2": ("2708-6", "Oxygen saturation in Arterial blood", "%"),
}


def _parse_dt(s: str) -> pd.Timestamp:
    return pd.Timestamp(s)


def parse_observations(payload: dict) -> tuple[list[dict], int, int]:
    """Returns ``(daily_rows, accepted, rejected)``. Each daily row has ``date`` plus any of
    rhr, lnrmssd, rmssd, sleep_min, sleep_eff, steps, resp_rate, spo2, sbp_home, dbp_home."""
    obs = payload.get("observations") or []
    if isinstance(obs, dict) and obs.get("resourceType") == "Bundle":
        obs = _flatten_fhir(obs)
    by_day: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    accepted = rejected = 0
    for o in obs:
        try:
            t = o.get("type")
            if t == "heart_rate":
                ts = _parse_dt(o["t"]); by_day[ts.date().isoformat()]["hr"].append((ts, float(o["value"]))); accepted += 1
            elif t == "hrv_rmssd":
                ts = _parse_dt(o["t"]); by_day[ts.date().isoformat()]["rmssd"].append(float(o["value"])); accepted += 1
            elif t == "sleep_session":
                start, end = _parse_dt(o["start"]), _parse_dt(o["end"])
                d = end.date().isoformat()
                by_day[d]["sleep_min"].append((end - start).total_seconds() / 60)
                if o.get("efficiency") is not None:
                    by_day[d]["sleep_eff"].append(float(o["efficiency"]))
                accepted += 1
            elif t == "steps":
                d = o.get("date") or _parse_dt(o["t"]).date().isoformat()
                by_day[d]["steps"].append(float(o["value"])); accepted += 1
            elif t == "blood_pressure":
                ts = _parse_dt(o["t"]); d = ts.date().isoformat()
                by_day[d]["sbp"].append(float(o["systolic"])); by_day[d]["dbp"].append(float(o["diastolic"])); accepted += 1
            elif t == "resp_rate":
                ts = _parse_dt(o["t"]); by_day[ts.date().isoformat()]["resp"].append(float(o["value"])); accepted += 1
            elif t == "spo2":
                ts = _parse_dt(o["t"]); by_day[ts.date().isoformat()]["spo2"].append(float(o["value"])); accepted += 1
            else:
                rejected += 1
        except (KeyError, ValueError, TypeError):
            rejected += 1
    rows = []
    for d, agg in sorted(by_day.items()):
        row: dict = {"date": d}
        if agg["hr"]:
            night = [v for ts, v in agg["hr"] if 0 <= ts.hour < 7]
            vals = night or [v for _, v in agg["hr"]]
            row["rhr"] = float(np.percentile(vals, 10)) if len(vals) >= 3 else float(np.min(vals))
        if agg["rmssd"]:
            r = float(np.mean(agg["rmssd"])); row["rmssd"] = r; row["lnrmssd"] = float(np.log(max(r, 1)))
        if agg["sleep_min"]:
            row["sleep_min"] = float(np.sum(agg["sleep_min"]))
        if agg["sleep_eff"]:
            row["sleep_eff"] = float(np.mean(agg["sleep_eff"]))
        if agg["steps"]:
            row["steps"] = float(np.sum(agg["steps"]))
        if agg["sbp"]:
            row["sbp_home"] = float(np.mean(agg["sbp"])); row["dbp_home"] = float(np.mean(agg["dbp"]))
        if agg["resp"]:
            row["resp_rate"] = float(np.mean(agg["resp"]))
        if agg["spo2"]:
            row["spo2"] = float(np.mean(agg["spo2"]))
        rows.append(row)
    return rows, accepted, rejected


def _flatten_fhir(bundle: dict) -> list[dict]:
    out = []
    for e in bundle.get("entry", []):
        r = e.get("resource", {})
        if r.get("resourceType") != "Observation":
            continue
        codes = [c.get("code") for c in r.get("code", {}).get("coding", [])]
        key = next((LOINC_IN[c] for c in codes if c in LOINC_IN), None)
        t = r.get("effectiveDateTime") or r.get("effectivePeriod", {}).get("end")
        if key == "blood_pressure":
            comp = {c["code"]["coding"][0]["code"]: c["valueQuantity"]["value"] for c in r.get("component", [])}
            out.append({"type": "blood_pressure", "t": t, "systolic": comp.get("8480-6"), "diastolic": comp.get("8462-4")})
        elif key in ("systolic", "diastolic"):
            continue  # handled through the panel
        elif key == "sleep_duration":
            p = r.get("effectivePeriod", {})
            out.append({"type": "sleep_session", "start": p.get("start"), "end": p.get("end")})
        elif key == "steps":
            out.append({"type": "steps", "t": t, "value": r.get("valueQuantity", {}).get("value")})
        elif key:
            out.append({"type": key, "t": t, "value": r.get("valueQuantity", {}).get("value")})
    return out


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def wellness_record(patient: dict, daily: pd.DataFrame, days: int = 14) -> dict:
    pid = patient["id"]
    recent = daily.tail(days)
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    observations = []
    for _, row in recent.iterrows():
        d = pd.Timestamp(row["date"]).date().isoformat()
        for col, (code, display, unit) in LOINC_OUT.items():
            v = row.get(col)
            if v is None or (isinstance(v, float) and np.isnan(v)):
                continue
            observations.append({
                "resourceType": "Observation",
                "id": f"{pid}-{col}-{d}",
                "meta": {"profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/ObservationVitalSigns"
                                     if col in ("rhr", "sbp_home", "dbp_home", "resp_rate", "spo2")
                                     else "https://nrces.in/ndhm/fhir/r4/StructureDefinition/ObservationPhysicalActivity"]},
                "status": "final",
                "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                           "code": "vital-signs" if col != "steps" else "activity"}]}],
                "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}]},
                "subject": {"reference": f"Patient/{pid}"},
                "effectiveDateTime": f"{d}T07:00:00+05:30",
                "valueQuantity": {"value": round(float(v), 1), "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
                "device": {"display": f"{patient['device']['brand']} {patient['device']['model']} via {patient['device']['source']}"},
            })
    composition = {
        "resourceType": "Composition",
        "id": f"{pid}-wellness",
        "meta": {"profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/WellnessRecord"]},
        "status": "final",
        "type": {"coding": [{"system": "http://snomed.info/sct", "code": "419891008", "display": "Record artifact"}], "text": "Wellness Record"},
        "subject": {"reference": f"Patient/{pid}"},
        "date": now,
        "author": [{"display": "Pratibimb digital twin (research prototype)"}],
        "title": f"Wellness Record, last {days} days",
        "section": [
            {"title": "Vital Signs", "entry": [{"reference": f"Observation/{o['id']}"} for o in observations if o["category"][0]["coding"][0]["code"] == "vital-signs"]},
            {"title": "Physical Activity", "entry": [{"reference": f"Observation/{o['id']}"} for o in observations if o["category"][0]["coding"][0]["code"] == "activity"]},
        ],
    }
    patient_res = {
        "resourceType": "Patient", "id": pid,
        "meta": {"profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"]},
        "identifier": [{"system": "https://healthid.ndhm.gov.in", "value": patient["abha_masked"]}],
        "name": [{"text": patient["name"]}], "gender": "female" if patient["sex"] == "F" else "male",
    }
    return {
        "resourceType": "Bundle", "id": f"{pid}-wellnessrecord", "type": "document",
        "meta": {"profile": ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle"],
                 "tag": [{"system": "urn:pratibimb", "code": "synthetic", "display": "Synthetic data, not a real person"}]},
        "timestamp": now,
        "entry": [{"fullUrl": f"urn:uuid:Composition-{composition['id']}", "resource": composition},
                  {"fullUrl": f"urn:uuid:Patient-{pid}", "resource": patient_res}]
                 + [{"fullUrl": f"urn:uuid:Observation-{o['id']}", "resource": o} for o in observations],
    }
