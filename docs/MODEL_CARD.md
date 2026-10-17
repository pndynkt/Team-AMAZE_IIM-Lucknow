# Model card: Pratibimb fusion model

Version `fusion-lgbm-2026.10.12`, trained 2026-10-14T15:08:18 UTC. Rendered from `backend/artifacts/model_card.json`; do not edit by hand.

## Task

Binary: cardiovascular strain episode onset within 72 h, scored once per night from the latest synced data. Condition: Hypertension with cardiovascular risk (Indian adults).

## Algorithm

LightGBM gradient-boosted trees on dynamic (wearable) features, twin-adjusted residuals and a compact static tower of eight record features; patient-level 5-fold CV repeated on three patient splits; Platt calibration on pooled out-of-fold scores; the five fold models form the bag for the probability band; NightSignal-style rule run alongside

## Data

- Cohort: 240 synthetic patients, 28,685 patient-days, 342 strain episodes (1,011 positive days, 3.5% of days)
- Split: patient-level 5-fold cross-validation repeated on three patient splits (seeds 42, 43, 44); every metric on pooled out-of-fold predictions; headline numbers are the mean of the three splits
- Generator seed: 42; synthetic: True
- Confounders injected: infection like 242, missed dose 767, late nights 756, travel 290
- Source: Synthetic EHR, Synthea-shaped FHIR R4 (twin.data.ehr)
- Source: Synthetic wearable streams with labelled strain episodes and unlabelled infection, lifestyle and missing-data confounders (twin.data.wearables)

## Headline metrics (mean of three patient splits)

Each split is a fresh patient-level 5-fold cross-validation (seeds 42, 43, 44). Range in brackets is the lowest and highest split.

| Model | AUROC | AUPRC | Sensitivity at the budget | Sensitivity with 48 h lead |
|---|---|---|---|---|
| Fused + twin | 0.876 (0.870 to 0.884) | 0.218 (0.203 to 0.234) | 70.5% (58.2% to 77.2%) | 49.9% (43.3% to 55.3%) |
| Fused without the twin | 0.851 (0.832 to 0.862) | 0.189 (0.166 to 0.208) | 63.8% (58.5% to 66.7%) | 45.3% (43.6% to 48.0%) |
| Watch + home BP cuff | 0.870 (0.859 to 0.878) | 0.214 (0.195 to 0.226) | 71.5% (63.2% to 77.2%) | 50.7% (45.6% to 53.8%) |
| Watch only | 0.804 (0.771 to 0.822) | 0.136 (0.120 to 0.145) | 55.2% (53.2% to 58.8%) | 36.9% (35.1% to 38.3%) |
| EHR only | 0.578 (0.577 to 0.581) | 0.042 (0.042 to 0.042) | 15.3% (12.3% to 18.4%) | 15.3% (12.3% to 18.4%) |

Twin beats no twin on AUROC in 3 of 3 splits; fused beats watch + cuff in 2 of 3.

## Metrics, primary split (pooled out-of-fold)

| Model | AUROC | AUPRC | Brier | Sensitivity (events) | Sensitivity with 48 h lead | Specificity (days) | False alerts / patient-day | Median lead |
|---|---|---|---|---|---|---|---|---|
| Fused (wearable + home BP cuff + EHR + twin) | 0.870 | 0.203 | 0.0300 | 58.2% | 43.3% | 95.8% | 0.0409 | 48 h |
| Fused without the twin | 0.832 | 0.166 | 0.0305 | 58.5% | 44.2% | 95.4% | 0.0440 | 48 h |
| Watch + home BP cuff | 0.859 | 0.195 | 0.0300 | 63.2% | 45.6% | 95.5% | 0.0435 | 48 h |
| Watch only (no cuff) | 0.771 | 0.120 | 0.0319 | 53.2% | 37.4% | 95.4% | 0.0444 | 48 h |
| EHR only | 0.577 | 0.042 | 0.0339 | 18.4% | 18.4% | 88.1% | 0.1151 | 72 h |
| Rule only (NightSignal-style) | 0.708 | 0.091 | n/a | 42.4% | 19.0% | 95.7% | 0.0412 | 24 h |
| Ceiling: watch + cuff + oracle static prior | 0.861 | 0.192 | 0.0297 | 71.3% | 51.2% | 95.4% | 0.0448 | 48 h |

