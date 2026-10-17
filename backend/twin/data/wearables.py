"""Synthetic wearable stream generator (dynamic / real-time stream).

For every patient and every day we produce the aggregates a consumer watch actually
reports after sync: overnight resting heart rate, nightly HRV (RMSSD), sleep duration
and efficiency with stage split, steps, respiratory rate, SpO2, and a morning home blood
pressure reading when the patient measured it. A 5-minute intraday heart-rate trace can
be regenerated deterministically for any day for the twin page.

Episodes are injected so the fusion problem is real rather than trivial:

- strain episode (the labelled adverse event): a 2 to 5 day precursor ramp in which
  overnight RHR rises, HRV falls, sleep degrades, steps fall and home SBP climbs,
  followed by an event day and a recovery tail. A "silent" subtype keeps RHR almost
  flat and shows mainly in blood pressure; an "abrupt" subtype has a 2-day ramp.
- infection-like confounder (unlabelled): RHR up, HRV down, steps down, more sleep,
  SpO2 slightly down, but blood pressure flat. A wearable-only model will confuse this
  with strain; the fused model has the BP trend and the EHR to tell them apart.
- lifestyle noise (unlabelled): a late night, a missed antihypertensive dose, travel.
- missing nights and a short device-off block, plus sync lag per device class.

Parameter ranges were chosen from published consumer-wearable baselines (NightSignal's
+3/+4 bpm rule, the Australian Institute of Sport's HRV guidance on smallest worthwhile
change) and are documented in docs/DATA_SOURCES.md. Values are illustrative.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from ..config import CohortConfig
from .ehr import EHRRecord
from ..models.risk_scores import framingham_10y_risk


@dataclass
class Episode:
    patient_id: str
    kind: str  # strain_episode | infection | party | missed_dose | travel | device_off
    start: date  # first affected day
    event_day: date | None  # the adverse event day (strain only)
    end: date  # last affected day
    subtype: str = ""


# ---------------------------------------------------------------------------
# Baselines from the static record
# ---------------------------------------------------------------------------

def physiology_from_ehr(r: EHRRecord, rng: np.random.Generator) -> dict:
    """Map the static record to per-patient physiological baselines."""
    rhr = 60 + 0.35 * (r.bmi - 27) + 0.08 * (r.age - 55) - 6.0 * r.on_beta_blocker + 1.5 * r.diabetes + 2.0 * r.smoker
    rhr = float(np.clip(rhr + rng.normal(0, 4), 48, 86))
    lnrmssd = np.log(45) - 0.018 * (r.age - 55) - 0.012 * (r.bmi - 27) - 0.10 * r.diabetes + rng.normal(0, 0.18)
    lnrmssd = float(np.clip(lnrmssd, np.log(14), np.log(90)))
    sleep_min = float(np.clip(rng.normal(415, 35), 300, 520))
    sleep_eff = float(np.clip(rng.normal(0.86, 0.04), 0.7, 0.95))
    steps = float(np.clip(np.exp(rng.normal(np.log(5600) - 0.012 * (r.age - 55) - 0.02 * (r.bmi - 27), 0.35)), 1200, 16000))
    resp = float(np.clip(rng.normal(14.6, 1.1), 11, 19))
    spo2 = float(np.clip(rng.normal(96.8, 0.7), 93.5, 99))
    sbp_home = float(np.clip(r.sbp_clinic - 8 + rng.normal(0, 5), 105, 185))
    dbp_home = float(np.clip(r.dbp_clinic - 4 + rng.normal(0, 4), 60, 112))
    bp_adherence = float(np.clip(rng.beta(5, 2.5), 0.5, 0.95))  # probability of a morning reading
    return dict(rhr=rhr, lnrmssd=lnrmssd, sleep_min=sleep_min, sleep_eff=sleep_eff, steps=steps,
                resp=resp, spo2=spo2, sbp_home=sbp_home, dbp_home=dbp_home, bp_adherence=bp_adherence)


RESPONSE_KEYS = ("sleep_rhr", "steps_rhr", "steps_sbp", "sleep_hrv")


def personal_responses(r: EHRRecord, rng: np.random.Generator) -> dict:
    """Each person's own physiology: how their body responds to everyday lifestyle swings.

    These are the ground-truth slopes the twin has to learn from data. They differ from
    person to person (heterogeneous), with mild dependence on the record so the static
    stream carries some information about them.

    - sleep_rhr: change in next-night resting HR (bpm) per extra hour of sleep (negative)
    - steps_rhr: change in next-night resting HR (bpm) per extra 1,000 steps (negative)
    - steps_sbp: change in next-morning systolic BP (mmHg) per extra 1,000 steps (negative)
    - sleep_hrv: change in next-night HRV (%) per extra hour of sleep (positive)
    """
    age_f = 1.0 + 0.01 * (r.age - 55)
    sleep_rhr = -float(np.clip(rng.normal(1.0, 0.45) * (1.12 if r.diabetes else 1.0) * age_f, 0.1, 2.8))
    steps_rhr = -float(np.clip(rng.normal(0.30, 0.15), 0.0, 0.8))
    steps_sbp = -float(np.clip(rng.normal(1.1, 0.5) * (1.2 if r.bmi >= 30 else 1.0) * age_f, 0.1, 3.2))
    sleep_hrv = float(np.clip(rng.normal(4.5, 2.0), 0.3, 11.0))
    return {"sleep_rhr": round(sleep_rhr, 3), "steps_rhr": round(steps_rhr, 3),
            "steps_sbp": round(steps_sbp, 3), "sleep_hrv": round(sleep_hrv, 3)}


def episode_risk_multiplier(r: EHRRecord) -> float:
    """How much more often than the cohort median this patient gets strain episodes.
    This is what makes the static stream informative for the twin."""
    fram = framingham_10y_risk(age=r.age, sex=r.sex, tc=r.tc, hdl=r.hdl, sbp=r.sbp_clinic,
                               treated=bool(r.n_bp_meds), smoker=bool(r.smoker), diabetes=bool(r.diabetes))
    z = (np.log(max(fram, 0.5)) - np.log(10.0)) / 0.7
    m = np.exp(0.9 * z
               + 0.6 * (r.genetic_risk_tier == "high") - 0.4 * (r.genetic_risk_tier == "low")
               + 0.6 * (r.adherence_pct < 60) + 0.35 * r.ckd + 0.6 * r.prior_mi + 0.3 * r.family_history_cvd
               + 0.3 * r.diabetes)
    return float(np.clip(m, 0.1, 8.0))


# ---------------------------------------------------------------------------
# Episode scheduling
# ---------------------------------------------------------------------------

def _poisson_days(rng: np.random.Generator, rate_per_100: float, days: int, mult: float = 1.0) -> int:
    return int(rng.poisson(rate_per_100 / 100.0 * days * mult))


# Lifestyle phase settings: slow swings in sleep and walking, and how strongly a week of
# short sleep and low activity raises the chance that a strain precursor starts.
PHASE = dict(sleep_sd=32.0, steps_sd=0.22, phi=0.9, noise_sleep_sd=30.0, noise_steps_sd=0.25,
             hazard_sleep=1.4, hazard_activity=0.45)


def lifestyle_phases(cfg: CohortConfig, rng: np.random.Generator) -> dict:
    """Slow lifestyle phases (a stressful fortnight of short sleep, a week of little
    walking), as AR(1) processes with a time scale of about ten days. They add to the
    day-to-day noise in sleep and steps, and they shape when strain episodes happen."""
    n = cfg.days + cfg.horizon_days + 2
    def ar1(sd: float, phi: float = 0.9) -> np.ndarray:
        x = np.zeros(n)
        e = rng.normal(0, sd * np.sqrt(1 - phi ** 2), n)
        x[0] = rng.normal(0, sd)
        for i in range(1, n):
            x[i] = phi * x[i - 1] + e[i]
        return x
    sleep_phase_min = ar1(PHASE["sleep_sd"], PHASE["phi"])
    steps_phase_log = ar1(PHASE["steps_sd"], PHASE["phi"])
    k = 7
    roll = lambda a: np.array([a[max(0, i - k + 1): i + 1].mean() for i in range(n)])  # noqa: E731
    sleep_debt_h = -roll(sleep_phase_min) / 60.0
    activity_deficit = -roll(steps_phase_log) / 0.22  # in units of a typical weekly swing
    # Hazard multiplier for a strain precursor starting on each day: a week of short sleep
    # and low activity raises the chance that an episode starts.
    load = np.exp(PHASE["hazard_sleep"] * sleep_debt_h + PHASE["hazard_activity"] * activity_deficit)
    return {"sleep_phase_min": sleep_phase_min, "steps_phase_log": steps_phase_log, "load": load}


def schedule_episodes(r: EHRRecord, cfg: CohortConfig, rng: np.random.Generator, lifestyle: dict | None = None) -> list[Episode]:
    d0 = cfg.as_of - timedelta(days=cfg.days - 1)
    eps: list[Episode] = []
    occupied = np.zeros(cfg.days + cfg.horizon_days + 2, dtype=bool)

    # Strain episodes (labelled). Keep the first 30 days clear so baselines exist.
    n_strain = _poisson_days(rng, cfg.base_episode_rate_per_100_days, cfg.days, episode_risk_multiplier(r))
    n_strain = int(min(n_strain, 3))
    for _ in range(n_strain):
        for _try in range(20):
            # Diabetic autonomic neuropathy blunts heart-rate responses, so diabetics are more
            # likely to have a "silent" precursor that shows mainly in blood pressure.
            p_silent = 0.5 if r.diabetes else 0.15
            subtype = str(rng.choice(["classic", "silent", "abrupt"], p=[0.85 - p_silent, p_silent, 0.15]))
            ramp = {"classic": int(rng.integers(3, 6)), "silent": int(rng.integers(3, 6)), "abrupt": 2}[subtype]
            # event day index; allow events up to 3 days past as_of so the last days carry live risk.
            # When lifestyle phases are given, precursors are more likely to start after a
            # week of short sleep and low activity.
            cand = np.arange(32, cfg.days + cfg.horizon_days)
            if lifestyle is not None:
                w = lifestyle["load"][np.clip(cand - ramp, 0, None)]
                e = int(rng.choice(cand, p=w / w.sum()))
            else:
                e = int(rng.integers(32, cfg.days + cfg.horizon_days))
            s = e - ramp
            tail = int(rng.integers(3, 6))
            if occupied[max(s - 3, 0): min(e + tail + 3, len(occupied))].any():
                continue
            occupied[max(s - 1, 0): min(e + tail + 1, len(occupied))] = True
            eps.append(Episode(r.patient_id, "strain_episode", d0 + timedelta(days=s), d0 + timedelta(days=e),
                               d0 + timedelta(days=min(e + tail, cfg.days + cfg.horizon_days)), subtype))
            break

    # Infection-like confounder (unlabelled)
    for _ in range(_poisson_days(rng, cfg.infection_rate_per_100_days, cfg.days)):
        for _try in range(20):
            s = int(rng.integers(10, cfg.days - 2))
            L = int(rng.integers(3, 7))
            if occupied[s: s + L + 2].any():
                continue
            occupied[s: s + L + 1] = True
            eps.append(Episode(r.patient_id, "infection", d0 + timedelta(days=s), None, d0 + timedelta(days=s + L - 1)))
            break

    # Lifestyle noise (unlabelled); may overlap anything
    for _ in range(_poisson_days(rng, cfg.party_night_rate_per_100_days, cfg.days)):
        s = int(rng.integers(1, cfg.days))
        eps.append(Episode(r.patient_id, "party", d0 + timedelta(days=s), None, d0 + timedelta(days=s)))
    if r.n_bp_meds:
        mult = 1.6 if r.adherence_pct < 65 else 0.8
        for _ in range(_poisson_days(rng, cfg.missed_dose_rate_per_100_days, cfg.days, mult)):
            s = int(rng.integers(1, cfg.days))
            L = int(rng.integers(1, 3))
            eps.append(Episode(r.patient_id, "missed_dose", d0 + timedelta(days=s), None, d0 + timedelta(days=min(s + L - 1, cfg.days - 1))))
    for _ in range(_poisson_days(rng, cfg.travel_day_rate_per_100_days, cfg.days)):
        s = int(rng.integers(1, cfg.days))
        eps.append(Episode(r.patient_id, "travel", d0 + timedelta(days=s), None, d0 + timedelta(days=s)))
    # Device-off block for some patients
    if rng.random() < 0.12:
        s = int(rng.integers(5, cfg.days - 4))
        L = int(rng.integers(2, 4))
        eps.append(Episode(r.patient_id, "device_off", d0 + timedelta(days=s), None, d0 + timedelta(days=s + L - 1)))
    return eps


# ---------------------------------------------------------------------------
# Daily stream
# ---------------------------------------------------------------------------

def _ramp(day_idx: int, start_idx: int, event_idx: int) -> float:
    """0 → 1 over the precursor window (start..event), 1 on the event day."""
    L = max(event_idx - start_idx, 1)
    return float(np.clip((day_idx - start_idx + 1) / L, 0, 1))


def _recovery(day_idx: int, event_idx: int, end_idx: int) -> float:
    """1 on the event day decaying to 0 by end."""
    L = max(end_idx - event_idx, 1)
    return float(np.clip(1 - (day_idx - event_idx) / L, 0, 1))


def generate_daily_stream(r: EHRRecord, cfg: CohortConfig, rng: np.random.Generator,
                          episodes: list[Episode], responses: dict | None = None,
                          lifestyle: dict | None = None) -> pd.DataFrame:
    base = physiology_from_ehr(r, rng)
    d0 = cfg.as_of - timedelta(days=cfg.days - 1)
    n = cfg.days
    idx = np.arange(n)
    dates = [d0 + timedelta(days=int(i)) for i in idx]
    dow = np.array([d.weekday() for d in dates])

    # Slow drifts (random walks, small) so baselines are not perfectly flat
    drift_rhr = np.cumsum(rng.normal(0, 0.25, n)); drift_rhr -= drift_rhr.mean()
    drift_hrv = np.cumsum(rng.normal(0, 0.008, n)); drift_hrv -= drift_hrv.mean()
    drift_sbp = np.cumsum(rng.normal(0, 0.35, n)); drift_sbp -= drift_sbp.mean()

    rhr = base["rhr"] + drift_rhr + rng.normal(0, 2.0, n)
    lnrmssd = base["lnrmssd"] + drift_hrv + rng.normal(0, 0.12, n)
    if lifestyle is not None:
        sleep_phase = lifestyle["sleep_phase_min"][:n]
        steps_phase = lifestyle["steps_phase_log"][:n]
        sleep_sd, steps_sd = PHASE["noise_sleep_sd"], PHASE["noise_steps_sd"]
    else:
        sleep_phase = np.zeros(n); steps_phase = np.zeros(n)
        sleep_sd, steps_sd = 40.0, 0.33
    sleep_min = base["sleep_min"] + sleep_phase + rng.normal(0, sleep_sd, n) - 12 * (dow == 6)  # shorter Sunday night (Mon morning)
    sleep_eff = base["sleep_eff"] + rng.normal(0, 0.04, n)
    steps = base["steps"] * np.exp(steps_phase + rng.normal(0, steps_sd, n)) * np.where(dow >= 5, rng.choice([0.75, 1.25], n), 1.0)
    resp = base["resp"] + rng.normal(0, 0.45, n)
    spo2 = base["spo2"] + rng.normal(0, 0.35, n)
    sbp = base["sbp_home"] + drift_sbp + rng.normal(0, 6.0, n)
    dbp = base["dbp_home"] + 0.5 * drift_sbp + rng.normal(0, 4.5, n)

    strain_amp = {}
    for ep in episodes:
        s = (ep.start - d0).days
        e_end = (ep.end - d0).days
        if ep.kind == "strain_episode":
            e = (ep.event_day - d0).days
            amp_rhr = rng.uniform(4.5, 10.0) if ep.subtype != "silent" else rng.uniform(1.0, 3.5)
            if r.on_beta_blocker:
                amp_rhr *= 0.55  # beta blockade dampens the heart-rate response
            amp_hrv = rng.uniform(0.18, 0.40) if ep.subtype != "silent" else rng.uniform(0.03, 0.15)
            amp_sbp = rng.uniform(10, 22) if ep.subtype != "silent" else rng.uniform(12, 24)
            amp_steps = rng.uniform(0.2, 0.5)
            amp_sleep_eff = rng.uniform(0.0, 0.08)
            amp_sleep_min = rng.uniform(0.0, 60.0)
            amp_resp = rng.uniform(0.0, 1.0)
            # In hypertensive strain the blood-pressure surge leads the autonomic signs by
            # one to two days, so the BP ramp starts earlier than the heart-rate ramp.
            bp_lead = int(rng.integers(1, 3))
            for i in range(max(s - bp_lead, 0), min(e_end + 1, n)):
                f = _ramp(i, s, e) if i <= e else _recovery(i, e, e_end)
                fb = _ramp(i, s - bp_lead, e) if i <= e else _recovery(i, e, e_end)
                rhr[i] += amp_rhr * f
                lnrmssd[i] += np.log(1 - amp_hrv * f)
                sleep_eff[i] -= amp_sleep_eff * f
                sleep_min[i] -= amp_sleep_min * f
                steps[i] *= (1 - amp_steps * f)
                sbp[i] += amp_sbp * fb
                dbp[i] += 0.5 * amp_sbp * fb
                resp[i] += amp_resp * f
        elif ep.kind == "infection":
            # Same wearable signature as a strain precursor (ramp up, short plateau, recovery)
            # but blood pressure stays flat: that is the tell the fused model can use.
            L = e_end - s + 1
            peak = s + max(int(round(0.6 * L)) - 1, 0)
            amp = rng.uniform(4.5, 10.0)
            amp_hrv = rng.uniform(0.18, 0.40)
            amp_steps_i = rng.uniform(0.15, 0.4)
            amp_eff_i = rng.uniform(0.02, 0.08)
            amp_sleep_i = rng.uniform(0.0, 40.0)
            amp_resp_i = rng.uniform(1.0, 2.5)
            amp_spo2_i = rng.uniform(0.5, 1.5)
            amp_bp_i = rng.uniform(-3, 3)
            for i in range(max(s, 0), min(e_end + 1, n)):
                f = _ramp(i, s, peak) if i <= peak else _recovery(i, peak, e_end)
                rhr[i] += amp * f
                lnrmssd[i] += np.log(1 - amp_hrv * f)
                steps[i] *= (1 - amp_steps_i * f)
                sleep_eff[i] -= amp_eff_i * f
                sleep_min[i] += amp_sleep_i * f
                resp[i] += amp_resp_i * f
                spo2[i] -= amp_spo2_i * f
                sbp[i] += amp_bp_i * f
        elif ep.kind == "party":
            if 0 <= s < n:
                rhr[s] += rng.uniform(5, 8)
                lnrmssd[s] += np.log(0.75)
                sleep_min[s] -= 110
                sleep_eff[s] -= 0.1
                sbp[s] += 5
                if s + 1 < n:
                    steps[s + 1] *= 0.7
        elif ep.kind == "missed_dose":
            bump = rng.uniform(6, 13)
            for i in range(max(s, 0), min(e_end + 1, n)):
                sbp[i] += bump
                dbp[i] += 0.5 * bump
        elif ep.kind == "travel":
            if 0 <= s < n:
                steps[s] *= rng.choice([0.25, 2.6])
                sleep_min[s] -= 70
                rhr[s] += 2

    # Personal physiology: swings in sleep and activity (everyday ones and those caused by
    # late nights, travel, illness or strain) move tomorrow's heart rate, HRV and blood
    # pressure by this person's own amounts, with a lag of one night or one morning.
    if responses:
        sleep_dev_h = (sleep_min - base["sleep_min"]) / 60.0
        steps_dev_k = (steps - base["steps"]) / 1000.0
        rhr[1:] += responses["sleep_rhr"] * sleep_dev_h[:-1] + responses["steps_rhr"] * steps_dev_k[:-1]
        lnrmssd[1:] += np.log(np.clip(1 + responses["sleep_hrv"] / 100.0 * sleep_dev_h[:-1], 0.5, 1.5))
        sbp[1:] += responses["steps_sbp"] * steps_dev_k[:-1]
        dbp[1:] += 0.5 * responses["steps_sbp"] * steps_dev_k[:-1]

    rhr = np.clip(rhr, 42, 110)
    lnrmssd = np.clip(lnrmssd, np.log(8), np.log(120))
    sleep_min = np.clip(sleep_min, 120, 600)
    sleep_eff = np.clip(sleep_eff, 0.5, 0.98)
    steps = np.clip(steps, 200, 30000)
    resp = np.clip(resp, 9, 26)
    spo2 = np.clip(spo2, 88, 100)
    sbp = np.clip(sbp, 95, 215)
    dbp = np.clip(dbp, 55, 130)
    deep_pct = np.clip(rng.normal(0.18, 0.03, n) - 0.04 * (base["sleep_eff"] - sleep_eff), 0.05, 0.35)
    rem_pct = np.clip(rng.normal(0.21, 0.03, n), 0.08, 0.35)

    df = pd.DataFrame({
        "patient_id": r.patient_id,
        "date": dates,
        "rhr": np.round(rhr, 1),
        "lnrmssd": np.round(lnrmssd, 3),
        "rmssd": np.round(np.exp(lnrmssd), 1),
        "sleep_min": np.round(sleep_min, 0),
        "sleep_eff": np.round(sleep_eff, 3),
        "deep_pct": np.round(deep_pct, 3),
        "rem_pct": np.round(rem_pct, 3),
        "steps": np.round(steps, 0),
        "resp_rate": np.round(resp, 1),
        "spo2": np.round(spo2, 1),
        "sbp_home": np.round(sbp, 0),
        "dbp_home": np.round(dbp, 0),
    })

    # Home BP adherence: readings missing on some mornings; more likely measured when unwell
    measured = rng.random(n) < base["bp_adherence"]
    df.loc[~measured, ["sbp_home", "dbp_home"]] = np.nan

    # Missing nights (device not worn) and device-off blocks
    missing = rng.random(n) < cfg.missing_night_prob
    for ep in episodes:
        if ep.kind == "device_off":
            s = (ep.start - d0).days
            e_end = (ep.end - d0).days
            missing[max(s, 0): min(e_end + 1, n)] = True
    night_cols = ["rhr", "lnrmssd", "rmssd", "sleep_min", "sleep_eff", "deep_pct", "rem_pct", "resp_rate", "spo2"]
    df.loc[missing, night_cols] = np.nan
    df.loc[missing & (rng.random(n) < 0.6), "steps"] = np.nan
    df["missing"] = missing

    # Ground-truth columns (never exposed to the clinician view without ?reveal=1)
    ev_days = {ep.event_day for ep in episodes if ep.kind == "strain_episode" and ep.event_day is not None}
    df["event_day"] = df["date"].isin(ev_days)
    return df


# ---------------------------------------------------------------------------
# Intraday regeneration
# ---------------------------------------------------------------------------

def intraday_seed(patient_id: str, day: date, cohort_seed: int) -> int:
    h = hashlib.sha256(f"{cohort_seed}:{patient_id}:{day.isoformat()}".encode()).hexdigest()
    return int(h[:8], 16)


def generate_intraday_hr(patient_id: str, day: date, overnight_rhr: float, steps: float,
                         cohort_seed: int, interval_min: int = 5, acute: str | None = None) -> list[dict]:
    """Deterministic 5-minute heart-rate trace for one day whose overnight minimum matches
    the daily aggregate. ``acute`` can inject a tachycardia or bradycardia run (used by the
    simulated live stream)."""
    rng = np.random.default_rng(intraday_seed(patient_id, day, cohort_seed))
    n = int(24 * 60 / interval_min)
    t = np.arange(n) * interval_min / 60.0  # hours
    # Circadian: low at 03:00, high mid-afternoon
    circ = -np.cos((t - 3) / 24 * 2 * np.pi)  # -1 at 03:00, +1 at 15:00
    hr = overnight_rhr + 3 + 9 * (circ + 1) / 2
    # Awake bursts proportional to steps
    awake = (t > 6.5) & (t < 23)
    n_bursts = int(np.clip(steps / 1500, 1, 12))
    for _ in range(n_bursts):
        c = rng.uniform(7, 22)
        w = rng.uniform(0.2, 0.9)
        a = rng.uniform(12, 45)
        hr += a * np.exp(-0.5 * ((t - c) / w) ** 2)
    hr += rng.normal(0, 1.8, n)
    hr = np.where(awake, hr, overnight_rhr + rng.normal(0, 1.4, n) + 2 * np.clip(circ, -1, 0) + 2)
    # Re-anchor overnight minimum to the aggregate
    night = (t >= 0) & (t < 7)
    hr[night] = hr[night] - (np.percentile(hr[night], 10) - overnight_rhr)
    if acute == "acute_tachycardia":
        hr[-24:] = 145 + rng.normal(0, 4, 24)
    elif acute == "bradycardia":
        hr[-24:] = 36 + rng.normal(0, 2, 24)
    hr = np.clip(hr, 30, 200)
    start = datetime(day.year, day.month, day.day)
    return [{"t": (start + timedelta(minutes=i * interval_min)).isoformat() + "+05:30", "hr": int(round(v))}
            for i, v in enumerate(hr)]


# ---------------------------------------------------------------------------
# Device freshness
# ---------------------------------------------------------------------------

def freshness_for(r: EHRRecord, rng: np.random.Generator, as_of: date) -> tuple[datetime, int]:
    """Last sample time relative to a nominal 'now' of as_of 07:30 IST, by sync class."""
    now = datetime(as_of.year, as_of.month, as_of.day, 7, 30)
    if r.sync_interval == "hourly":
        lag = int(rng.integers(8, 95))
    elif r.sync_interval == "15min":
        lag = int(rng.integers(2, 20))
    else:
        lag = int(rng.integers(90, 20 * 60))
    if rng.random() < 0.04:
        lag = int(rng.integers(26 * 60, 72 * 60))  # offline
    return now - timedelta(minutes=lag), lag
