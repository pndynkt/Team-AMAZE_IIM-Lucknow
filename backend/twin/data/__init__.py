"""Synthetic data generation and loaders.

The competition's sandbox rules require anonymised, open-source or synthetic data only.
This package generates both streams the brief asks for:

- ``ehr``        a Synthea-shaped static/historical record per patient (FHIR R4 bundle + flat row)
- ``wearables``  a dynamic daily stream (overnight RHR, HRV, sleep, steps, SpO2, respiratory rate,
                 home blood pressure) with labelled strain episodes, infection-like confounders,
                 lifestyle noise and missing nights
- ``synthea``    a loader that maps real Synthea CSV output onto the same flat schema
"""
