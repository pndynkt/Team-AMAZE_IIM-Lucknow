"""Build the synthetic cohort.

    python -m twin.data.generate --n 240 --days 120 --seed 42

Writes to ``backend/data/synthetic/``:

- ``ehr.parquet``          flat static records
- ``daily.parquet``        daily wearable aggregates with ground-truth ``event_day``
- ``episodes.parquet``     every injected episode (labelled and unlabelled)
- ``freshness.parquet``    last-sample time per patient
- ``fhir/<patient>.json``  Synthea-shaped FHIR R4 bundles
- ``cohort.json``          the configuration used, for reproducibility
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import CohortConfig, DATA_DIR
from .ehr import generate_ehr, ehr_to_fhir_bundle, dump_bundle, EHRRecord
from .wearables import schedule_episodes, generate_daily_stream, freshness_for, personal_responses, lifestyle_phases


def build_cohort(cfg: CohortConfig, out_dir: Path = DATA_DIR, write_fhir: bool = True) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(cfg.seed)
    records = generate_ehr(cfg, rng)

    daily_frames, episode_rows, fresh_rows, truth_rows = [], [], [], []
    for r in records:
        prng = np.random.default_rng(rng.integers(0, 2**31 - 1))
        life = lifestyle_phases(cfg, prng)
        eps = schedule_episodes(r, cfg, prng, lifestyle=life)
        resp = personal_responses(r, prng)
        truth_rows.append({"patient_id": r.patient_id, **resp})
        daily_frames.append(generate_daily_stream(r, cfg, prng, eps, responses=resp, lifestyle=life))
        for ep in eps:
            episode_rows.append({"patient_id": ep.patient_id, "kind": ep.kind, "subtype": ep.subtype,
                                 "start": ep.start, "event_day": ep.event_day, "end": ep.end})
        last, lag = freshness_for(r, prng, cfg.as_of)
        fresh_rows.append({"patient_id": r.patient_id, "last_sample_at": last, "lag_minutes": lag})

    ehr = pd.DataFrame([r.to_dict() for r in records])
    daily = pd.concat(daily_frames, ignore_index=True)
    daily["date"] = pd.to_datetime(daily["date"])
    episodes = pd.DataFrame(episode_rows)
    for c in ("start", "event_day", "end"):
        episodes[c] = pd.to_datetime(episodes[c])
    freshness = pd.DataFrame(fresh_rows)
    truth = pd.DataFrame(truth_rows)

    ehr, daily, episodes, freshness, truth = pin_demo_patients(ehr, daily, episodes, freshness, cfg, truth)
    records = [EHRRecord(**row) for row in ehr.to_dict("records")]

    ehr.to_parquet(out_dir / "ehr.parquet", index=False)
    daily.to_parquet(out_dir / "daily.parquet", index=False)
    episodes.to_parquet(out_dir / "episodes.parquet", index=False)
    freshness.to_parquet(out_dir / "freshness.parquet", index=False)
    # Ground truth for the personal physiology engine (used only to measure recovery)
    truth.to_parquet(out_dir / "physiology_truth.parquet", index=False)
    with open(out_dir / "cohort.json", "w") as f:
        json.dump({**asdict(cfg), "as_of": cfg.as_of.isoformat()}, f, indent=2)

    if write_fhir:
        fhir_dir = out_dir / "fhir"
        fhir_dir.mkdir(exist_ok=True)
        for r in records:
            dump_bundle(ehr_to_fhir_bundle(r), fhir_dir / f"{r.patient_id}.json")

    in_window = daily[daily["date"] <= pd.Timestamp(cfg.as_of)]
    summary = {
        "patients": len(ehr),
        "patient_days": int(len(in_window)),
        "strain_episodes": int((episodes["kind"] == "strain_episode").sum()),
        "events_in_window": int(in_window["event_day"].sum()),
        "infection_confounders": int((episodes["kind"] == "infection").sum()),
        "missing_nights_pct": round(100 * float(in_window["missing"].mean()), 1),
        "out_dir": str(out_dir),
    }
    return summary


def _swap_ids(df: pd.DataFrame, a: str, b: str) -> pd.DataFrame:
    m = {a: b, b: a}
    df = df.copy()
    df["patient_id"] = df["patient_id"].map(lambda x: m.get(x, x))
    return df


def pin_demo_patients(ehr, daily, episodes, freshness, cfg: CohortConfig, truth=None):
    """Make the demo reproducible: P-0007 is always "Meera Iyer", a diabetic hypertensive
    woman on a Noise watch whose strain episode peaks one to two days after as_of, and
    P-0240 is a new enrolment with only five nights of data (the "calibrating" state).
    Only identifiers and a few descriptive fields are swapped; physiology is untouched."""
    as_of = pd.Timestamp(cfg.as_of)
    strain = episodes[(episodes["kind"] == "strain_episode") & (episodes["subtype"] == "classic")]
    cands = strain[(strain["event_day"] >= as_of + pd.Timedelta(days=1)) & (strain["event_day"] <= as_of + pd.Timedelta(days=2))]
    cands = cands.merge(ehr[["patient_id", "sex", "diabetes", "on_beta_blocker"]], on="patient_id")
    cands = cands[(cands["sex"] == "F") & (cands["on_beta_blocker"] == 0)]
    if len(cands):
        pick = cands.sort_values("diabetes", ascending=False).iloc[0]["patient_id"]
        if pick != "P-0007":
            daily, episodes, freshness, ehr = (_swap_ids(x, pick, "P-0007") for x in (daily, episodes, freshness, ehr))
            if truth is not None:
                truth = _swap_ids(truth, pick, "P-0007")
        ehr = ehr.set_index("patient_id", drop=False)
        ehr.loc["P-0007", ["name", "first_name", "city", "state", "device_brand", "device_model", "sync_interval", "clinician", "age", "birth_date"]] = [
            "Meera Iyer", "Meera", "Bengaluru", "Karnataka", "Noise", "ColorFit Pro 5", "hourly", "Dr Kavya Rao", 58,
            (as_of - pd.Timedelta(days=int(58 * 365.25) + 120)).date().isoformat()]
        ehr = ehr.reset_index(drop=True)
    # New enrolment: keep only the last five nights for the last patient
    last = ehr["patient_id"].iloc[-1]
    keep = daily["date"] >= as_of - pd.Timedelta(days=4)
    daily = daily[(daily["patient_id"] != last) | keep].reset_index(drop=True)
    episodes = episodes[episodes["patient_id"] != last].reset_index(drop=True)
    ehr = ehr.sort_values("patient_id").reset_index(drop=True)
    return ehr, daily, episodes, freshness, truth


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate the Pratibimb synthetic cohort")
    ap.add_argument("--n", type=int, default=CohortConfig.n_patients)
    ap.add_argument("--days", type=int, default=CohortConfig.days)
    ap.add_argument("--seed", type=int, default=CohortConfig.seed)
    ap.add_argument("--out", type=str, default=str(DATA_DIR))
    ap.add_argument("--no-fhir", action="store_true")
    args = ap.parse_args()
    cfg = CohortConfig(seed=args.seed, n_patients=args.n, days=args.days)
    summary = build_cohort(cfg, Path(args.out), write_fhir=not args.no_fhir)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
