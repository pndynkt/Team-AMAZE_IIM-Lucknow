# Pratibimb API contract (v1)

Base URL in development: `http://localhost:8000`. All routes are under `/api`. All responses are JSON unless stated. Times are ISO 8601 with timezone (`2026-10-12T06:40:00+05:30`). Dates are `YYYY-MM-DD`. The backend serves the built front end from `/` in production, so the front end uses relative `/api/...` paths.

The cohort is synthetic. "Today" for the cohort is `meta.as_of` (see `/api/meta`), not the wall clock, so the demo is reproducible.

## Conventions

- `tier`: `"low" | "watch" | "urgent"`. Score cut-offs: low 0 to 29, watch 30 to 59, urgent 60 to 100.
- `ns_state` (NightSignal-style rule state): `"green" | "yellow" | "red"`.
- `freshness`: `{ "last_sample_at": iso, "minutes_ago": int, "label": "fresh" | "stale" | "offline" }` (fresh ≤ 90 min, stale ≤ 24 h, offline otherwise).
- `source`: `"simulated" | "health_connect" | "oura" | "whoop" | "apple_hae" | "csv"`. Anything from `simulated` carries `"simulated": true` so the UI can badge it.
- Errors: `{ "detail": "message" }` with 4xx/5xx.

## GET /api/meta

```json
{
  "app": "Pratibimb",
  "version": "1.0.0",
  "as_of": "2026-10-12",
  "cohort_size": 240,
  "days": 120,
  "condition": "Hypertension with cardiovascular risk",
  "event_definition": "Cardiovascular strain episode within the next 72 hours",
  "model_version": "fusion-lgbm-2026.10.12",
  "demo_speed": 10
}
```

## GET /api/patients

Triage list. Sorted by `risk_score` desc by default. Query: `?tier=urgent&sort=risk_score|freshness|name&q=text`.

```json
{
  "as_of": "2026-10-12",
  "summary": { "total": 240, "urgent": 9, "watch": 31, "low": 200, "open_alerts": 14, "false_alert_rate_per_patient_day": 0.041 },
  "patients": [
    {
      "id": "P-0007",
      "name": "Meera Iyer",
      "age": 58, "sex": "F", "city": "Bengaluru",
      "conditions": ["Essential hypertension", "Type 2 diabetes"],
      "device": { "brand": "Noise", "model": "ColorFit Pro 5", "source": "simulated", "simulated": true },
      "risk_score": 71, "tier": "urgent", "ns_state": "red",
      "risk_delta_7d": 23,
      "top_reason": "Overnight HR +9 bpm vs your baseline for 3 nights",
      "freshness": { "last_sample_at": "2026-10-12T06:40:00+05:30", "minutes_ago": 47, "label": "fresh" },
      "wear_time_pct_7d": 86,
      "sparklines": { "rhr": [62,63,62,64,66,69,71], "hrv": [38,37,36,33,31,29,28], "sbp": [134,136,135,139,142,147,151] },
      "open_alert_id": "AL-0231",
      "escalation_status": null
    }
  ]
}
```

## GET /api/patients/{id}

```json
{
  "id": "P-0007", "name": "Meera Iyer", "age": 58, "sex": "F", "city": "Bengaluru", "state": "Karnataka",
  "abha_masked": "91-XXXX-XXXX-4821",
  "consent": { "ehr": true, "wearable": true, "ai_predictions": true, "emergency_contacts": true, "updated_at": iso },
  "ehr": {
    "conditions": [ { "code": "59621000", "system": "SNOMED", "display": "Essential hypertension", "onset": "2019-03-01" } ],
    "medications": [ { "name": "Amlodipine 5 mg", "class": "CCB", "adherence_30d_pct": 72 } ],
    "labs": [ { "name": "HbA1c", "loinc": "4548-4", "value": 7.1, "unit": "%", "date": "2026-08-20", "flag": "high" } ],
    "vitals_clinic": { "sbp": 148, "dbp": 92, "bmi": 28.4, "date": "2026-08-20" },
    "genetics": { "polygenic_risk_tier": "high", "note": "Simulated CAD polygenic risk tier (synthetic)" },
    "family_history": ["Father: myocardial infarction at 61"],
    "smoker": false, "diabetes": true, "ckd": false, "prior_mi": false
  },
  "static_risk": { "framingham_10y_pct": 18.4, "label": "high", "south_asian_note": "Framingham under-estimates risk in South Asians; WHO SEAR chart planned." },
  "device": { "brand": "Noise", "model": "ColorFit Pro 5", "source": "simulated", "simulated": true, "sync_interval": "hourly" },
  "baselines": { "rhr_28d_median": 62.0, "lnrmssd_60d_mean": 3.61, "lnrmssd_swc": 0.08, "sbp_28d_mean": 136.2, "nights_available": 112 },
  "current": { "risk_score": 71, "tier": "urgent", "ns_state": "red", "probability_72h": 0.71, "probability_band": [0.58, 0.80], "as_of": "2026-10-12" },
  "emergency_contacts": [ { "id": "C1", "name": "Arjun Iyer", "relation": "Son", "phone_masked": "+91 98XXX XX412", "channels": ["sms","whatsapp","voice"], "consented_at": iso } ],
  "clinician": { "name": "Dr Kavya Rao", "role": "Physician", "sla_minutes": 60 }
}
```

