"""Tiny SQLite layer. Rows are stored as JSON documents with a few indexed columns so the
schema stays readable and the audit log is append-only."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Iterable

IST = timezone(timedelta(hours=5, minutes=30))


def now_iso() -> str:
    return datetime.now(IST).isoformat(timespec="seconds")


SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY, patient_id TEXT, status TEXT, tier TEXT, kind TEXT, created_at TEXT, doc TEXT
);
CREATE INDEX IF NOT EXISTS ix_alerts_patient ON alerts(patient_id);
CREATE INDEX IF NOT EXISTS ix_alerts_status ON alerts(status);
CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY, patient_id TEXT, state TEXT, started_at TEXT, doc TEXT
);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, actor_type TEXT, patient_id TEXT,
    action TEXT, object TEXT, detail TEXT, consent_basis TEXT, channel TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_patient ON audit(patient_id);
CREATE TABLE IF NOT EXISTS consent (patient_id TEXT PRIMARY KEY, doc TEXT);
CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT, date TEXT, kind TEXT, label TEXT, by TEXT, at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, doc TEXT);
CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT, at TEXT, answer TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT, at TEXT, source TEXT, accepted INTEGER, rejected INTEGER, doc TEXT
);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);
"""


class DB:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    # --- generic helpers -------------------------------------------------
    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cur

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, tuple(params)).fetchall()

    def next_id(self, name: str, prefix: str, width: int = 4) -> str:
        with self._lock:
            row = self._conn.execute("SELECT value FROM counters WHERE name=?", (name,)).fetchone()
            value = (row["value"] if row else 0) + 1
            self._conn.execute("INSERT OR REPLACE INTO counters(name, value) VALUES (?, ?)", (name, value))
            self._conn.commit()
        return f"{prefix}-{value:0{width}d}"

    # --- audit -------------------------------------------------------------
    def audit(self, actor: str, actor_type: str, patient_id: str | None, action: str, obj: str | None,
              detail: str = "", consent_basis: str | None = None, channel: str | None = None) -> dict:
        at = now_iso()
        cur = self.execute(
            "INSERT INTO audit(at, actor, actor_type, patient_id, action, object, detail, consent_basis, channel) VALUES (?,?,?,?,?,?,?,?,?)",
            (at, actor, actor_type, patient_id, action, obj, detail, consent_basis, channel))
        return {"id": cur.lastrowid, "at": at, "actor": actor, "actor_type": actor_type, "patient_id": patient_id,
                "action": action, "object": obj, "detail": detail, "consent_basis": consent_basis, "channel": channel}

    def audit_entries(self, patient_id: str | None = None, limit: int = 100) -> list[dict]:
        if patient_id:
            rows = self.query("SELECT * FROM audit WHERE patient_id=? ORDER BY id DESC LIMIT ?", (patient_id, limit))
        else:
            rows = self.query("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows]

    # --- documents -----------------------------------------------------------
    def put_alert(self, doc: dict) -> None:
        self.execute("INSERT OR REPLACE INTO alerts(id, patient_id, status, tier, kind, created_at, doc) VALUES (?,?,?,?,?,?,?)",
                     (doc["id"], doc["patient_id"], doc["status"], doc["tier"], doc["kind"], doc["created_at"], json.dumps(doc)))

    def get_alert(self, alert_id: str) -> dict | None:
        rows = self.query("SELECT doc FROM alerts WHERE id=?", (alert_id,))
        return json.loads(rows[0]["doc"]) if rows else None

    def alerts(self, status: str | None = None, patient_id: str | None = None) -> list[dict]:
        sql, params = "SELECT doc FROM alerts", []
        conds = []
        if status and status != "all":
            conds.append("status=?"); params.append(status)
        if patient_id:
            conds.append("patient_id=?"); params.append(patient_id)
        if conds:
            sql += " WHERE " + " AND ".join(conds)
        sql += " ORDER BY created_at DESC"
        return [json.loads(r["doc"]) for r in self.query(sql, params)]

    def put_escalation(self, doc: dict) -> None:
        self.execute("INSERT OR REPLACE INTO escalations(id, patient_id, state, started_at, doc) VALUES (?,?,?,?,?)",
                     (doc["id"], doc["patient_id"], doc["state"], doc["started_at"], json.dumps(doc)))

    def get_escalation(self, esc_id: str) -> dict | None:
        rows = self.query("SELECT doc FROM escalations WHERE id=?", (esc_id,))
        return json.loads(rows[0]["doc"]) if rows else None

    def escalations(self, active_only: bool = False, patient_id: str | None = None) -> list[dict]:
        sql, params, conds = "SELECT doc FROM escalations", [], []
        if active_only:
            conds.append("state NOT IN ('resolved','cancelled')")
        if patient_id:
            conds.append("patient_id=?"); params.append(patient_id)
        if conds:
            sql += " WHERE " + " AND ".join(conds)
        sql += " ORDER BY started_at DESC"
        return [json.loads(r["doc"]) for r in self.query(sql, params)]

    def get_consent(self, patient_id: str) -> dict | None:
        rows = self.query("SELECT doc FROM consent WHERE patient_id=?", (patient_id,))
        return json.loads(rows[0]["doc"]) if rows else None

    def put_consent(self, patient_id: str, doc: dict) -> None:
        self.execute("INSERT OR REPLACE INTO consent(patient_id, doc) VALUES (?,?)", (patient_id, json.dumps(doc)))

    def add_annotation(self, patient_id: str, date: str, kind: str, label: str, by: str) -> dict:
        at = now_iso()
        cur = self.execute("INSERT INTO annotations(patient_id, date, kind, label, by, at) VALUES (?,?,?,?,?,?)",
                           (patient_id, date, kind, label, by, at))
        return {"id": cur.lastrowid, "date": date, "kind": kind, "label": label, "by": by, "at": at}

    def annotations(self, patient_id: str) -> list[dict]:
        return [dict(r) for r in self.query("SELECT id, date, kind, label, by, at FROM annotations WHERE patient_id=? ORDER BY date", (patient_id,))]

    def get_setting(self, key: str, default: Any = None) -> Any:
        rows = self.query("SELECT doc FROM settings WHERE key=?", (key,))
        return json.loads(rows[0]["doc"]) if rows else default

    def put_setting(self, key: str, doc: Any) -> None:
        self.execute("INSERT OR REPLACE INTO settings(key, doc) VALUES (?,?)", (key, json.dumps(doc)))

    def add_checkin(self, patient_id: str, answer: str, note: str) -> None:
        self.execute("INSERT INTO checkins(patient_id, at, answer, note) VALUES (?,?,?,?)", (patient_id, now_iso(), answer, note))

    def checkins(self, patient_id: str) -> list[dict]:
        return [dict(r) for r in self.query("SELECT * FROM checkins WHERE patient_id=? ORDER BY id DESC", (patient_id,))]

    def log_ingest(self, patient_id: str, source: str, accepted: int, rejected: int, doc: dict) -> None:
        self.execute("INSERT INTO ingest_log(patient_id, at, source, accepted, rejected, doc) VALUES (?,?,?,?,?,?)",
                     (patient_id, now_iso(), source, accepted, rejected, json.dumps(doc)))

    def ingest_sources(self, patient_id: str) -> list[dict]:
        return [dict(r) for r in self.query("SELECT at, source, accepted FROM ingest_log WHERE patient_id=? ORDER BY id DESC LIMIT 5", (patient_id,))]
