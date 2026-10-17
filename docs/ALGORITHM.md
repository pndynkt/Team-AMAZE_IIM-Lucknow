# How the Pratibimb algorithm works

**In one line:** the twin learns how one person's body reacts to sleep and walking, removes that from tonight's readings, and raises an alert only on the change her own habits cannot explain.

<p align="center"><img src="algorithm.png" alt="The five steps of the twin, worked on Meera Iyer" width="100%"></p>

PDF: [`algorithm.pdf`](algorithm.pdf). The numbers in the picture are recomputed from the trained model by `scripts/render_algorithm.py`.

## The idea in one minute

- **Problem with normal alerts.** They compare tonight with an average person. A short night pushes one person's heart rate up by 2 bpm and another's by 0.3 bpm, so the same rule is too loud for one and too quiet for the other.
- **What a twin adds.** A small model of each person: their usual level, and how much their body moves when they sleep less or walk less.
- **What we alert on.** Only the part of tonight's change that this person's own habits do not explain. A late night is explained. A strain episode is not.

## The five steps at a glance

| Step | What it does | In plain words | Code |
|---|---|---|---|
| **1. Personal baseline** | Rolling medians and means of the person's own past nights | "What is normal for her?" | `backend/twin/features/build.py` |
| **2. Personal response slopes** | Regression of tomorrow's heart rate, HRV and BP on today's sleep and steps, on calm days only | "How does her body react to a short night or a lazy day?" | `backend/twin/models/physiology.py` (`design_frame`, `personal_ols`) |
| **3. Empirical Bayes pooling** | Mixes each person's slope with the cohort's, weighted by how sure we are | "Do not trust two weeks of data too much." | `physiology.py` (`dersimonian_laird`, `shrink`) |
| **4. Twin-adjusted signal** | Tonight's change minus the part her habits explain | "What is left that her habits cannot explain?" | `physiology.py` (`expanding_slopes`, `twin_adjusted`) |
| **5. Fusion and calibrated alert** | LightGBM on the twin signals, home BP and eight health-record facts; calibrated; thresholds set by a false-alert budget | "How likely is a strain episode in 72 hours, and is that worth a doctor's time?" | `backend/twin/models/fusion.py` |

## Step 1: Personal baseline

- **Heart rate.** Median of the last 28 nights.
- **HRV.** Mean of the last 60 nights, plus the smallest change that matters (half a standard deviation).
- **Home BP.** Mean of the last 28 days and the 7 day trend.
- **Only the past.** Every window ends the night before, so nothing from the future leaks in.

**Meera, 12 Oct:** usual resting heart rate **56.5 bpm**, tonight **70.3 bpm**, so **+13.8 bpm** above her usual.

## Step 2: Personal response slopes

For each person, on calm days, we fit:

```
change in tomorrow's heart rate = a + b_sleep × (hours of sleep vs usual) + b_steps × (thousands of steps vs usual)
```

The same is done for HRV (in %) and next-morning BP (in mmHg). That gives four slopes per person:

| Slope | Meaning | Meera | Most people |
|---|---|---|---|
| Sleep to heart rate | Change in next-night heart rate per extra hour of sleep | -1.41 bpm | -1.03 bpm |
| Walking to heart rate | Change per extra 1,000 steps | -0.44 bpm | -0.32 bpm |
| Walking to BP | Change in next-morning BP per extra 1,000 steps | -1.28 mmHg | -1.25 mmHg |
| Sleep to HRV | Change in next-night HRV per extra hour of sleep | +3.8% | +4.4% |

- **Calm days only.** Days within three days of a warning night are left out, so an episode cannot teach the twin that a high heart rate is normal.
- **Honest error bars.** Day-to-day readings drift together, so the standard errors are widened for that drift (an AR(1) correction).
- **Meera** has 109 calm days.

## Step 3: Empirical Bayes pooling

One person's slope from a few months of data is noisy. So the twin mixes it with the cohort's slope:

```
weight on her own data = spread² / (spread² + noise²)
twin slope = weight × her slope + (1 - weight) × cohort slope
```

- **spread**: how much people genuinely differ, estimated across the whole cohort (DerSimonian and Laird method).
- **noise**: how uncertain this one person's estimate is (its standard error).

**Meera, sleep to heart rate:**
- **Inputs.** Her own fit is -1.69 (noise 0.37); the cohort is -1.03 (spread 0.43).
- **Weight.** 0.43² / (0.43² + 0.37²) = **57%**.
- **Twin slope.** 57% × (-1.69) + 43% × (-1.03) = **-1.41**.

A new user with five nights starts at the cohort value. The more calm days they log, the more the slope becomes their own.

## Step 4: Twin-adjusted signal

```
explained   = her sleep slope × (sleep vs usual last night) + her steps slope × (steps vs usual yesterday)
unexplained = tonight's change - explained
```