## GET /api/patients/{id}/timeline?days=30

Daily rows, oldest first. Nulls where the device was not worn.

```json
{
  "id": "P-0007", "days": 30,
  "rows": [
    { "date": "2026-09-13", "rhr": 62.1, "lnrmssd": 3.64, "rmssd": 38.1, "sleep_min": 412, "sleep_eff": 0.88, "steps": 6120, "resp_rate": 14.2, "spo2": 97.1, "sbp_home": 134, "dbp_home": 84, "ns_state": "green", "risk_score": 12, "tier": "low", "missing": false, "events": [] }
  ],
  "baseline_band": { "rhr": [59.5, 64.5], "lnrmssd": [3.53, 3.69], "sbp": [130, 142] },
  "annotations": [ { "date": "2026-10-03", "kind": "missed_dose", "label": "Missed amlodipine", "by": "patient" }, { "date": "2026-10-09", "kind": "note", "label": "Called patient, advised BP check", "by": "Dr Kavya Rao" } ],
  "labels": [ { "date": "2026-10-13", "kind": "strain_episode", "label": "Synthetic ground-truth: strain episode onset", "visible_to_clinician": false } ]
}
```

`labels` is only present when `?reveal=1` (used by the model page; never shown in the default clinician view).

## GET /api/patients/{id}/intraday?date=2026-10-12

5-minute heart rate for one day. `"simulated": true` always in this cohort.

```json
{ "id": "P-0007", "date": "2026-10-12", "interval_min": 5, "source": "simulated", "simulated": true,
  "samples": [ { "t": "2026-10-12T00:00:00+05:30", "hr": 61 } ],
  "overnight_window": ["00:00", "07:00"], "overnight_rhr": 71.2 }
```

## GET /api/patients/{id}/forecast

72-hour forecast for overnight RHR and morning SBP, plus episode probability per day. Bands are P10/P50/P90 from quantile models; probability band is from a 5-model bag.

```json
{
  "id": "P-0007", "as_of": "2026-10-12", "horizon_days": 3,
  "history": [ { "date": "2026-10-10", "rhr": 69.0, "sbp": 147 }, { "date": "2026-10-11", "rhr": 71.0, "sbp": 151 } ],
  "rhr": [ { "date": "2026-10-13", "p10": 69.2, "p50": 72.4, "p90": 75.9 }, { "date": "2026-10-14", "p10": 69.8, "p50": 73.6, "p90": 78.0 }, { "date": "2026-10-15", "p10": 69.4, "p50": 74.1, "p90": 79.9 } ],
  "sbp": [ { "date": "2026-10-13", "p10": 146, "p50": 153, "p90": 161 } ],
  "episode_probability": [ { "date": "2026-10-13", "p": 0.42, "band": [0.31, 0.52] } ],
  "probability_72h": 0.71, "band_72h": [0.58, 0.80],
  "twin_accuracy_7d": { "rhr_mae": 1.8, "sbp_mae": 4.3, "coverage_p10_p90": 0.86, "label": "good" },
  "confidence": "high"
}
```

`confidence`: `"high" | "medium" | "low"` (low when nights_available < 14 or coverage < 0.6). Low-confidence alerts are demoted to `watch`.

## GET /api/patients/{id}/explain

