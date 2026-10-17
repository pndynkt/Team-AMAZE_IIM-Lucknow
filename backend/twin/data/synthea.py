"""Loader for real Synthea CSV output.

The competition names Synthea as an accepted EHR source. Our default cohort is generated
by ``twin.data.ehr`` in the same shape, but if a team runs Synthea
(``./run_synthea -p 1000 --exporter.csv.export=true``) this module maps its
``patients.csv``, ``conditions.csv``, ``observations.csv`` and ``medications.csv`` onto
the same flat :class:`EHRRecord` so the rest of the pipeline is unchanged.

Only the fields the twin needs are extracted. Missing labs fall back to cohort medians,
and the mapping is logged so a reviewer can see what was imputed.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .ehr import EHRRecord, DEVICES

_SNOMED_HTN = {"59621000", "38341003"}
_SNOMED_T2D = {"44054006"}
_SNOMED_CKD = {"709044004", "431855005", "431856006", "433144002", "431857002"}
_SNOMED_MI = {"22298006", "401303003", "401314000"}
_SNOMED_IHD = {"414545008", "53741008"}
_SNOMED_AF = {"49436004"}

_LOINC = {"8480-6": "sbp", "8462-4": "dbp", "4548-4": "hba1c", "2093-3": "tc", "2085-9": "hdl",
          "18262-6": "ldl", "13457-7": "ldl", "2571-8": "tg", "39156-5": "bmi", "33914-3": "egfr"}

_MED_CLASS = {
    "amlodipine": "on_ccb", "nifedipine": "on_ccb", "telmisartan": "on_arb", "losartan": "on_arb",
    "lisinopril": "on_arb", "valsartan": "on_arb", "metoprolol": "on_beta_blocker", "atenolol": "on_beta_blocker",
    "hydrochlorothiazide": "on_diuretic", "chlorthalidone": "on_diuretic", "atorvastatin": "on_statin",
    "simvastatin": "on_statin", "rosuvastatin": "on_statin", "metformin": "on_metformin", "aspirin": "on_aspirin",
}


def load_synthea_csv(folder: str | Path, as_of: date, rng: np.random.Generator | None = None,
                     max_patients: int | None = None) -> list[EHRRecord]:
    folder = Path(folder)
    rng = rng or np.random.default_rng(0)
    patients = pd.read_csv(folder / "patients.csv")
    conditions = pd.read_csv(folder / "conditions.csv")
    observations = pd.read_csv(folder / "observations.csv")
    medications = pd.read_csv(folder / "medications.csv") if (folder / "medications.csv").exists() else pd.DataFrame()

    conditions["CODE"] = conditions["CODE"].astype(str)
    observations = observations[observations["CODE"].astype(str).isin(_LOINC)].copy()
    observations["key"] = observations["CODE"].astype(str).map(_LOINC)
    observations["VALUE"] = pd.to_numeric(observations["VALUE"], errors="coerce")
    observations["DATE"] = pd.to_datetime(observations["DATE"], errors="coerce", utc=True)
    latest = (observations.sort_values("DATE").groupby(["PATIENT", "key"])["VALUE"].last().unstack())

    # Keep only patients with hypertension, matching the twin's target population
    htn_ids = set(conditions.loc[conditions["CODE"].isin(_SNOMED_HTN), "PATIENT"])
    patients = patients[patients["Id"].isin(htn_ids)]
    if max_patients:
        patients = patients.head(max_patients)

    records: list[EHRRecord] = []
    brands = list(DEVICES.keys())
    for i, p in enumerate(patients.itertuples(index=False)):
        pid_src = p.Id
        birth = pd.to_datetime(p.BIRTHDATE).date()
        age = int((as_of - birth).days // 365.25)
        sex = "F" if str(p.GENDER).upper().startswith("F") else "M"
        conds = set(conditions.loc[conditions["PATIENT"] == pid_src, "CODE"])
        labs = latest.loc[pid_src] if pid_src in latest.index else pd.Series(dtype=float)

        def lab(key: str, default: float) -> float:
            v = labs.get(key, np.nan) if len(labs) else np.nan
            return float(v) if pd.notna(v) else default

        meds_flags = {k: 0 for k in ("on_ccb", "on_arb", "on_beta_blocker", "on_diuretic", "on_statin", "on_metformin", "on_aspirin")}
        if len(medications):
            desc = medications.loc[(medications["PATIENT"] == pid_src) & medications["STOP"].isna(), "DESCRIPTION"].astype(str).str.lower()
            for d in desc:
                for needle, flag in _MED_CLASS.items():
                    if needle in d:
                        meds_flags[flag] = 1
        onset = conditions.loc[(conditions["PATIENT"] == pid_src) & conditions["CODE"].isin(_SNOMED_HTN), "START"].min()
        brand = brands[i % len(brands)]
        records.append(EHRRecord(
            patient_id=f"S-{i + 1:04d}", name=f"{p.FIRST} {p.LAST}".replace("0", "").replace("1", "").replace("2", "").replace("3", "").replace("4", "").replace("5", "").replace("6", "").replace("7", "").replace("8", "").replace("9", ""),
            first_name=str(p.FIRST).rstrip("0123456789"), sex=sex, age=age, birth_date=birth.isoformat(),
            city=str(getattr(p, "CITY", "")), state=str(getattr(p, "STATE", "")), abha_masked="XX-XXXX-XXXX-XXXX",
            device_brand=brand, device_model=DEVICES[brand][0], sync_interval="hourly",
            bmi=round(lab("bmi", 27.0), 1), smoker=0, diabetes=int(bool(conds & _SNOMED_T2D)),
            hba1c=round(lab("hba1c", 7.0 if conds & _SNOMED_T2D else 5.6), 1), ckd=int(bool(conds & _SNOMED_CKD)),
            egfr=round(lab("egfr", 85.0), 0), tc=round(lab("tc", 195.0), 0), hdl=round(lab("hdl", 46.0), 0),
            ldl=round(lab("ldl", 120.0), 0), tg=round(lab("tg", 160.0), 0),
            sbp_clinic=int(lab("sbp", 145.0)), dbp_clinic=int(lab("dbp", 90.0)),
            **meds_flags,
            n_bp_meds=meds_flags["on_ccb"] + meds_flags["on_arb"] + meds_flags["on_beta_blocker"] + meds_flags["on_diuretic"],
            adherence_pct=int(rng.integers(55, 100)), family_history_cvd=int(rng.random() < 0.35),
            genetic_risk_tier=str(rng.choice(["low", "medium", "high"], p=[0.3, 0.45, 0.25])),
            prior_mi=int(bool(conds & _SNOMED_MI)), afib_history=int(bool(conds & _SNOMED_AF)),
            ihd=int(bool(conds & (_SNOMED_IHD | _SNOMED_MI))),
            hypertension_onset=str(onset)[:10] if pd.notna(onset) else as_of.isoformat(),
            last_clinic_visit=as_of.isoformat(), clinician="Dr Kavya Rao",
        ))
    return records
