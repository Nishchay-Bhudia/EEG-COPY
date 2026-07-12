"""
Sweep the bimodal Vikshipta parameters: keep per-epoch oscillation and a
Rajas-leaning session trend WHILE keeping classification recall high (epochs
must still read as Vikshipta, not leak into Kshipta/Ekagra).
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from eval_classifier import _gen_flat  # noqa: E402
from neuro_yogic.satva_classifier import classify_gunas, describe_gunas  # noqa: E402
from neuro_yogic.yoga_classifier import _rule_classify  # noqa: E402


def swara_key(faa):
    return "ida" if faa < -0.15 else "pingala" if faa > 0.15 else "sushumna"


def evaluate(absorption, desync, w_desync, n=1600, seed=3):
    rng = np.random.default_rng(seed)
    n_d = int(round(w_desync * n))
    rows = _gen_flat(absorption, n - n_d, rng) + _gen_flat(desync, n_d, rng)
    recall = 0
    dist = defaultdict(int)
    means = np.zeros(3)
    for r in rows:
        pred, _ = _rule_classify(r)
        if pred == "Vikshipta":
            recall += 1
        g = classify_gunas(r["band_relative"], faa=r["faa"], plv=r["plv"],
                            swara=swara_key(r["faa"]))
        means += [g["sattva"], g["rajas"], g["tamas"]]
        dist[describe_gunas(g)["dominant"] or "sama"] += 1
    means /= len(rows)
    return recall / len(rows), means, dist


def absorb(alpha, plv=0.55):
    return {"delta": (0.14, 0.03), "theta": (0.15, 0.04), "alpha": (alpha, 0.04),
            "low_beta": (0.16, 0.04), "high_beta": (0.11, 0.03), "gamma": (0.08, 0.02),
            "faa": (0.00, 0.10), "plv": (plv, 0.08)}


def desync(alpha, high_beta, faa):
    return {"delta": (0.15, 0.03), "theta": (0.13, 0.04), "alpha": (alpha, 0.04),
            "low_beta": (0.20, 0.04), "high_beta": (high_beta, 0.03), "gamma": (0.11, 0.03),
            "faa": (faa, 0.10), "plv": (0.40, 0.08)}


# Goal: at w_desync = 0.70, session trend Rajas-PREDOMINANT with recall >= ~0.85.
W = 0.70
print(f"w_desync={W}")
print(f"{'absorb_a':>9}{'des_a':>7}{'des_hb':>7}{'des_faa':>8}{'recall':>8}   S/R/T          trend")
for a_alpha in (0.24, 0.25, 0.26):
    for d_alpha, d_hb, d_faa in [(0.17, 0.22, 0.22), (0.16, 0.23, 0.24), (0.16, 0.22, 0.24)]:
        rec, m, _ = evaluate(absorb(a_alpha), desync(d_alpha, d_hb, d_faa), W)
        d = describe_gunas({"sattva": m[0], "rajas": m[1], "tamas": m[2]})
        flag = "  <-- rajas-pred" if d["dominant"] == "rajas" else ""
        print(f"{a_alpha:>9.2f}{d_alpha:>7.2f}{d_hb:>7.2f}{d_faa:>8.2f}{rec:>8.2f}   "
              f"{m[0]:.2f}/{m[1]:.2f}/{m[2]:.2f}   {d['label']}{flag}")