```json
{
  "id": "P-0007", "as_of": "2026-10-12", "probability_72h": 0.71, "base_rate": 0.06,
  "contributors": [
    { "feature": "rhr_dev_3d", "label": "Overnight HR +9 bpm vs 28-day baseline (3-night mean)", "value": 9.1, "shap": 0.21, "direction": "up", "group": "wearable" },
    { "feature": "sbp_slope_7d", "label": "Home SBP rising 2.4 mmHg/day over 7 days", "value": 2.4, "shap": 0.14, "direction": "up", "group": "wearable" },
    { "feature": "hrv_below_swc", "label": "HRV below your smallest worthwhile change for 4 nights", "value": 1, "shap": 0.09, "direction": "up", "group": "wearable" },
    { "feature": "framingham_10y", "label": "10-year Framingham risk 18.4% (high)", "value": 18.4, "shap": 0.05, "direction": "up", "group": "ehr" },
    { "feature": "steps_z", "label": "Steps 38% below your usual", "value": -1.2, "shap": 0.04, "direction": "up", "group": "wearable" }
  ],
  "protective": [ { "feature": "on_statin", "label": "On statin", "value": 1, "shap": -0.02, "direction": "down", "group": "ehr" } ],
  "rule_state": { "ns_state": "red", "rule": "Overnight RHR ≥ +4 bpm above 28-day median for 2 consecutive nights", "days_in_state": 3 },
  "model_version": "fusion-lgbm-2026.10.12",
  "inputs_used": ["28 nights of HR", "26 nights of HRV", "19 home BP readings", "EHR: 4 conditions, 3 medications, 6 labs"],
  "stale_inputs": []
}
```

## POST /api/patients/{id}/simulate

What-if. Body levers (all optional, applied to the next 72 h):

```json
{ "walk_minutes_per_day": 30, "sleep_extra_hours": 1.0, "bp_med_adherence_pct": 100, "sodium_reduction": true, "alcohol_free": true }
```

Response:

```json
{
  "baseline": { "probability_72h": 0.71, "band": [0.58, 0.80], "sbp_p50_day3": 156, "rhr_p50_day3": 74.1 },
  "scenario": { "probability_72h": 0.44, "band": [0.33, 0.55], "sbp_p50_day3": 147, "rhr_p50_day3": 70.6 },
  "delta": { "probability_72h": -0.27, "sbp_p50_day3": -9, "rhr_p50_day3": -3.5 },
  "levers_applied": [ { "lever": "walk_minutes_per_day", "value": 30, "effect": "steps +3,600/day, RHR -1.2 bpm by day 3" } ],
  "rhr": [ { "date": "2026-10-13", "p10": 68.0, "p50": 70.1, "p90": 72.9 } ],
  "sbp": [ { "date": "2026-10-13", "p10": 142, "p50": 148, "p90": 155 } ],
  "note": "Scenario estimates are model counterfactuals on synthetic data, not clinical advice."
}
```

## GET /api/alerts?status=open|acknowledged|snoozed|escalated|resolved|all

```json
{
  "budget": { "target_false_alerts_per_patient_day": 0.07, "observed_validation": 0.041, "cohort_alerts_last_7d": 23, "cohort_patient_days_last_7d": 1680, "observed_rate": 0.0137, "status": "within_budget" },
  "alerts": [
    { "id": "AL-0231", "patient_id": "P-0007", "patient_name": "Meera Iyer", "created_at": iso, "tier": "urgent", "kind": "model" , "title": "Strain episode risk 71% in next 72 h", "reason": "Overnight HR +9 bpm vs baseline for 3 nights; home SBP rising", "status": "open", "confidence": "high", "snoozed_until": null, "acknowledged_by": null, "escalation_id": null, "owner": "Dr Kavya Rao" }
  ]
}
```

`kind`: `"model"` (amber/urgent from the twin) | `"rule"` (NightSignal red) | `"sos"` (patient pressed SOS) | `"fall"` (OS fall event) | `"caregiver"` | `"acute"` (live stream threshold).

## POST /api/alerts/{id}/ack  body `{ "by": "Dr Kavya Rao", "note": "Called patient" }`
## POST /api/alerts/{id}/snooze  body `{ "by": "...", "hours": 3 }`
## POST /api/alerts/{id}/escalate  body `{ "by": "...", "reason": "No answer on phone" }` → starts an escalation (see below) and returns it.
## POST /api/alerts/{id}/resolve  body `{ "by": "...", "outcome": "false_alarm" | "true_event" | "handled" , "note": "..." }`

Each returns the updated alert object plus `"audit": [...]` entries appended.

