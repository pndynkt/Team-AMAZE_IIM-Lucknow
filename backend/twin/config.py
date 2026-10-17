"""Central configuration. Everything that shapes the synthetic cohort or the model lives here
so a reviewer can see every knob in one place."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("PRATIBIMB_DATA_DIR", BACKEND_DIR / "data" / "synthetic"))
ARTIFACT_DIR = Path(os.environ.get("PRATIBIMB_ARTIFACT_DIR", BACKEND_DIR / "artifacts"))
DB_PATH = Path(os.environ.get("PRATIBIMB_DB", BACKEND_DIR / "pratibimb.db"))

APP_NAME = "Pratibimb"
APP_VERSION = "1.0.0"
MODEL_VERSION = "fusion-lgbm-2026.10.12"
CONDITION = "Hypertension with cardiovascular risk"
EVENT_DEFINITION = "Cardiovascular strain episode within the next 72 hours"
TZ = "+05:30"


@dataclass(frozen=True)
class CohortConfig:
    """Knobs for the synthetic cohort. Changing ``seed`` regenerates a different but
    statistically identical cohort; everything downstream is deterministic."""

    seed: int = 42
    n_patients: int = 240
    days: int = 120
    as_of: date = date(2026, 10, 12)
    # Event horizon used for the label: episode onset within (t, t + horizon_days]
    horizon_days: int = 3
    # Probability scale for strain episodes per 100 patient-days at median risk
    base_episode_rate_per_100_days: float = 0.33
    # Confounders
    infection_rate_per_100_days: float = 0.9
    party_night_rate_per_100_days: float = 2.5
    missed_dose_rate_per_100_days: float = 3.0
    travel_day_rate_per_100_days: float = 1.0
    # Device wear
    missing_night_prob: float = 0.08
    # Market shares used to assign devices (IDC India, FY2025, rounded)
    device_mix: dict = field(
        default_factory=lambda: {
            "Noise": 0.27,
            "boAt": 0.14,
            "Fire-Boltt": 0.10,
            "Samsung": 0.08,
            "Amazfit": 0.06,
            "Apple": 0.02,
            "Other": 0.33,
        }
    )


@dataclass
class Thresholds:
    """Operating thresholds. The clinician can preview and apply changes from the console;
    every change is written to the audit log."""

    watch: int = 30
    urgent: int = 60
    ns_rhr_delta_yellow: float = 3.0
    ns_rhr_delta_red: float = 4.0
    ns_consecutive_nights: int = 2
    hrv_swc_multiplier: float = 0.5
    min_confidence_for_urgent: str = "medium"  # low | medium | high
    target_false_alerts_per_patient_day: float = 0.045

    def to_dict(self) -> dict:
        return {
            "watch": self.watch,
            "urgent": self.urgent,
            "ns_rhr_delta_yellow": self.ns_rhr_delta_yellow,
            "ns_rhr_delta_red": self.ns_rhr_delta_red,
            "ns_consecutive_nights": self.ns_consecutive_nights,
            "hrv_swc_multiplier": self.hrv_swc_multiplier,
            "min_confidence_for_urgent": self.min_confidence_for_urgent,
            "target_false_alerts_per_patient_day": self.target_false_alerts_per_patient_day,
        }


DEFAULT_COHORT = CohortConfig()
DEFAULT_THRESHOLDS = Thresholds()

# Demo clock: real-world seconds are divided by this factor inside the escalation ladder,
# so a 60 s countdown takes 6 s in a demo. Set PRATIBIMB_DEMO_SPEED=1 for real timings.
DEMO_SPEED = float(os.environ.get("PRATIBIMB_DEMO_SPEED", "10"))

# Escalation ladder timings in real seconds (before the demo clock is applied)
ESCALATION_TIMINGS = {
    "user_prompt_s": 60,
    "contact_retry_s": 120,
    "doctor_sla_s": 3600,
}
