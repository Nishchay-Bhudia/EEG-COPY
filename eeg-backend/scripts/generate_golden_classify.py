"""
Golden values for the classification + vedantic layers, exercising the same
logic as the /analyze/bands endpoint (band powers in -> full analysis out).
Writes tests/NeuroYogic.Analysis.Tests/golden_classify.json.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neuro_yogic.yoga_classifier import YogaClassifier  # noqa: E402
from neuro_yogic.vedantic_logic import corroborate, vedantic_analyze  # noqa: E402

clf = YogaClassifier()

# Each case: raw band inputs to /analyze/bands (delta,theta,alpha,beta,gamma) plus optionals
CASES = [
    dict(name="ekagra_like",   delta=0.06, theta=0.30, alpha=0.34, beta=0.16, gamma=0.06,
         high_beta=0.07, low_beta=0.09, faa=0.02, plv=0.72),
    dict(name="kshipta_like",  delta=0.08, theta=0.10, alpha=0.10, beta=0.55, gamma=0.09,
         high_beta=0.34, low_beta=0.21, faa=0.30, plv=0.30),
    dict(name="mudha_like",    delta=0.50, theta=0.18, alpha=0.07, beta=0.20, gamma=0.04,
         high_beta=0.09, low_beta=0.11, faa=0.05, plv=0.30),
    dict(name="niruddha_like", delta=0.05, theta=0.15, alpha=0.28, beta=0.14, gamma=0.32,
         high_beta=0.05, low_beta=0.09, faa=0.01, plv=0.90),
    dict(name="vikshipta_like", delta=0.14, theta=0.17, alpha=0.24, beta=0.34, gamma=0.08,
         high_beta=0.14, low_beta=0.20, faa=0.06, plv=0.50),
    dict(name="ida_lateral",   delta=0.12, theta=0.16, alpha=0.30, beta=0.30, gamma=0.07,
         high_beta=0.12, low_beta=0.18, faa=-0.45, plv=0.55),
    dict(name="pingala_lateral", delta=0.10, theta=0.14, alpha=0.20, beta=0.40, gamma=0.09,
         high_beta=0.22, low_beta=0.18, faa=0.55, plv=0.40),
]


def build_info(c):
    delta, theta, alpha = c["delta"], c["theta"], c["alpha"]
    beta, gamma = c["beta"], c["gamma"]
    high_beta = c.get("high_beta", beta * 0.45)
    low_beta = c.get("low_beta", beta * 0.55)
    alpha_left = c.get("alpha_left", alpha / 2)
    alpha_right = c.get("alpha_right", alpha / 2)
    faa = c.get("faa", float(np.log(max(alpha_right, 1e-12)) - np.log(max(alpha_left, 1e-12))))
    plv = c.get("plv", 0.50)

    total = delta + theta + alpha + high_beta + low_beta + gamma or 1e-10
    band_rel = {
        "delta": delta / total, "theta": theta / total, "alpha": alpha / total,
        "low_beta": low_beta / total, "high_beta": high_beta / total,
        "gamma": gamma / total, "beta": (low_beta + high_beta) / total,
    }
    return {
        "band_relative": band_rel,
        "alpha_left": alpha_left, "alpha_right": alpha_right,
        "alpha_asymmetry": alpha_right - alpha_left,
        "faa": float(np.clip(faa, -2.0, 2.0)),
        "plv": float(np.clip(plv, 0.0, 1.0)),
        "gamma_spike": band_rel["gamma"] > 0.12,
        "is_padded": False,
    }


def main():
    out = []
    for c in CASES:
        info = build_info(c)
        chitta, probs = clf.classify_from_info(info)
        reading = vedantic_analyze(info, chitta_bhumi=chitta)
        d = reading.to_dict()
        corr = corroborate(info, chitta, probs)
        out.append({
            "name": c["name"],
            "input": {k: c[k] for k in ("delta", "theta", "alpha", "beta", "gamma",
                                        "high_beta", "low_beta", "faa", "plv") if k in c},
            "expected": {
                "chitta": chitta,
                "probs": probs,
                "margin": (lambda v: float(v[0] - v[1]) if len(v) >= 2 else float(v[0]))(
                    sorted(probs.values(), reverse=True)),
                "indeterminate": bool(
                    (lambda v: (v[0] - v[1]) if len(v) >= 2 else v[0])(
                        sorted(probs.values(), reverse=True)) < 0.10),
                "swara": d["swara"]["state"],
                "depth": d["contemplative_depth"],
                "vritti_index": d["vritti_index"],
                "nirodha_state": d["nirodha_state"],
                "classical_guna": d["classical_guna"],
                "contemplative_depth_score": d["contemplative_depth_score"],
                "gunas": {
                    "sattva": d["gunas"]["sattva"],
                    "rajas": d["gunas"]["rajas"],
                    "tamas": d["gunas"]["tamas"],
                    "label": d["gunas"]["label"],
                },
                "tattva_count": len(d["tattva_flags"]),
                "corroboration": {
                    "concord": corr["concord"],
                    "indeterminate": corr["indeterminate"],
                    "caveat": corr["caveat"],
                    "axes": [
                        {"axis": a["axis"], "agrees": a["agrees"], "reading": a["reading"]}
                        for a in corr["axes"]
                    ],
                },
            },
        })

    dest = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tests", "NeuroYogic.Analysis.Tests", "golden_classify.json",
    )
    with open(dest, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(out)} cases -> {dest}")
    for o in out:
        e = o["expected"]
        print(f"  {o['name']:16s} chitta={e['chitta']:10s} swara={e['swara'][:12]:12s} "
              f"S/R/T={e['gunas']['sattva']:.2f}/{e['gunas']['rajas']:.2f}/{e['gunas']['tamas']:.2f} "
              f"vritti={e['vritti_index']:.2f} [{e['nirodha_state']}] "
              f"({e['gunas']['label']})")


if __name__ == "__main__":
    main()