## GET /api/thresholds  and  POST /api/thresholds/preview

GET returns current thresholds:
```json
{ "watch": 30, "urgent": 60, "ns_rhr_delta_yellow": 3.0, "ns_rhr_delta_red": 4.0, "ns_consecutive_nights": 2, "hrv_swc_multiplier": 0.5, "min_confidence_for_urgent": "medium" }
```
POST body = same keys (any subset), plus optional `"patient_id"`. Response replays the last 14 days:
```json
{ "window_days": 14, "scope": "cohort" , "current": { "alerts": 23, "per_patient_day": 0.0137, "would_have_caught_events": 11, "events": 13 }, "draft": { "alerts": 15, "per_patient_day": 0.0089, "would_have_caught_events": 10, "events": 13 }, "delta_alerts_pct": -34.8, "sensitivity_change": -0.077 }
```
`POST /api/thresholds` (no `/preview`) applies the draft and writes an audit entry.

## Escalation

`POST /api/escalations` body:
```json
{ "patient_id": "P-0007", "trigger": "sos" | "fall" | "caregiver" | "acute" | "clinician", "by": "patient", "alert_id": null, "location": { "lat": 12.97, "lng": 77.59, "accuracy_m": 25 } }
```
Returns the escalation object. The state machine runs server-side on a demo clock (`meta.demo_speed`, e.g. 10× so 60 s → 6 s).

Escalation object:
```json
{
  "id": "ES-0012", "patient_id": "P-0007", "patient_name": "Meera Iyer", "trigger": "sos", "started_at": iso,
  "state": "user_prompt" | "contact_1" | "contact_2" | "doctor" | "resolved" | "cancelled",
  "countdown_ends_at": iso,
  "steps": [
    { "n": 1, "state": "user_prompt", "at": iso, "detail": "Full-screen alert, sound + vibration, 60 s to tap I'm OK", "status": "no_response" },
    { "n": 2, "state": "contact_1", "at": iso, "detail": "Arjun Iyer: push + SMS (-S template) + WhatsApp utility + voice call from 1600-series number", "status": "sent",
      "messages": [ { "channel": "sms", "to": "+91 98XXX XX412", "template_id": "PRATIBIMB-S-001", "header": "PRTBMB-S", "body": "Pratibimb: Meera Iyer has not responded to a health check-in. Last location: https://maps.app/..., Call her or tap to call 112. Reply STOP to opt out.", "mock": true }, { "channel": "whatsapp", "template": "emergency_checkin_v1", "mock": true }, { "channel": "voice", "from": "1600-XXX-XXXX", "script": "This is Pratibimb. Meera has not responded... Press 1 if you can reach her.", "mock": true } ] },
    { "n": 3, "state": "contact_2", "at": iso, "detail": "...", "status": "pending" },
    { "n": 4, "state": "doctor", "at": iso, "detail": "Dr Kavya Rao alerted, 60-minute SLA", "status": "pending" }
  ],
  "location": { "lat": 12.97, "lng": 77.59, "accuracy_m": 25 },
  "actions": { "call_112_url": "tel:112", "uhi_ambulance_url": "https://uhi.example/ambulance?ref=ES-0012", "mock": true },
  "resolved_by": null, "outcome": null
}
```

- `POST /api/escalations/{id}/respond` body `{ "by": "patient" | "contact:C1" | "doctor", "action": "im_ok" | "acknowledged" | "reached_patient" | "resolved" | "false_alarm", "note": "..." }` → transitions and returns the object.
- `GET /api/escalations/{id}` and `GET /api/escalations?status=active|all`.

## GET /api/audit?patient_id=&limit=100

```json
{ "entries": [ { "id": 1821, "at": iso, "actor": "system", "actor_type": "system" | "clinician" | "patient" | "contact", "patient_id": "P-0007", "action": "alert.created", "object": "AL-0231", "detail": "tier=urgent score=71 model=fusion-lgbm-2026.10.12", "consent_basis": "ai_predictions", "channel": null } ] }
```

## Consent

`GET /api/patients/{id}/consent` → the consent object. `POST /api/patients/{id}/consent` body `{ "ehr": true, "wearable": true, "ai_predictions": false, "emergency_contacts": true }`. Turning `ai_predictions` off hides scores for that patient (API returns `risk_score: null, tier: "opted_out"`), and `withdraw: true` deletes wearable rows for that patient (demo: soft delete with audit entry).

## Patient view

