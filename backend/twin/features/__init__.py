"""Feature engineering. Everything here is leakage-safe by construction: every rolling
statistic for day ``t`` uses rows with date ``<= t`` (baselines use ``< t``), and the test
suite replays the builder on truncated histories to prove it."""
