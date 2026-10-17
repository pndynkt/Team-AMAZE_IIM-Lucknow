"""NightSignal-style rule on overnight resting heart rate.

Alavi et al. (Nature Medicine, 2021) raised an alarm when overnight RHR sat 3 to 4 bpm
above a streaming personal baseline for consecutive nights, reporting 80% sensitivity
and 87.7% specificity for infection with alerts a median 3 days before symptoms. We
reuse the shape of that rule as a transparent, rule-based detector that runs next to the
learned model. Thresholds are editable from the console.

States: ``green`` (0), ``yellow`` (1), ``red`` (2).

- yellow: deviation ≥ ``delta_yellow`` tonight
- red:    deviation ≥ ``delta_red`` for ``consecutive`` nights, or yellow for three nights running
- back to green after one night below ``delta_yellow``; missing nights hold the state
"""

from __future__ import annotations

import numpy as np


def run_state_machine(dev: np.ndarray, delta_yellow: float = 3.0, delta_red: float = 4.0,
                      consecutive: int = 2) -> tuple[np.ndarray, np.ndarray]:
    """``dev`` is overnight RHR minus the personal baseline (NaN when the night is missing).
    Returns ``(state, days_in_state)`` arrays of the same length."""
    n = len(dev)
    state = np.zeros(n, dtype=int)
    days_in = np.zeros(n, dtype=int)
    red_run = 0
    yellow_run = 0
    cur = 0
    cur_days = 0
    for i in range(n):
        d = dev[i]
        if np.isnan(d):
            # hold state, do not advance runs
            state[i] = cur
            cur_days += 1 if cur else 0
            days_in[i] = cur_days
            continue
        if d >= delta_red:
            red_run += 1
            yellow_run += 1
        elif d >= delta_yellow:
            red_run = 0
            yellow_run += 1
        else:
            red_run = 0
            yellow_run = 0
        if red_run >= consecutive or yellow_run >= 3:
            new = 2
        elif yellow_run >= 1:
            new = 1
        else:
            new = 0
        if new == cur:
            cur_days = cur_days + 1 if new else 0
        else:
            cur = new
            cur_days = 1 if new else 0
        state[i] = cur
        days_in[i] = cur_days
    return state, days_in


STATE_NAMES = {0: "green", 1: "yellow", 2: "red"}
