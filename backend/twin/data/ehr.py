"""Synthetic EHR generator (static / historical stream).

Produces, for each patient, a flat record and a FHIR R4 Bundle that mirrors what Synthea
emits (Patient, Condition, Observation, MedicationStatement, FamilyMemberHistory). All
names, identifiers and values are synthetic. Prevalences are tuned to an Indian
hypertension clinic population rather than to a general population, so the cohort is
enriched for the condition the twin is built for.

Nothing here is a clinical reference. It exists so the twin has a realistic static
stream to fuse with the wearable stream.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from typing import Any

import numpy as np

from ..config import CohortConfig

# ---------------------------------------------------------------------------
# Name and place pools (synthetic)
# ---------------------------------------------------------------------------

FIRST_F = ["Meera", "Ananya", "Kavita", "Lakshmi", "Priya", "Sunita", "Rekha", "Nandini", "Pooja", "Asha",
           "Geeta", "Shreya", "Divya", "Radha", "Farah", "Zoya", "Mariam", "Simran", "Harpreet", "Devika",
           "Padma", "Sushma", "Vandana", "Jyoti", "Anjali", "Kiran", "Neha", "Savita", "Bhavna", "Uma"]
FIRST_M = ["Arjun", "Rahul", "Suresh", "Ramesh", "Vikram", "Anil", "Manoj", "Deepak", "Sanjay", "Rajesh",
           "Imran", "Farhan", "Joseph", "Thomas", "Gurpreet", "Harish", "Nikhil", "Pradeep", "Mahesh", "Venkat",
           "Srinivas", "Karthik", "Abhishek", "Mohan", "Prakash", "Dinesh", "Sunil", "Vivek", "Ajay", "Satish"]
LAST = ["Iyer", "Sharma", "Reddy", "Nair", "Patel", "Singh", "Khan", "Das", "Mukherjee", "Rao", "Menon",
        "Gupta", "Verma", "Joshi", "Kulkarni", "Deshpande", "Pillai", "Chowdhury", "Bose", "Yadav",
        "Mishra", "Agarwal", "Shetty", "Hegde", "Naidu", "Fernandes", "D'Souza", "Kaur", "Bhat", "Jain"]

CITIES = [("Bengaluru", "Karnataka"), ("Mysuru", "Karnataka"), ("Chennai", "Tamil Nadu"), ("Coimbatore", "Tamil Nadu"),
          ("Hyderabad", "Telangana"), ("Mumbai", "Maharashtra"), ("Pune", "Maharashtra"), ("Nagpur", "Maharashtra"),
          ("Delhi", "Delhi"), ("Noida", "Uttar Pradesh"), ("Lucknow", "Uttar Pradesh"), ("Jaipur", "Rajasthan"),
          ("Kolkata", "West Bengal"), ("Kochi", "Kerala"), ("Thiruvananthapuram", "Kerala"), ("Ahmedabad", "Gujarat"),
          ("Indore", "Madhya Pradesh"), ("Chandigarh", "Punjab"), ("Bhubaneswar", "Odisha"), ("Guwahati", "Assam")]

DEVICES = {
    "Noise": ["ColorFit Pro 5", "ColorFit Icon 3", "Pulse 4 Max"],
    "boAt": ["Wave Sigma 3", "Lunar Pro", "Storm Call 3"],
    "Fire-Boltt": ["Ninja Call Pro", "Phoenix Ultra", "Rise"],
    "Samsung": ["Galaxy Watch 7", "Galaxy Watch FE", "Galaxy Fit 3"],
    "Amazfit": ["Bip 5", "GTS 4 Mini", "Active"],
    "Apple": ["Watch SE", "Watch Series 10"],
    "Other": ["Fastrack Reflex", "Titan Smart", "Pebble Cosmos"],
}

# SNOMED CT codes (display only; the cohort is synthetic)
SNOMED = {
    "hypertension": ("59621000", "Essential hypertension"),
    "t2d": ("44054006", "Type 2 diabetes mellitus"),
    "ckd": ("709044004", "Chronic kidney disease"),
    "ihd": ("414545008", "Ischemic heart disease"),
    "prior_mi": ("22298006", "Myocardial infarction (history)"),
    "afib": ("49436004", "Atrial fibrillation"),
    "dyslipidemia": ("370992007", "Dyslipidemia"),
    "obesity": ("414916001", "Obesity"),
}

LOINC = {
    "sbp": ("8480-6", "Systolic blood pressure", "mm[Hg]"),
    "dbp": ("8462-4", "Diastolic blood pressure", "mm[Hg]"),
    "hba1c": ("4548-4", "Hemoglobin A1c/Hemoglobin.total in Blood", "%"),
    "tc": ("2093-3", "Cholesterol [Mass/volume] in Serum or Plasma", "mg/dL"),
    "hdl": ("2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma", "mg/dL"),
    "ldl": ("13457-7", "Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation", "mg/dL"),
    "tg": ("2571-8", "Triglyceride [Mass/volume] in Serum or Plasma", "mg/dL"),
    "bmi": ("39156-5", "Body mass index (BMI) [Ratio]", "kg/m2"),
    "egfr": ("33914-3", "Glomerular filtration rate/1.73 sq M.predicted", "mL/min/{1.73_m2}"),
    "creatinine": ("2160-0", "Creatinine [Mass/volume] in Serum or Plasma", "mg/dL"),
}

MEDS = {
    # name, class, RxNorm-like code (illustrative)
    "amlodipine": ("Amlodipine 5 mg", "Calcium channel blocker", "197361"),
    "telmisartan": ("Telmisartan 40 mg", "Angiotensin receptor blocker", "316151"),
    "metoprolol": ("Metoprolol succinate 25 mg", "Beta blocker", "866924"),
    "hctz": ("Hydrochlorothiazide 12.5 mg", "Thiazide diuretic", "310798"),
    "atorvastatin": ("Atorvastatin 10 mg", "Statin", "617310"),
    "metformin": ("Metformin 500 mg", "Biguanide", "861007"),
    "aspirin": ("Aspirin 75 mg", "Antiplatelet", "243670"),
}


@dataclass
class EHRRecord:
    """Flat static record for one patient (what the feature builder consumes)."""

    patient_id: str
    name: str
    first_name: str
    sex: str  # "M" | "F"
    age: int
    birth_date: str
    city: str
    state: str
    abha_masked: str
    device_brand: str
    device_model: str
    sync_interval: str  # "hourly" | "daily" | "15min"
    bmi: float
    smoker: int
    diabetes: int
    hba1c: float
    ckd: int
    egfr: float
    tc: float
    hdl: float
    ldl: float
    tg: float
    sbp_clinic: int
    dbp_clinic: int
    on_ccb: int
    on_arb: int
    on_beta_blocker: int
    on_diuretic: int
    on_statin: int
    on_metformin: int
    on_aspirin: int
    n_bp_meds: int
    adherence_pct: int
    family_history_cvd: int
    genetic_risk_tier: str  # "low" | "medium" | "high"
    prior_mi: int
    afib_history: int
    ihd: int
    hypertension_onset: str
    last_clinic_visit: str
    clinician: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _choice(rng: np.random.Generator, options: list, p: list[float] | None = None):
    idx = rng.choice(len(options), p=p)
    return options[idx]


def _mask_abha(rng: np.random.Generator) -> str:
    return f"{rng.integers(10, 99)}-XXXX-XXXX-{rng.integers(1000, 9999)}"


def generate_ehr(cfg: CohortConfig, rng: np.random.Generator) -> list[EHRRecord]:
    """Generate ``cfg.n_patients`` static records. Deterministic given ``rng``."""
    records: list[EHRRecord] = []
    brands = list(cfg.device_mix.keys())
    brand_p = np.array([cfg.device_mix[b] for b in brands])
    brand_p = brand_p / brand_p.sum()
    clinicians = ["Dr Kavya Rao", "Dr Arvind Menon", "Dr Sunita Kulkarni", "Dr Imran Sheikh"]

    for i in range(cfg.n_patients):
        pid = f"P-{i + 1:04d}"
        sex = "F" if rng.random() < 0.48 else "M"
        first = _choice(rng, FIRST_F if sex == "F" else FIRST_M)
        last = _choice(rng, LAST)
        age = int(np.clip(rng.normal(56, 10), 35, 78))
        birth = cfg.as_of - timedelta(days=int(age * 365.25 + rng.integers(0, 364)))
        city, state = _choice(rng, CITIES)

        # Anthropometrics and labs, loosely correlated with age and sex
        bmi = float(np.clip(rng.normal(27.2, 3.6), 18.5, 41))
        smoker = int(rng.random() < (0.22 if sex == "M" else 0.04))
        diabetes = int(rng.random() < 0.42)
        hba1c = float(np.clip(rng.normal(7.4, 1.1), 6.5, 11.5)) if diabetes else float(np.clip(rng.normal(5.6, 0.35), 4.8, 6.4))
        egfr = float(np.clip(rng.normal(84 - (age - 50) * 0.6, 14), 25, 120))
        ckd = int(egfr < 60)
        tc = float(np.clip(rng.normal(196, 34), 120, 320))
        hdl = float(np.clip(rng.normal(44 if sex == "M" else 50, 9), 25, 90))
        ldl = float(np.clip(tc - hdl - rng.normal(28, 8), 50, 230))
        tg = float(np.clip(rng.normal(165, 55), 60, 450))
        sbp_clinic = int(np.clip(rng.normal(146, 13), 118, 196))
        dbp_clinic = int(np.clip(sbp_clinic * 0.62 + rng.normal(0, 6), 70, 118))

        # Medications: hypertension clinic, so nearly everyone is on something
        on_ccb = int(rng.random() < 0.62)
        on_arb = int(rng.random() < 0.55)
        on_beta = int(rng.random() < 0.22)
        on_diur = int(rng.random() < 0.18)
        if on_ccb + on_arb + on_beta + on_diur == 0:
            on_ccb = 1
        on_statin = int(rng.random() < (0.72 if ldl > 130 or diabetes else 0.35))
        on_metformin = int(diabetes and rng.random() < 0.85)
        prior_mi = int(rng.random() < 0.07)
        ihd = int(prior_mi or rng.random() < 0.08)
        on_aspirin = int(ihd or rng.random() < 0.12)
        adherence = int(np.clip(rng.normal(78, 14), 35, 100))
        fam = int(rng.random() < 0.38)
        tier = _choice(rng, ["low", "medium", "high"], [0.3, 0.45, 0.25])
        afib = int(rng.random() < 0.05)

        brand = _choice(rng, brands, list(brand_p))
        model = _choice(rng, DEVICES[brand])
        sync = {"Apple": "hourly", "Samsung": "hourly", "Amazfit": "hourly"}.get(brand, "daily" if rng.random() < 0.5 else "hourly")

        onset_years = int(np.clip(rng.normal(6, 4), 0, 25))
        onset = cfg.as_of - timedelta(days=onset_years * 365 + int(rng.integers(0, 365)))
        last_visit = cfg.as_of - timedelta(days=int(rng.integers(20, 120)))

        records.append(
            EHRRecord(
                patient_id=pid, name=f"{first} {last}", first_name=first, sex=sex, age=age,
                birth_date=birth.isoformat(), city=city, state=state, abha_masked=_mask_abha(rng),
                device_brand=brand, device_model=model, sync_interval=sync,
                bmi=round(bmi, 1), smoker=smoker, diabetes=diabetes, hba1c=round(hba1c, 1), ckd=ckd,
                egfr=round(egfr, 0), tc=round(tc, 0), hdl=round(hdl, 0), ldl=round(ldl, 0), tg=round(tg, 0),
                sbp_clinic=sbp_clinic, dbp_clinic=dbp_clinic,
                on_ccb=on_ccb, on_arb=on_arb, on_beta_blocker=on_beta, on_diuretic=on_diur,
                on_statin=on_statin, on_metformin=on_metformin, on_aspirin=on_aspirin,
                n_bp_meds=on_ccb + on_arb + on_beta + on_diur, adherence_pct=adherence,
                family_history_cvd=fam, genetic_risk_tier=tier, prior_mi=prior_mi, afib_history=afib, ihd=ihd,
                hypertension_onset=onset.isoformat(), last_clinic_visit=last_visit.isoformat(),
                clinician=clinicians[i % len(clinicians)],
            )
        )
    return records


# ---------------------------------------------------------------------------
# FHIR R4 rendering
# ---------------------------------------------------------------------------

def _obs(pid: str, key: str, value: float, when: str) -> dict:
    code, display, unit = LOINC[key]
    return {
        "resourceType": "Observation",
        "id": f"{pid}-obs-{key}",
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                   "code": "laboratory" if key not in ("sbp", "dbp", "bmi") else "vital-signs"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": code, "display": display}]},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": when,
        "valueQuantity": {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": unit},
    }


def _condition(pid: str, key: str, onset: str) -> dict:
    code, display = SNOMED[key]
    return {
        "resourceType": "Condition",
        "id": f"{pid}-cond-{key}",
        "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
        "code": {"coding": [{"system": "http://snomed.info/sct", "code": code, "display": display}]},
        "subject": {"reference": f"Patient/{pid}"},
        "onsetDateTime": onset,
    }


def _med(pid: str, key: str) -> dict:
    name, cls, code = MEDS[key]
    return {
        "resourceType": "MedicationStatement",
        "id": f"{pid}-med-{key}",
        "status": "active",
        "medicationCodeableConcept": {"coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": code, "display": name}],
                                      "text": name},
        "subject": {"reference": f"Patient/{pid}"},
        "note": [{"text": f"Class: {cls}"}],
    }


def ehr_to_fhir_bundle(r: EHRRecord) -> dict:
    """Render a flat record as a FHIR R4 collection bundle (Synthea-shaped)."""
    pid = r.patient_id
    visit = r.last_clinic_visit
    entries: list[dict] = [
        {
            "resourceType": "Patient",
            "id": pid,
            "identifier": [{"system": "https://healthid.ndhm.gov.in", "value": r.abha_masked}],
            "name": [{"use": "official", "text": r.name, "family": r.name.split()[-1], "given": [r.first_name]}],
            "gender": "female" if r.sex == "F" else "male",
            "birthDate": r.birth_date,
            "address": [{"city": r.city, "state": r.state, "country": "IN"}],
            "extension": [{"url": "urn:pratibimb:synthetic", "valueBoolean": True}],
        },
        _condition(pid, "hypertension", r.hypertension_onset),
    ]
    if r.diabetes:
        entries.append(_condition(pid, "t2d", r.hypertension_onset))
    if r.ckd:
        entries.append(_condition(pid, "ckd", visit))
    if r.ihd:
        entries.append(_condition(pid, "ihd", visit))
    if r.prior_mi:
        entries.append(_condition(pid, "prior_mi", visit))
    if r.afib_history:
        entries.append(_condition(pid, "afib", visit))
    if r.ldl > 130:
        entries.append(_condition(pid, "dyslipidemia", visit))
    if r.bmi >= 30:
        entries.append(_condition(pid, "obesity", visit))

    for key, value in (("sbp", r.sbp_clinic), ("dbp", r.dbp_clinic), ("hba1c", r.hba1c), ("tc", r.tc),
                       ("hdl", r.hdl), ("ldl", r.ldl), ("tg", r.tg), ("bmi", r.bmi), ("egfr", r.egfr)):
        entries.append(_obs(pid, key, value, visit))

    # Genetic marker (synthetic polygenic risk tier) as an Observation with a local code system
    entries.append({
        "resourceType": "Observation",
        "id": f"{pid}-obs-prs",
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "laboratory"}]}],
        "code": {"coding": [{"system": "urn:pratibimb:genetics", "code": "cad-prs-tier", "display": "CAD polygenic risk tier (synthetic)"}]},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": visit,
        "valueCodeableConcept": {"text": r.genetic_risk_tier},
    })

    for key, flag in (("amlodipine", r.on_ccb), ("telmisartan", r.on_arb), ("metoprolol", r.on_beta_blocker),
                      ("hctz", r.on_diuretic), ("atorvastatin", r.on_statin), ("metformin", r.on_metformin),
                      ("aspirin", r.on_aspirin)):
        if flag:
            entries.append(_med(pid, key))

    if r.family_history_cvd:
        entries.append({
            "resourceType": "FamilyMemberHistory",
            "id": f"{pid}-fmh-1",
            "status": "completed",
            "patient": {"reference": f"Patient/{pid}"},
            "relationship": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-RoleCode", "code": "FTH", "display": "father"}]},
            "condition": [{"code": {"coding": [{"system": "http://snomed.info/sct", "code": "22298006", "display": "Myocardial infarction"}]},
                           "onsetAge": {"value": 61, "unit": "a"}}],
        })

    return {
        "resourceType": "Bundle",
        "id": f"{pid}-ehr",
        "type": "collection",
        "meta": {"tag": [{"system": "urn:pratibimb", "code": "synthetic", "display": "Synthetic data, not a real person"}]},
        "entry": [{"fullUrl": f"urn:uuid:{e['resourceType']}-{e['id']}", "resource": e} for e in entries],
    }


def dump_bundle(bundle: dict, path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, indent=1)
