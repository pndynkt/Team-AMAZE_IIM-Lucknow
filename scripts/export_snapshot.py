"""Export a static snapshot of the running API for the hosted demo.

The hosted demo has no backend, so it replays real responses from the trained model.
Run the API first (uvicorn twin.api.main:app --port 8000), then:

    python scripts/export_snapshot.py

Writes:
- frontend/src/api/snapshot/core.json: meta, triage list, alerts, audit, thresholds, model
  card, Meera's (P-0007) full record and a what-if grid for her Simulate tab
- frontend/public/demo/patients/P-xxxx.json: every other person's record, loaded on demand
- frontend/public/demo/exports/: FHIR downloads for the people at the top of the list
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from itertools import product
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
ROOT = Path(__file__).resolve().parents[1] / "frontend"
OUT = ROOT / "src" / "api" / "snapshot"
PATIENTS = ROOT / "public" / "demo" / "patients"
EXPORTS = ROOT / "public" / "demo" / "exports"


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return json.loads(r.read())


def post(path: str, body: dict):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def get_raw(path: str) -> bytes:
    with urllib.request.urlopen(BASE + path, timeout=60) as r:
        return r.read()


def record(pid: str, as_of: str) -> dict:
    d = {
        "patient": get(f"/api/patients/{pid}"),
        "timeline120": get(f"/api/patients/{pid}/timeline?days=120"),
        "forecast": get(f"/api/patients/{pid}/forecast"),
        "explain": get(f"/api/patients/{pid}/explain"),
        "physiology": get(f"/api/patients/{pid}/physiology"),
        "summary": get(f"/api/patients/{pid}/summary"),
        "me": get(f"/api/me/{pid}"),
        "consent": get(f"/api/patients/{pid}/consent"),
    }
    try:
        d["intraday"] = get(f"/api/patients/{pid}/intraday?date={urllib.parse.quote(as_of)}")
    except Exception:  # calibrating patients have no intraday trace
        d["intraday"] = None
    return d


def nightly_time(doc: dict, as_of: str) -> None:
    """Date alerts and their audit entries to the nightly scoring run on the cohort's date.

    The API stamps them when it starts; the hosted demo is frozen on `as_of`, so the replay
    shows them at 06:00 that morning instead of the day the snapshot was taken.
    """
    stamp = f"{as_of}T06:00:00+05:30"
    for a in doc["alerts"].get("alerts", []):
        a["created_at"] = stamp
    for e in doc["audit"].get("entries", []):
        if e.get("action") == "alert.created":
            e["at"] = stamp


def main() -> None:
    for folder in (OUT, PATIENTS, EXPORTS):
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("*.json"):
            old.unlink()
    doc: dict = {}
    doc["meta"] = get("/api/meta")
    doc["patients"] = get("/api/patients")
    doc["alerts"] = get("/api/alerts?status=all")
    doc["thresholds"] = get("/api/thresholds")
    doc["audit"] = get("/api/audit?limit=200")
    doc["model"] = get("/api/model")
    doc["escalations"] = get("/api/escalations")
    as_of = doc["meta"].get("as_of")
    nightly_time(doc, as_of)

    rows = doc["patients"]["patients"]
    ranked = sorted(rows, key=lambda r: -(r.get("risk_score") or 0))
    steady = [r["id"] for r in ranked if r.get("tier") == "low"][:4]
    featured = list(dict.fromkeys(["P-0007", "P-0240"] + [r["id"] for r in ranked[:14]] + steady))

    for r in rows:
        pid = r["id"]
        d = record(pid, as_of)
        if pid == "P-0007":
            doc["demo_patient"] = d
        else:
            (PATIENTS / f"{pid}.json").write_text(json.dumps(d, separators=(",", ":")))
    for pid in featured:
        for kind in ("wellnessrecord", "ehr"):
            (EXPORTS / f"{pid}-{kind}.json").write_bytes(get_raw(f"/api/patients/{pid}/export/{kind}"))
    doc["exports"] = featured

    # What-if grid for the demo patient, matching the Simulate sliders (5 min, 0.5 h steps).
    # Medicine adherence is added in the browser with the backend's own linear formula.
    grid = []
    for walk, sleep, salt, alc in product(range(0, 61, 5), (0, 0.5, 1.0, 1.5, 2.0), (False, True), (False, True)):
        body = {"walk_minutes_per_day": walk, "sleep_extra_hours": sleep, "bp_med_adherence_pct": None,
                "sodium_reduction": salt, "alcohol_free": alc}
        grid.append({"body": body, "response": post("/api/patients/P-0007/simulate", body)})
    doc["simulate_grid"] = {"P-0007": grid}
    (OUT / "core.json").write_text(json.dumps(doc, separators=(",", ":")))
    mb = lambda folder: sum(p.stat().st_size for p in folder.glob("*.json")) / 1e6  # noqa: E731
    print(f"snapshot: core {mb(OUT):.2f} MB, {len(rows) - 1} records {mb(PATIENTS):.1f} MB, "
          f"{len(featured)} people with exports {mb(EXPORTS):.1f} MB, {len(grid)} what-if points")


if __name__ == "__main__":
    main()
