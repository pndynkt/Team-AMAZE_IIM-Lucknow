"""Simulated live stream (Server-Sent Events).

Replays the deterministic 5-minute intraday trace for the cohort's "today" one sample per
tick, labelled ``simulated: true``. A scenario can be injected (acute tachycardia or
bradycardia); when the acute rule fires (10 simulated minutes at or above 140 bpm or at
or below 35 bpm) the engine raises a red ``acute`` alert and starts the check-in ladder,
which is the only way the live stream can trigger the red tier.
"""

from __future__ import annotations

import asyncio
import json
from datetime import date

from ..config import DEMO_SPEED


class StreamService:
    def __init__(self, twin, alerts, escalation, speed: float = DEMO_SPEED):
        self.twin = twin
        self.alerts = alerts
        self.escalation = escalation
        self.speed = max(speed, 0.01)
        self._scenario: dict[str, str] = {}
        self._pos: dict[str, int] = {}
        self._acute_fired: set[str] = set()

    def inject(self, pid: str, scenario: str) -> dict:
        self._scenario[pid] = scenario
        if scenario == "normal":
            self._acute_fired.discard(pid)
        self.twin.db.audit("demo", "system", pid, "stream.inject", pid, f"scenario={scenario}")
        return {"ok": True, "scenario": scenario}

    async def events(self, pid: str):
        day: date = self.twin.c.as_of
        base = self.twin.intraday(pid, day)["samples"]
        i = self._pos.get(pid, 0)
        recent: list[int] = []
        while True:
            scenario = self._scenario.get(pid, "normal")
            s = dict(base[i % len(base)])
            if scenario == "acute_tachycardia":
                s["hr"] = 142 + (i * 7) % 11
            elif scenario == "bradycardia":
                s["hr"] = 34 + (i * 3) % 3
            s["simulated"] = True
            s["scenario"] = scenario
            recent = (recent + [s["hr"]])[-2:]  # two 5-minute samples = 10 simulated minutes
            if len(recent) == 2 and (min(recent) >= 140 or max(recent) <= 35) and pid not in self._acute_fired:
                self._acute_fired.add(pid)
                kind = "tachycardia" if min(recent) >= 140 else "bradycardia"
                alert = self.alerts.create(pid, "urgent", "acute", f"Sustained {kind} on live stream",
                                           f"Heart rate {recent[-1]} bpm for 10 min (simulated live source)", "high",
                                           actor="stream", actor_type="system", consent_basis="wearable")
                esc = self.escalation.start(pid, "acute", "system", alert_id=alert["id"])
                self.alerts.mark_escalated(alert["id"], "system", esc["id"], "Acute reading on live stream")
                s["acute_alert_id"] = alert["id"]
                s["escalation_id"] = esc["id"]
            yield f"data: {json.dumps(s)}\n\n"
            i += 1
            self._pos[pid] = i
            await asyncio.sleep(max(60.0 / self.speed, 0.5))
