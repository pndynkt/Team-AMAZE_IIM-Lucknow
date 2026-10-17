"""Leakage tests. These are the tests the model card points to.

1. no_future_values_in_features: the feature row for day t is identical whether or not
   the stream is truncated at t, so nothing after t leaks in.
2. patient_level_split: no patient appears in more than one fold, and every patient is
   scored out-of-fold by a model that never saw them.
3. label_window_excludes_t: the label for day t only looks at (t, t + horizon].
"""

import json

import numpy as np
import pandas as pd
import pytest

from twin.config import ARTIFACT_DIR, DATA_DIR
from twin.features.build import build_features, dynamic_features, labels_for, ALL_FEATURES


@pytest.fixture(scope="module")
def data():
    ehr = pd.read_parquet(DATA_DIR / "ehr.parquet")
    daily = pd.read_parquet(DATA_DIR / "daily.parquet")
    episodes = pd.read_parquet(DATA_DIR / "episodes.parquet")
    return ehr, daily, episodes


def test_no_future_values_in_features(data):
    """Every dynamic and twin-adjusted feature for day t is identical whether or not the
    stream is truncated at t."""
    from twin.features.build import add_twin_features, static_vector, WEARABLE_FEATURES, TWIN_RECORD_FEATURES
    from twin.models import physiology as PH
    pj = json.loads((ARTIFACT_DIR / "physiology.json").read_text())
    priors = PH.Priors(pj["priors"]["mu"], pj["priors"]["tau2"])
    ehr, daily, episodes = data
    statics = ehr.set_index("patient_id")
    cols = WEARABLE_FEATURES + TWIN_RECORD_FEATURES
    for pid in ["P-0007", "P-0042", "P-0120"]:
        g = daily[daily["patient_id"] == pid].sort_values("date").reset_index(drop=True)

        def build(rows):
            f = dynamic_features(rows)
            for k, v in static_vector(statics.loc[pid].rename(None).to_dict() | {"patient_id": pid}).items():
                f[k] = v
            return add_twin_features(f, priors)

        full = build(g)
        for cut in (40, 75, len(g) - 5):
            trunc = build(g.iloc[:cut])
            a = full.iloc[cut - 1][cols].astype(float).to_numpy()
            b = trunc.iloc[cut - 1][cols].astype(float).to_numpy()
            both_nan = np.isnan(a) & np.isnan(b)
            diff = np.nanmax(np.abs(np.where(both_nan, 0, a - b)))
            assert diff < 1e-9, f"{pid} day {cut}: features differ after truncation ({diff})"
    _record("no_future_values_in_features", True)


def test_label_window_excludes_t():
    dates = pd.Series(pd.date_range("2026-01-01", periods=10))
    y = labels_for(dates, [pd.Timestamp("2026-01-06")], horizon_days=3)
    # event on index 5: labelled days are 2, 3, 4 (t < e and t >= e - 3); day 5 itself is not
    assert y.tolist() == [0, 0, 1, 1, 1, 0, 0, 0, 0, 0]
    _record("label_window_excludes_t", True)


def test_patient_level_split():
    import joblib
    arts = joblib.load(ARTIFACT_DIR / "fusion.pkl")
    seen = set()
    for fold in arts.folds:
        assert not (seen & set(fold)), "patient appears in two folds"
        seen |= set(fold)
    assert len(seen) == len(arts.fold_of) == 240
    for pid, idx in arts.fold_of.items():
        assert pid in arts.folds[idx]
    _record("patient_level_split", True)


def test_static_features_constant_per_patient(data):
    ehr, daily, episodes = data
    fb = build_features(ehr, daily.head(240 * 10), episodes)
    nun = fb.frame.groupby("patient_id")[["age", "framingham_10y", "genetic_tier"]].nunique().max()
    assert (nun == 1).all()


def _record(name: str, passed: bool) -> None:
    path = ARTIFACT_DIR / "leakage_tests.json"
    doc = {"passed": True, "tests": []}
    if path.exists():
        doc = json.loads(path.read_text())
    tests = [t for t in doc.get("tests", []) if (t["name"] if isinstance(t, dict) else t) != name]
    tests.append({"name": name, "passed": passed, "at": pd.Timestamp.now().isoformat(timespec="seconds")})
    doc["tests"] = tests
    doc["passed"] = all(t["passed"] for t in tests if isinstance(t, dict))
    path.write_text(json.dumps(doc, indent=2))