**Meera, 12 Oct:**
- **Her habits.** She slept 1.38 h less than usual and walked 1,498 more steps.
- **Explained part.** (-1.38) × (-1.38) + (-0.43) × (1.50) = **+1.3 bpm**.
- **Unexplained part.** 13.8 - 1.3 = **+12.6 bpm**. This is the warning signal.
- **BP.** +16 mmHg her activity cannot explain.

The slopes used here are recomputed every day from earlier days only (an expanding window), so the score never uses information from the future. `backend/tests/test_leakage.py` checks this.

## Step 5: Fusion, calibration and the alert

- **Model.** LightGBM (gradient-boosted trees) on:
  - the twin-adjusted signals;
  - the home BP trend;
  - sleep debt and activity over the week;
  - eight health-record facts: Framingham 10 year risk, genetic risk tier, medicine adherence, diabetes, prior heart attack, kidney disease, family history and beta blocker.
- **Common sense built in.** The model is not allowed to lower risk for more sleep debt, a higher Framingham score or a prior heart attack. It is also not allowed to raise risk for more walking or better adherence.
- **Calibrated.** Platt scaling makes "20%" mean about 20% of such nights had an episode. The five cross-validation models give a likely range.
- **Thresholds from a budget.** Urgent is the most sensitive cut-off that stays within 0.045 false alerts per patient-day, about one false alert per 22 patient-days.
- **Score.** Probability is mapped to 0 to 100, so 30 is the watch line and 60 is the urgent line.
- **Reasons in words.** SHAP ranks what pushed the score, grouped into health record and watch.

**Meera, 12 Oct:**
- **Chance.** **24%** chance of a strain episode in 72 hours (likely 17% to 28%); her usual is 0.7%.
- **Score.** 63 of 100, **urgent**.
- **Top reasons.** Home BP rising 2.1 mmHg a day; BP +16 mmHg unexplained; heart rate +13 bpm unexplained.

## Step 6 (for the doctor): what-if, on her own slopes

- **Vitals.** "Walk 30 minutes a day" moves Meera's predicted BP by her own slope (-4.4 mmHg) next to the cohort's (-4.3 mmHg).
- **Risk.** Risk is re-scored only through causes (a week of sleep and activity, missed doses), never by editing symptoms. For Meera, whose episode is already under way, the 72 hour risk holds; her ordinary-week risk falls by about a quarter.

## Does it work?

Patient-level 5-fold cross-validation, repeated on three different patient splits. Every number is the mean of the three splits, measured on people the model never saw.

| Model | AUROC | Episodes caught at the budget |
|---|---|---|
| Rule only (NightSignal-style) | 0.708 | 42% |
| Watch + home BP cuff + record, **no twin** (no steps 2 to 4) | 0.851 | 64% |
| **Pratibimb, all five steps** | **0.876** | **70%** |

- **Twin lift.** The twin wins on all three splits: +0.025 AUROC and +7 points of sensitivity.
- **Lead time.** Median warning 48 hours before the event.

**Does the twin learn the right person?** The synthetic data hides each person's true slopes, so this can be checked directly:

| Slope | Match with the hidden truth (r) | Error, twin | Error, one slope for everyone |
|---|---|---|---|
| Sleep to heart rate | 0.71 | 0.28 | 0.40 |
| Walking to heart rate | 0.66 | 0.09 | 0.12 |
| Walking to BP | 0.67 | 0.30 | 0.42 |
| Sleep to HRV | 0.59 | 1.32 | 1.60 |

## What it cannot do

- **Synthetic data.** All numbers come from a seeded synthetic cohort; real-world results will be lower.
- **Habits are observed, not tested.** Slopes come from everyday swings in sleep and walking, not a controlled trial.
- **Nightly, not minute by minute.** Consumer watches sync hourly to daily, so the twin scores once a night. Acute events are handled by the SOS and check-in ladder, not by the model.
- **Not a diagnosis.** Decision support for a registered practitioner.

## Pseudo-code

```python
for each person, every night t:
    baseline   = rolling_median(heart_rate[t-28 : t])                 # step 1
    calm_rows  = days[: t-4] without a warning within 3 days            # step 2
    b_raw, se  = least_squares(next_day_change ~ sleep_dev + steps_dev, calm_rows)
    b_twin     = (tau2 * b_raw + se**2 * b_cohort) / (tau2 + se**2)   # step 3
    explained  = b_twin.sleep * sleep_dev[t-1] + b_twin.steps * steps_dev[t-1]
    unexplained = (heart_rate[t] - baseline) - explained              # step 4
    p = calibrate(lightgbm([unexplained, bp_trend, load, record_facts]))  # step 5
    tier = "urgent" if p >= p_urgent else "watch" if p >= p_watch else "low"
```