`GET /api/me/{id}` (same auth story as above, demo has no auth):
```json
{
  "id": "P-0007", "first_name": "Meera",
  "score": { "value": 71, "label": "Needs attention", "ring_color": "urgent", "state": "ready" | "calibrating", "nights_needed": 7, "nights_available": 112 },
  "drivers": [ { "label": "Resting heart rate", "value": "71 bpm", "vs_baseline": "+9", "arrow": "up", "good": false }, { "label": "Sleep", "value": "5 h 40 m", "vs_baseline": "-1 h 10 m", "arrow": "down", "good": false }, { "label": "Steps", "value": "3,800", "vs_baseline": "-38%", "arrow": "down", "good": false } ],
  "sentence": { "en": "Your heart has been working harder than usual for three nights and your morning BP is rising. Please check your BP this evening and rest.", "hi": "पिछली तीन रातों से आपका दिल सामान्य से ज़्यादा मेहनत कर रहा है और सुबह का BP बढ़ रहा है। कृपया आज शाम BP जाँचें और आराम करें।" },
  "checkin": { "pending": true, "question": { "en": "How do you feel today?", "hi": "आज आप कैसा महसूस कर रहे हैं?" }, "options": ["Fine", "Tired", "Dizzy", "Chest discomfort"] },
  "freshness": { "last_sample_at": iso, "minutes_ago": 47, "label": "fresh" },
  "device": { "brand": "Noise", "simulated": true },
  "contacts": [ { "name": "Arjun", "relation": "Son" } ],
  "doctor": { "name": "Dr Kavya Rao", "reviewed_at": iso },
  "share_card": { "title": "Meera's day", "lines": ["Heart: working harder (+9 bpm)", "Sleep: 5 h 40 m", "BP: 151/92 this morning"], "footer": "Reviewed by Dr Kavya Rao · Pratibimb" }
}
```

`POST /api/me/{id}/checkin` body `{ "answer": "Dizzy", "note": "" }` → `{ "ok": true, "alert_created": true, "alert_id": "AL-0240" }` (any non-"Fine" answer creates a `watch` alert for the clinician).

`POST /api/me/{id}/annotate` body `{ "date": "2026-10-12", "kind": "symptom" | "meal" | "missed_dose" | "note", "label": "Felt dizzy after lunch" }` → `{ "ok": true }`. Clinician annotations use `POST /api/patients/{id}/annotate` with `"by": "Dr Kavya Rao"`.

## Ingest

`POST /api/ingest` body:
```json
{ "patient_id": "P-0007", "source": "health_connect", "device": { "brand": "Samsung", "model": "Galaxy Watch 7" }, "observations": [ { "type": "heart_rate", "t": iso, "value": 68, "unit": "bpm" }, { "type": "hrv_rmssd", "t": iso, "value": 34.2, "unit": "ms" }, { "type": "sleep_session", "start": iso, "end": iso, "efficiency": 0.87 }, { "type": "steps", "date": "2026-10-12", "value": 4210 }, { "type": "blood_pressure", "t": iso, "systolic": 148, "diastolic": 92 } ] }
```
Also accepts a FHIR R4 `Bundle` of `Observation` resources (vital-signs profile LOINC codes) in the same field. Response: `{ "accepted": 5, "rejected": 0, "freshness": {...}, "rescored": true, "risk_score": 69 }`. CSV upload: `POST /api/ingest/csv` multipart with columns `t,type,value`.

## Simulated live stream

`GET /api/stream/{id}` is Server-Sent Events. Each event is `data: {"t": iso, "hr": 72, "simulated": true}` roughly every `60 / demo_speed` seconds (one "5-minute" sample per tick). `POST /api/stream/{id}/inject` body `{ "scenario": "acute_tachycardia" | "bradycardia" | "normal" }` makes the next samples run high (≥140 for 10 "minutes") so the acute rule fires a `red` alert of kind `acute`.

## Export

`GET /api/patients/{id}/export/wellnessrecord` → FHIR R4 `Bundle` (`type: document`) with a `Composition` (ABDM WellnessRecord), masked `Patient`, and `Observation` entries (LOINC 8867-4 heart rate, 80404-7 RMSSD, 93832-4 sleep duration, 55423-8 steps, 8480-6 / 8462-4 BP, 9279-1 respiratory rate, 2708-6 SpO2). Content-Disposition attachment.

`GET /api/patients/{id}/export/ehr` → the synthetic source FHIR bundle for that patient.

