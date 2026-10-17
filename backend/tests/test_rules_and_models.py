import numpy as np
import pandas as pd

from twin.models.nightsignal import run_state_machine
from twin.models.risk_scores import framingham_10y_risk
from twin.models.fusion import probability_to_score


def test_nightsignal_red_after_two_consecutive_nights():
    dev = np.array([0.0, 1.0, 4.5, 4.2, 1.0, 0.0])
    state, days = run_state_machine(dev, 3.0, 4.0, 2)
    assert state.tolist() == [0, 0, 1, 2, 0, 0]
    assert days[3] == 1


def test_nightsignal_three_yellow_nights_turn_red_and_missing_holds_state():
    dev = np.array([3.2, np.nan, 3.1, 3.4, np.nan, 2.0])
    state, _ = run_state_machine(dev, 3.0, 4.0, 2)
    assert state.tolist() == [1, 1, 1, 2, 2, 0]


def test_framingham_matches_published_worked_example():
    # D'Agostino 2008: 61-year-old woman, TC 180, HDL 47, SBP 124 untreated, smoker, no diabetes → 10.48%
    assert abs(framingham_10y_risk(61, "F", 180, 47, 124, False, True, False) - 10.5) < 0.2


def test_score_mapping_is_monotone_and_hits_tier_cutoffs():
    p_watch, p_urgent = 0.05, 0.2
    assert probability_to_score(0.0, p_watch, p_urgent) == 0
    assert probability_to_score(p_watch, p_watch, p_urgent) == 30
    assert probability_to_score(p_urgent, p_watch, p_urgent) == 60
    assert probability_to_score(1.0, p_watch, p_urgent) == 100
    ps = np.linspace(0, 1, 50)
    s = probability_to_score(ps, p_watch, p_urgent)
    assert np.all(np.diff(s) >= 0)


def test_cohort_scores_and_tiers(cohort):
    sp = cohort.scored("P-0007")
    assert {"p", "p_lo", "p_hi", "score", "tier"} <= set(sp.feat.columns)
    assert (sp.feat["p_lo"] <= sp.feat["p"]).all() and (sp.feat["p"] <= sp.feat["p_hi"]).all()
    assert sp.feat["tier"].isin(["low", "watch", "urgent"]).all()
    cur = cohort.current("P-0007")
    assert cur["tier"] in ("watch", "urgent")  # the pinned demo patient has an episode in 1 to 2 days


def test_new_enrolment_is_calibrating(cohort):
    sp = cohort.scored("P-0240")
    assert sp.nights_available <= 5
    assert sp.confidence == "low"


def test_forecast_quantiles_ordered(cohort):
    fc = cohort.forecast_for("P-0007")
    for name in ("rhr", "sbp"):
        for row in fc[name]:
            assert row["p10"] <= row["p50"] <= row["p90"]
