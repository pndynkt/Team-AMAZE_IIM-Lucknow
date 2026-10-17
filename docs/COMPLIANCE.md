# Compliance posture

Pratibimb is a research proof-of-concept built on synthetic data. It is not a medical device under India's Medical Devices Rules 2017, and it is not a substitute for emergency services. This note lists what the prototype already does on screen and in the repo, and what a production version would need. Every item is something a reviewer can click, not a promise.

## Implemented in the prototype

| Requirement | Where it lives | What it does |
|---|---|---|
| Unbundled consent (DPDP: free, specific, informed, unambiguous; withdrawal as easy as giving) | Patient view consent sheet; `POST /api/patients/{id}/consent` | Four separate toggles: health records, wearable stream, AI predictions, emergency contacts. Each change is audited with `consent_basis`. "Withdraw and delete" switches everything off and removes runtime wearable rows (soft delete of synthetic rows). |
| Opt out of AI while keeping care (ICMR 2023: patients must be able to reject AI) | Same sheet | Turning off AI predictions hides scores for that patient everywhere (`tier: opted_out`, `risk_score: null`); forecasts and explanations return 403; the record stays available to the doctor. |
| Emergency-contact consent captured in advance | Patient detail `emergency_contacts[].consented_at`; ladder messages | The ladder only messages contacts with a recorded consent; each message is a TRAI service-category template with opt-out wording. |
| Adults only (DPDP Rule 10: verifiable parental consent for under-18s) | Cohort and copy | The cohort is 35 to 78; the product is positioned for adults. |
| Data minimisation and masked identifiers | EHR generator, FHIR export | ABHA is masked everywhere (`91-XXXX-XXXX-4821`); contacts' numbers are masked; no device serials; synthetic names. |
| Append-only audit log with consent basis | `GET /api/audit`, console Audit page | Every alert state change, every escalation transition and message, every consent change, export, ingest and threshold change: who, when, channel, consent basis. |
| Vendor-grade disclaimers | Landing footer, patient view footer, README | "May not detect every event. Not intended to diagnose, treat or replace medical care. Not a substitute for emergency services. If you feel unwell, call 112." |
| No AI prescribing (Telemedicine Practice Guidelines 2020) | Patient sentences, what-if note | Patient-facing text says "check your BP", "rest", "contact your doctor"; it never changes a dose. What-if results are labelled counterfactuals, not advice. |
| No auto-dialling of public emergency numbers | Escalation `actions.call_112_url = tel:112` | 112 is always a one-tap, user-confirmed dialer link for the patient and every contact; the server never places that call. |
| TRAI TCCCPR (2025 amendment) | Mocked messages | SMS carries a `-S` service header and template id; voice calls come from a 1600-series number and disclose automation; WhatsApp uses an opted-in utility template. All mocked and labelled on screen. |
| FDA-style transparency for clinical decision support | "Why this alert?" drawer; `GET /api/patients/{id}/explain` | Inputs used, model version, rule state, stale-input flags, top contributors in plain words. |
| Model transparency (CDSCO MDSW guidance: training-data composition, synthetic vs real) | `docs/MODEL_CARD.md`, `GET /api/model` | Cohort size, synthetic flag and seed, split, ablations, calibration, limitations, leakage tests, regulatory status. |
| Alert economics made visible | Alerts page budget meter; threshold editor | False alerts per patient-day against a budget; a 14-day replay before any threshold change; changes audited. |
| Standards | `GET /api/patients/{id}/export/wellnessrecord`, `POST /api/ingest` | FHIR R4 Observations with vital-signs LOINC codes in; ABDM WellnessRecord document bundle (NRCeS profiles) out. |

## What production would add

- **DPDP**: a privacy notice in the languages the patient chooses, a grievance officer, breach-notification runbook ("without delay" notice and 72-hour update), retention schedule, India-region hosting (shown on the architecture diagram), and a Data Protection Impact Assessment if the service qualifies as a significant data fiduciary.
- **CDSCO**: classification of the predictive feature as Medical Device Software (likely Class B or C), a quality management system, clinical validation on an Indian cohort, and a versioned Algorithm Change Protocol for retraining.
- **ABDM**: sandbox milestones M1 (HIP) and M3 (HIU, consent manager flows), WASA security audit, Health Facility Registry listing, real ABHA linking instead of masked ids.
- **Clinical governance**: a registered medical practitioner owns every alert; escalation to 108/112 stays human; BODH benchmarking for bias and performance before any deployment.
- **Telecom**: DLT registration of the entity, headers and templates; a WhatsApp Business account with approved utility templates; a 1600-series number from the access provider.

## Reference points

- Digital Personal Data Protection Act 2023 and DPDP Rules (notified 13 Nov 2025; consent, breach and retention rules from 13 May 2027)
- CDSCO Medical Device Software guidance, 30 July 2026
- Telemedicine Practice Guidelines 2020 (NMC)
- ICMR Ethical Guidelines for AI in Healthcare and Biomedical Research, 2023
- TRAI Telecom Commercial Communications Customer Preference Regulations, second amendment, 12 Feb 2025
- NRCeS ABDM FHIR Implementation Guide (WellnessRecord, ObservationVitalSigns, ObservationPhysicalActivity)
- FDA Clinical Decision Support Software guidance, 2022 (transparency criteria used as a design reference)