## Model

`GET /api/model` → model card JSON:
```json
{
  "name": "Pratibimb fusion model", "version": "fusion-lgbm-2026.10.12", "task": "Binary: cardiovascular strain episode onset within 72 h",
  "data": { "cohort": 240, "patient_days": 28800, "events": 312, "event_rate": 0.0108, "split": "patient-level 70/15/15", "synthetic": true, "generator_seed": 42, "sources": ["Synthetic EHR (Synthea-shaped FHIR R4)", "Synthetic wearable streams parameterised from published baselines"] },
  "metrics": {
    "fused": { "auroc": 0.91, "auprc": 0.42, "sensitivity": 0.81, "specificity": 0.95, "false_alerts_per_patient_day": 0.041, "median_lead_hours": 52, "brier": 0.031 },
    "wearable_only": { "auroc": 0.84, "...": 0 },
    "ehr_only": { "auroc": 0.68 },
    "rule_only": { "auroc": 0.77, "sensitivity": 0.73, "specificity": 0.88 }
  },
  "ablation_note": "Wearable-only model confuses infection-like episodes with strain; fusion with home BP trend and EHR removes N of M false alerts.",
  "forecast": { "rhr_mae_day1": 1.6, "sbp_mae_day1": 4.1, "coverage_p10_p90": 0.84 },
  "calibration": { "bins": [ { "p_mean": 0.05, "obs": 0.04, "n": 1200 } ] },
  "features": [ { "name": "rhr_dev_3d", "group": "wearable", "importance": 0.21 } ],
  "limitations": ["..."],
  "published_anchors": [ { "name": "NightSignal (infection)", "sensitivity": 0.80, "specificity": 0.877, "lead": "median 3 days" }, { "name": "Epic Deterioration Index", "auroc": 0.76, "lead": "median 28 h" } ],
  "regulatory": { "status": "Research proof-of-concept, not a medical device", "cdsco": "Production version would be Medical Device Software, likely Class B or C (CDSCO MDSW guidance, 30 Jul 2026)", "dpdp": "DPDP-ready ahead of 13 May 2027 commencement" },
  "leakage_tests": { "passed": true, "tests": ["no_future_values_in_features", "patient_level_split", "label_window_excludes_t"] }
}
```

## Health

`GET /api/health` → `{ "ok": true, "model_loaded": true, "cohort_loaded": true }`.

---

# v1.1 additions: personal physiology engine and twin summary

## GET /api/patients/{id}/physiology

The twin's personal response model. For each lever and outcome pair, the person's own slope is estimated from their calm days (rule state green, no strain flag) and shrunk toward the cohort average by empirical-Bayes partial pooling. Negative means the lever lowers the outcome.

```json
{
  "id": "P-0007",
  "method": "Empirical-Bayes partial pooling of per-person response slopes fitted on calm days",
  "calm_days_used": 84,
  "days_available": 105,
  "responses": [
    {
      "key": "sleep_rhr",
      "lever": "sleep",
      "lever_label": "Sleep",
      "outcome": "rhr",
      "outcome_label": "Next-night resting heart rate",
      "per": "extra hour of sleep",
      "unit": "bpm",
      "personal": -1.42,
      "interval": [-1.95, -0.89],
      "cohort": -1.02,
      "relative_to_cohort": 1.39,
      "evidence": "strong",
      "plain": "An extra hour of sleep usually lowers Meera's next-night heart rate by about 1.4 bpm. Most people: 1.0 bpm."
    },
    { "key": "steps_sbp", "lever": "walking", "lever_label": "Walking", "outcome": "sbp", "outcome_label": "Next-morning systolic BP", "per": "extra 1,000 steps", "unit": "mmHg", "personal": -1.85, "interval": [-2.6, -1.1], "cohort": -1.1, "relative_to_cohort": 1.68, "evidence": "strong", "plain": "..." },
    { "key": "steps_rhr", "lever": "walking", "lever_label": "Walking", "outcome": "rhr", "outcome_label": "Next-night resting heart rate", "per": "extra 1,000 steps", "unit": "bpm", "personal": -0.31, "interval": [-0.52, -0.1], "cohort": -0.28, "relative_to_cohort": 1.1, "evidence": "moderate", "plain": "..." },
    { "key": "sleep_hrv", "lever": "sleep", "lever_label": "Sleep", "outcome": "hrv", "outcome_label": "Next-night HRV", "per": "extra hour of sleep", "unit": "% HRV", "personal": 4.8, "interval": [2.1, 7.4], "cohort": 4.0, "relative_to_cohort": 1.2, "evidence": "moderate", "plain": "..." }
  ],
  "best_lever": { "key": "steps_sbp", "lever": "walking", "plain": "Walking is Meera's strongest lever. A 30-minute walk (about 3,500 steps) is expected to lower her morning BP by about 6 mmHg." },
  "validation": null
}
```