Operating points: watch at calibrated p = 0.075, urgent at p = 0.186; urgent is the most sensitive point within 0.045 false alerts per patient-day. Score mapping: 0 to 0, p_watch to 30, p_urgent to 60, 1 to 100 (piecewise linear on calibrated probability).

Watch tier: 90.1% of events at 0.1237 false alerts per patient-day.

## What fusion buys

At a matched 90% event sensitivity on out-of-fold predictions: watch-only (HR, HRV, sleep, steps, SpO2, respiratory rate) alerted inside 233 of 242 infection-like windows at 0.194 false alerts per patient-day; adding the home BP cuff gave 164 windows at 0.1169; the fused model with the record gave 173 windows at 0.126. The blood-pressure cuff is what separates strain from a cold. Mean over three patient splits: AUROC 0.578 for the record alone, 0.804 for the watch alone, 0.87 for watch + cuff and 0.876 fused (fused ahead of watch + cuff on 2 of 3 splits).

Even an oracle static prior (the generator's own risk multiplier) adds only a little over the wearable-only model: on a 72-hour horizon, when matters more than who. The EHR stream's job is prioritisation, interpretation (diabetic silent episodes, beta-blocker dampening) and the static risk panel, not timing.

## What the twin buys

Twin adjustment: the personal physiology engine removes the part of each night's heart rate, HRV and BP change that the person's own sleep and activity explain, and the record tells the model how to read the heart-rate rise (beta blockers dampen it). Mean over three patient splits: without it the fused model reaches AUROC 0.851 and catches 64% of events at the false-alert budget; with it, AUROC 0.876 and 70% (better AUROC on 3 of 3 splits).

## Personal Physiology Engine: recovery of each person's true response

Method: Empirical-Bayes partial pooling of per-person lagged slopes fitted on calm days. The generator plants a true response slope in every patient; the table compares the twin's estimate with that hidden truth (leave-one-out cohort mean).

| Response | Unit | Correlation with truth (twin) | Correlation (raw per-person fit) | MAE twin | MAE raw | MAE population average | 80% interval coverage |
|---|---|---|---|---|---|---|---|
| Sleep to next-night resting heart rate | bpm per extra hour of sleep | 0.715 | 0.726 | 0.279 | 0.333 | 0.396 | 72.4% |
| Walking to next-night resting heart rate | bpm per extra 1,000 steps | 0.660 | 0.583 | 0.088 | 0.129 | 0.118 | 76.2% |
| Walking to next-morning systolic bp | mmHg per extra 1,000 steps | 0.667 | 0.628 | 0.303 | 0.490 | 0.423 | 74.5% |
| Sleep to next-night hrv | % HRV per extra hour of sleep | 0.592 | 0.587 | 1.317 | 2.069 | 1.603 | 75.3% |

On the synthetic cohort the generator's true per-person slopes are known, so the twin's recovery of each person's physiology is measured directly. Pooled = the twin's estimate; raw = per-person regression with no pooling; population = one slope for everyone.

## Forecasts (quantile models, held-out fold)

| Target | Horizon | MAE (P50) | Persistence MAE | P10 to P90 coverage |
|---|---|---|---|---|
| Overnight RHR (bpm) | day 1 | 2.49 | 2.8 | 71.4% |
| Overnight RHR (bpm) | day 2 | 2.71 | 3.04 | 72.9% |
| Overnight RHR (bpm) | day 3 | 2.73 | 3.24 | 74.5% |
| Morning SBP (mmHg) | day 1 | 6.25 | 7.84 | 74.0% |
| Morning SBP (mmHg) | day 2 | 6.78 | 8.15 | 73.3% |
| Morning SBP (mmHg) | day 3 | 7.0 | 8.6 | 73.5% |

## Calibration

Method: Platt scaling (logistic on logit of raw score) fit on pooled out-of-fold predictions.

| Mean predicted | Observed | n |
|---|---|---|
| 0.0014 | 0.0006 | 3568 |
| 0.0023 | 0.0022 | 3603 |
| 0.0034 | 0.0056 | 3586 |
| 0.0056 | 0.0053 | 3585 |
| 0.0101 | 0.0100 | 3586 |
| 0.0212 | 0.0218 | 3585 |
| 0.0556 | 0.0544 | 3586 |
| 0.1904 | 0.1821 | 3586 |

## Feature importance (gain, top 15)

| Feature | Stream | Share |
|---|---|---|
| `sbp_slope_7d` | wearable | 25.2% |
| `ns_state` | wearable | 16.4% |
| `sbp_unexpl` | wearable | 12.1% |
| `sbp_dev` | wearable | 7.0% |
| `hrv_unexpl` | wearable | 6.1% |
| `sleep_debt_7d` | wearable | 4.8% |
| `rhr_z` | wearable | 4.5% |
| `framingham_10y` | ehr | 3.5% |
| `sbp_unexpl_7d` | wearable | 3.0% |
| `activity_7d_z` | wearable | 2.7% |
| `sbp_last` | wearable | 2.5% |
| `rhr_dev_bbadj` | ehr | 2.3% |
| `hrv_dev` | wearable | 2.3% |
| `rhr_dev_3d` | wearable | 2.0% |
| `sleep_min` | wearable | 1.1% |

## Leakage tests

Passed: True. Run `make test`.

- `no_future_values_in_features`: pass (2026-10-17T15:56:31)
- `label_window_excludes_t`: pass (2026-10-17T15:56:31)
- `patient_level_split`: pass (2026-10-17T15:56:31)

## Published anchors (for context, not comparison)

- NightSignal, infection from overnight RHR (Alavi et al., Nat Med 2021): sensitivity: 0.8; specificity: 0.877; lead: median 3 days; note: Rule family reused here; task differs
- Epic Deterioration Index, inpatient (Singh et al., 2020): auroc: 0.76; lead: median 28 h; note: Inpatient EHR only
- Dozee early warning, Indian wards (Yadav et al., 2024): specificity: 0.42; lead: mean 16 h; note: Contactless bedside sensor; specificity 0.19 to 0.42 across tiers
- All of Us Fitbit + EHR fusion (2025): auroc_gain: +8.9% average, +10.7% hypertension; note: Concatenation + logistic regression

## Limitations

- Trained and evaluated on a synthetic cohort. Reported numbers describe how well the twin recovers injected episodes, not clinical performance.
- Strain-episode ground truth is defined by the generator; real adverse events are heterogeneous and rarer.
- Consumer-watch data syncs hourly to daily; the twin scores once per night and cannot see minute-level emergencies.
- Framingham 2008 under-estimates risk in South Asians; the WHO 2019 SEAR chart is the planned replacement.
- No validation on any Indian clinical dataset yet; BODH benchmarking and an ABDM-sandbox pilot are roadmap items.
- Personal response slopes come from everyday swings in sleep and activity (observational, not randomised); medicine, salt and alcohol effects in the what-if are population estimates because the twin has no personal data on them.
- Not a medical device. Outputs are decision support for a registered practitioner, never a diagnosis.

## Regulatory status

- STATUS: Research proof-of-concept on synthetic data; not a medical device under the Medical Devices Rules 2017
- CDSCO: A production version would be Medical Device Software, likely Class B or C under CDSCO's medical device software guidance (30 July 2026); training-data composition and synthetic-versus-real disclosure are in this card; retraining follows a versioned Algorithm Change Protocol
- DPDP: Built DPDP-ready ahead of the 13 May 2027 commencement of the consent, breach and retention rules
- TELEMEDICINE: No AI prescribing; patient-facing text never changes doses (Telemedicine Practice Guidelines 2020)
