# Device sync: how real wearable data reaches the twin

The prototype runs on a synthetic cohort (sandbox rules). This note explains how the same
ingestion layer takes real data from the devices Indian patients actually own, what needs a
companion app, and what the research found about each door as of October 2026.

## The one-line answer

Apple Health and Android Health Connect are **on-device stores with no cloud API**. A
browser cannot read them. So Pratibimb's web app is paired with a **thin mobile companion**
whose only job is to read the phone's health store with the patient's permission and POST
daily aggregates to `POST /api/ingest`. Everything else (model, dashboard, escalation) stays
in the web app. Cloud-API wearables (Oura, Whoop, Polar) do not need the companion.

## Door by door

| Source | How it reaches Pratibimb | Needs companion? | Status (Oct 2026) |
|---|---|---|---|
| Samsung Galaxy Watch, Garmin, Oura, Whoop, Withings, Amazfit, Xiaomi on Android | Each brand's app writes to **Android Health Connect**; the Pratibimb Android companion reads heart rate, HRV (RMSSD), sleep stages, steps, SpO2, respiratory rate and blood glucose with runtime permissions, then posts to `/api/ingest` | Yes (Android) | Health Connect is a system module on Android 14+, Play-delivered on 9 to 13; no cloud API; 30-day history unless the history permission is granted; background reads need a separate permission |
| Apple Watch (via Apple Health) | Option A: iOS companion with HealthKit background delivery (hourly at best, can be deferred to daily). Option B: the Health Auto Export app's REST push to `/api/ingest`. Option C: manual export zip, parsed by the CSV importer | A: yes (iOS); B and C: no | HealthKit is on-device only; about 2% of Indian smartwatches |
| Oura ring | OAuth2 to the Oura API v2 with webhooks; sandbox and 10 users before approval | No | Personal tokens were retired Dec 2025; OAuth only |
| Whoop | OAuth2 developer platform v2, sandbox tier with 10 members, webhooks | No | Open self-serve |
| Samsung Health Data SDK (direct) | Possible in developer mode for testing; public distribution needs Samsung partnership approval | Yes | Not used; Health Connect covers Samsung without approval |
| Fitbit | Web API support ended 30 Sep 2026, API off 30 Oct 2026; successor Google Health API is not onboarding new projects | n/a | Out of scope |
| Garmin cloud | Connect Developer Program paused for new applicants | n/a | Reached via Health Connect instead |
| Noise, boAt, Fire-Boltt (most Indian units) | NoiseFit writes to Apple Health on iPhone and Google Fit on Android; Google Fit APIs end in 2026; export path per brand must be verified on a device | Depends | Unverified; the twin works on whatever daily aggregates arrive, and badges freshness |
| Home BP cuff (Omron, Dr Trust, etc.) | Bluetooth cuffs sync to the brand app, many of which write to Health Connect or Apple Health; otherwise the patient types the morning reading into the patient view | Usually | Manual entry always available |
| CGM (Abbott Libre, Ultrahuman M1) | Not needed for the hypertension twin. Roadmap: Nightscout bridge or Dexcom sandbox replay | No | Dexcom has a 3 h delay outside the US and no confirmed Indian retail |
| Aggregators (Terra, Junction, Rook, Spike, Sahha) | Could replace the companion for cloud sources, but cost $299 to $499 per month with no student tier and still need a native SDK for Apple and Samsung | n/a | Not used |

## What the companion does (and does not do)

- Asks for Health Connect permissions with a plain-language purpose per data type (the same unbundled consent as the web app).
- Once an hour, or on "Sync now", reads the last 24 h and computes the aggregates the twin scores on: overnight resting HR (10th percentile of 00:00 to 07:00 samples), nightly RMSSD, sleep session and efficiency, steps, SpO2, respiratory rate, blood pressure.
- Posts them as the simple observation list in `docs/API.md` (or as a FHIR R4 Bundle of `Observation` resources). The API records the source, device and freshness, and rescores the patient.
- Never runs the model, never sends raw minute-level data, and never auto-dials anyone.

## Why "hourly, not real time" is the honest promise

iOS defers HealthKit background delivery to as little as once a day; Health Connect readers run when the OS allows; cheap watches sync when their app is opened. The twin therefore scores **once per night** on the data that has arrived, shows a **freshness chip** on every card ("last sample 47 min ago"), and treats minute-level emergencies as the operating system's job (fall detection, loss of pulse). The red tier of the check-in ladder is triggered by the patient, a caregiver, an OS event or a sustained acute reading on a live stream, never by the hourly model.

## Trying it without a watch

- `POST /api/ingest` with the JSON in `docs/API.md` (any HTTP client).
- `POST /api/ingest/csv` with a `t,type,value` CSV (steps, heart_rate, hrv_rmssd, blood_pressure with `value2` for diastolic).
- The simulated live stream (`GET /api/stream/{id}`, badged SIMULATED) replays a deterministic 5-minute trace; `POST /api/stream/{id}/inject` runs the acute scenario that triggers the ladder.