`evidence`: `"strong"` (interval excludes zero and posterior SD below 40% of the slope), `"moderate"` (interval excludes zero), `"weak"`. With `?reveal=1` the `validation` field carries the generator's true slopes for the synthetic patient: `{ "true": { "sleep_rhr": -1.5, ... } }`.

## GET /api/patients/{id}/summary

A clinician-facing twin summary built from the forecast, explanation, physiology and alert state with fixed templates (no language model).

```json
{
  "id": "P-0007",
  "headline": "Strain episode likely in the next 72 hours",
  "tier": "urgent",
  "sentences": [
    "Meera's twin puts the chance of a strain episode in the next 72 hours at 24%, about seven times her usual 3%.",
    "The main reasons are home systolic BP rising 3.1 mmHg a day and overnight heart rate 8 bpm above her usual for 3 nights.",
    "Her strongest lever is walking: 30 minutes a day is expected to lower her morning BP by about 6 mmHg."
  ],
  "next_step": "Call today, confirm amlodipine is being taken, and ask for an evening BP reading.",
  "streams": { "record": ["Essential hypertension", "Type 2 diabetes", "Framingham 10-year risk 20.5%"], "wearable": ["105 nights of heart rate", "98 nights of HRV", "74 home BP readings"] },
  "usual_probability": 0.03
}
```

## POST /api/patients/{id}/simulate (changes)

Response adds `"personalised": true` and each item in `levers_applied` adds `"personal_effect"` and `"cohort_effect"` objects: `{ "rhr": -1.4, "sbp": -6.2 }` (day-3 change versus no change), so the UI can show "for Meera" next to "for most people".

Response also adds `"usual_week"` (null when the person has fewer than 10 calm days):

```json
"usual_week": { "baseline": 0.009, "scenario": 0.005, "relative_change": -0.47,
                "plain": "On an ordinary week, Meera's chance of a strain episode would go from 0.9% to 0.5% (-47%)." }
```

How the risk is re-scored: only the causes the twin models move (`sleep_debt_7d`, `activity_7d_z`, `adherence_pct`), never the symptoms (tonight's heart rate, BP trend, steps), so a what-if cannot hide strain already under way. `scenario.probability_72h` is today's 72 hour risk under the change; `usual_week` is the median risk over the person's last 60 calm days under the same change. The fusion model is monotone in these features, so more sleep or walking can never raise risk.

## GET /api/me/{id} (changes)

Adds `"what_helps"`: a list of up to three items, strongest first:

```json
"what_helps": [
  { "lever": "walking", "en": "A 30-minute walk usually brings your morning BP down by about 6 mmHg.", "hi": "30 मिनट की सैर से आपका सुबह का BP आम तौर पर लगभग 6 mmHg कम होता है।", "strength": "strong" }
]
```

## GET /api/model (changes)

Adds `"physiology"`:

```json
"physiology": {
  "method": "Empirical-Bayes partial pooling on calm days",
  "pairs": [
    { "key": "sleep_rhr", "label": "Sleep to next-night RHR", "r_pooled": 0.74, "r_raw": 0.58, "mae_pooled": 0.31, "mae_raw": 0.46, "mae_population": 0.52, "coverage_80": 0.81, "n_patients": 239 }
  ],
  "note": "On the synthetic cohort the generator's true per-person slopes are known, so the twin's recovery of each person's physiology can be measured directly."
}
```

Also adds `"metrics.repeated"`: for each of `fused`, `fused_no_twin`, `wearable_only`, `watch_only`, `ehr_only`, the mean, min and max of `auroc`, `auprc`, `brier`, `sensitivity`, `sensitivity_48h_lead`, `false_alerts_per_patient_day` and `median_lead_hours` over three patient-level CV splits (`seeds: [42, 43, 44]`), plus `twin_beats_no_twin_auroc` and `fused_beats_wearable_auroc` as "N of 3" strings. Headline numbers in the UI and README use these means.
