"""Static cardiovascular risk from the EHR stream.

Implements the Framingham General Cardiovascular Risk Profile (D'Agostino et al.,
Circulation 2008, lipid-based equation). It is used here as the static-risk input to the
twin and as a transparent anchor on the dashboard. Framingham is known to under-estimate
risk in South Asians; the WHO 2019 South-East Asia Region charts are the planned
replacement once the chart coefficients are integrated (see docs/MODEL_CARD.md).
"""

from __future__ import annotations

import math

_COEF = {
    "M": {"ln_age": 3.06117, "ln_tc": 1.12370, "ln_hdl": -0.93263, "ln_sbp_untreated": 1.93303,
          "ln_sbp_treated": 1.99881, "smoker": 0.65451, "diabetes": 0.57367, "s0": 0.88936, "mean": 23.9802},
    "F": {"ln_age": 2.32888, "ln_tc": 1.20904, "ln_hdl": -0.70833, "ln_sbp_untreated": 2.76157,
          "ln_sbp_treated": 2.82263, "smoker": 0.52873, "diabetes": 0.69154, "s0": 0.95012, "mean": 26.1931},
}


def framingham_10y_risk(age: float, sex: str, tc: float, hdl: float, sbp: float,
                        treated: bool, smoker: bool, diabetes: bool) -> float:
    """10-year general CVD risk in percent. ``sex`` is "M" or "F"."""
    c = _COEF["F" if sex.upper().startswith("F") else "M"]
    age = float(min(max(age, 30), 74))
    s = (c["ln_age"] * math.log(age)
         + c["ln_tc"] * math.log(max(tc, 100))
         + c["ln_hdl"] * math.log(max(hdl, 20))
         + (c["ln_sbp_treated"] if treated else c["ln_sbp_untreated"]) * math.log(max(sbp, 90))
         + c["smoker"] * (1 if smoker else 0)
         + c["diabetes"] * (1 if diabetes else 0))
    risk = 1 - c["s0"] ** math.exp(s - c["mean"])
    return round(100 * risk, 1)


def risk_label(pct: float) -> str:
    if pct < 10:
        return "low"
    if pct < 20:
        return "intermediate"
    return "high"
