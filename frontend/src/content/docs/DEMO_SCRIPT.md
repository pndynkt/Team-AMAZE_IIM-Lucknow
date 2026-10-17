# Demo script for the 20-minute video

The brief asks for a video of at least 20 minutes, so the jury expects a walk through the code and the model, not a sizzle reel. Aim for 21 to 22 minutes. Record in segments with `PRATIBIMB_DEMO_SPEED=10` so the ladder moves in seconds.

**Before recording**

- **Start clean.** Stop the API, delete `backend/pratibimb.db`, run `make demo`.
- **Open tabs.** `/console`, `/console/patients/P-0007`, `/me/P-0007`, `/console/model`, `/guide`.
- **Editor.** `backend/twin/models/physiology.py`, `features/build.py`, `models/fusion.py`, `engine/twin.py`.

| Time | Segment | What to show | What to say |
|---|---|---|---|
| 0:00 to 2:00 | **Problem** | Landing page: the mark assembles, then the two streams | About 1 in 4 Indian adults has high BP. 91.6% of Indian smartwatches cost under US$50 and sync once a day. Fixed thresholds flagged 55.8% of readings in one study, so doctors stop looking. We predict a strain episode 72 hours ahead from the watch India already owns. |
| 2:00 to 4:00 | **Data** | `twin/data/ehr.py`, `wearables.py`, a FHIR bundle, `python -m twin.data.generate` | Two synthetic streams, seeded. Every patient carries hidden true response slopes and slow lifestyle phases; a week of short sleep and low activity raises the chance strain starts. Colds look like strain on the wrist but leave BP flat. No real person's data trains anything. |
| 4:00 to 6:00 | **Architecture** | `docs/architecture.pdf` | Two streams in, the Personal Physiology Engine in the middle, a calibrated warning and a consented ladder out. A companion app reads Health Connect or HealthKit, because no website can. |
| 6:00 to 10:00 | **The twin** | `physiology.py`: `design_frame`, `personal_ols`, `dersimonian_laird`, `expanding_slopes`; then the Model page recovery table | Four slopes per person: how tomorrow's heart rate, HRV and BP move with tonight's sleep and today's steps. Calm days only. Empirical Bayes pulls each estimate toward the cohort by exactly its uncertainty. Because the generator knows the truth, we can show the twin learns each person: correlation 0.59 to 0.72, better than the population average on every response. |
| 10:00 to 13:00 | **Prediction** | `fusion.py`: monotone constraints, repeated CV, operating points; `pytest tests/test_leakage.py`; the ablation table | LightGBM on twin-adjusted signals plus an eight-feature record tower. Three patient splits x 5 folds; every dashboard patient is scored by a model that never saw them. AUROC 0.876 with the twin, 0.851 without, better on all three splits. 70% of episodes caught at one false alert per 22 patient-days, median 48 hours ahead. The cuff separates strain from a cold. |
| 13:00 to 17:00 | **Doctor dashboard** | Triage, open Meera Iyer; Summary, "How Meera's body responds", Twin tab (the two nights her watch was off on 9 and 10 Oct while the cuff kept reporting, then the heart-rate ramp), inject tachycardia, Simulate, Alerts, Thresholds preview, Audit | Read the three-sentence summary. The gap shows the twin coping with missing nights: the cuff kept reporting and the score kept updating. Walking is Meera's strongest lever, by her own slope. Simulate: the 72 hour risk does not move, because the episode is already under way, but her ordinary-week risk drops by about a quarter with a daily walk and by almost half with an extra hour of sleep too, and her BP fan comes down. The budget meter and the 14 day replay keep the doctor in charge. |
| 17:00 to 19:00 | **Patient and ladder** | `/me/P-0007`: the card, Hindi with Listen, what helps you, check-in "Dizzy", press-and-hold SOS, let the countdown expire, contact 1 gets the SMS, WhatsApp and voice text, Call 112 opens the dialer, Resolve; then `/me/P-0240` | The model owns the amber tier; people and the phone own the red tier. The server never dials 112. A new user with five nights sees "still learning your normal", not a guess. |
| 19:00 to 20:30 | **Compliance and limits** | Consent sheet, opt out of AI, Model page regulatory block, limitations | DPDP-ready ahead of May 2027, a CDSCO Medical Device Software path, no AI prescribing. Limits: synthetic labels, nightly scoring, no heart-attack detection, and the record adds ranking more than timing. |
| 20:30 to 21:30 | **Roadmap and team** | Roadmap slide, team slide | ABDM sandbox, Android companion on Health Connect, a clinic pilot, real-data validation. Team, college, thanks. |

**Checklist before upload**

- **Video.** Unlisted YouTube or recorded PowerPoint; link in the README.
- **Repo.** Public; a fresh clone runs with the README commands.
- **Folder.** Named `Team Pratibimb_IIM Lucknow`.
