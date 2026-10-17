"""Request bodies (responses are documented in docs/API.md and built as plain dicts)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AckBody(BaseModel):
    by: str = "Dr Kavya Rao"
    note: str = ""


class SnoozeBody(BaseModel):
    by: str = "Dr Kavya Rao"
    hours: int = Field(3, ge=1, le=72)


class EscalateBody(BaseModel):
    by: str = "Dr Kavya Rao"
    reason: str = ""


class ResolveBody(BaseModel):
    by: str = "Dr Kavya Rao"
    outcome: Literal["false_alarm", "true_event", "handled"] = "handled"
    note: str = ""


class ThresholdsBody(BaseModel):
    watch: int | None = None
    urgent: int | None = None
    ns_rhr_delta_yellow: float | None = None
    ns_rhr_delta_red: float | None = None
    ns_consecutive_nights: int | None = None
    hrv_swc_multiplier: float | None = None
    min_confidence_for_urgent: Literal["low", "medium", "high"] | None = None
    target_false_alerts_per_patient_day: float | None = None
    patient_id: str | None = None
    by: str = "Dr Kavya Rao"


class EscalationStart(BaseModel):
    patient_id: str
    trigger: Literal["sos", "fall", "caregiver", "acute", "clinician"] = "sos"
    by: str = "patient"
    alert_id: str | None = None
    location: dict[str, Any] | None = None


class EscalationRespond(BaseModel):
    by: str
    action: Literal["im_ok", "acknowledged", "reached_patient", "resolved", "false_alarm"]
    note: str = ""


class ConsentBody(BaseModel):
    ehr: bool | None = None
    wearable: bool | None = None
    ai_predictions: bool | None = None
    emergency_contacts: bool | None = None
    withdraw: bool = False


class CheckinBody(BaseModel):
    answer: str
    note: str = ""


class AnnotateBody(BaseModel):
    date: str
    kind: Literal["symptom", "meal", "missed_dose", "note"] = "note"
    label: str
    by: str = "patient"


class SimulateBody(BaseModel):
    walk_minutes_per_day: float | None = None
    sleep_extra_hours: float | None = None
    bp_med_adherence_pct: float | None = None
    sodium_reduction: bool = False
    alcohol_free: bool = False


class IngestBody(BaseModel):
    patient_id: str
    source: Literal["simulated", "health_connect", "oura", "whoop", "apple_hae", "csv", "samsung_health"] = "health_connect"
    device: dict[str, Any] | None = None
    observations: Any


class InjectBody(BaseModel):
    scenario: Literal["acute_tachycardia", "bradycardia", "normal"] = "acute_tachycardia"
