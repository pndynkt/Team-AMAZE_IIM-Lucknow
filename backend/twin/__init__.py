"""Pratibimb: a digital twin for Indian adults with hypertension and cardiovascular risk.

Package layout
--------------
- ``twin.data``      synthetic EHR (FHIR R4) and wearable stream generators, Synthea loader
- ``twin.features``  personal baselines and the leakage-safe feature matrix
- ``twin.models``    static risk score, NightSignal-style rule, fusion classifier, quantile forecasts, SHAP
- ``twin.engine``    the per-patient twin, alerting with a false-alert budget, the escalation ladder, FHIR export
- ``twin.api``       FastAPI application
- ``twin.store``     SQLite persistence for alerts, escalations, consent and the audit log
"""

__version__ = "1.0.0"
