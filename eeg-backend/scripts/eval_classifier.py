"""
Evaluate the Chitta Bhumi classifier against the paper-derived state profiles
(mirrored from data_generator.py). Prints a confusion matrix and per-state
recall so we can tune weights until all five states trigger correctly.

numpy-only (no pandas dependency).
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neuro_yogic.yoga_classifier import _rule_classify  # noqa: E402

CHITTA_BHUMIS = ["Mudha", "Kshipta", "Vikshipta", "Ekagra", "Niruddha"]

# (mean, std) per band + faa/plv — copied from data_generator._STATE_PROFILES
STATE_PROFILES = {
    "Mudha": {"delta": (0.45, 0.06), "theta": (0.18, 0.04), "alpha": (0.07, 0.03),
              "low_beta": (0.16, 0.04), "high_beta": (0.10, 0.03), "gamma": (0.04, 0.02),
              "faa": (0.05, 0.15), "plv": (0.30, 0.08)},
    "Kshipta": {"delta": (0.10, 0.04), "theta": (0.12, 0.04), "alpha": (0.12, 0.04),
                "low_beta": (0.22, 0.05), "high_beta": (0.34, 0.07), "gamma": (0.10, 0.03),
                "faa": (0.25, 0.15), "plv": (0.30, 0.08)},
    # Vikshipta is bimodal (oscillating): absorption bursts + high-beta desync.
    "Vikshipta": {"_modes": [
        (0.45, {"delta": (0.14, 0.03), "theta": (0.15, 0.04), "alpha": (0.27, 0.04),
                "low_beta": (0.16, 0.04), "high_beta": (0.11, 0.03), "gamma": (0.08, 0.02),
                "faa": (0.00, 0.10), "plv": (0.58, 0.08)}),
        (0.55, {"delta": (0.15, 0.03), "theta": (0.14, 0.04), "alpha": (0.19, 0.04),
                "low_beta": (0.20, 0.04), "high_beta": (0.21, 0.03), "gamma": (0.11, 0.03),
                "faa": (0.18, 0.10), "plv": (0.42, 0.08)}),
    ]},
    "Ekagra": {"delta": (0.07, 0.03), "theta": (0.30, 0.05), "alpha": (0.38, 0.06),
               "low_beta": (0.12, 0.04), "high_beta": (0.07, 0.03), "gamma": (0.06, 0.02),
               "faa": (0.00, 0.08), "plv": (0.72, 0.08)},
    "Niruddha": {"delta": (0.05, 0.02), "theta": (0.18, 0.04), "alpha": (0.30, 0.05),
                 "low_beta": (0.10, 0.03), "high_beta": (0.05, 0.02), "gamma": (0.32, 0.06),
                 "faa": (0.00, 0.05), "plv": (0.88, 0.06)},
}

BANDS = ["delta", "theta", "alpha", "low_beta", "high_beta", "gamma"]


def _gen_flat(p, n, rng):
    cols = {b: np.clip(rng.normal(*p[b], n), 0.01, 0.99) for b in BANDS}
    faa = np.clip(rng.normal(*p["faa"], n), -2.0, 2.0)
    plv = np.clip(rng.normal(*p["plv"], n), 0.0, 1.0)
    totals = sum(cols[b] for b in BANDS)
    for b in BANDS:
        cols[b] = cols[b] / totals
    rows = []
    for i in range(n):
        band_rel = {b: float(cols[b][i]) for b in BANDS}
        band_rel["beta"] = band_rel["low_beta"] + band_rel["high_beta"]
        rows.append({"band_relative": band_rel, "faa": float(faa[i]), "plv": float(plv[i])})
    return rows


def gen(state, n, rng):
    p = STATE_PROFILES[state]
    if "_modes" not in p:
        return _gen_flat(p, n, rng)
    rows = []
    counts = [int(round(w * n)) for w, _ in p["_modes"]]
    counts[-1] = n - sum(counts[:-1])
    for (_, sub), c in zip(p["_modes"], counts):
        rows.extend(_gen_flat(sub, c, rng))
    return rows


def main(n=400, seed=42):
    rng = np.random.default_rng(seed)
    confusion = defaultdict(lambda: defaultdict(int))
    for state in CHITTA_BHUMIS:
        for info in gen(state, n, rng):
            pred, _ = _rule_classify(info)
            confusion[state][pred] += 1

    order = CHITTA_BHUMIS
    print(f"\n{'true \\ pred':<12}" + "".join(f"{p:>10}" for p in order) + f"{'recall':>10}")
    total_correct = total = 0
    for t in order:
        row = confusion[t]
        correct = row.get(t, 0)
        n_t = sum(row.values())
        total_correct += correct
        total += n_t
        print(f"{t:<12}" + "".join(f"{row.get(p,0):>10}" for p in order) +
              f"{correct / max(n_t,1):>10.2f}")
    print(f"\noverall accuracy: {total_correct/max(total,1):.3f}")
    ever = {p for t in order for p, c in confusion[t].items() if c > 0}
    print("states that EVER win:  ", sorted(ever, key=order.index))
    print("states that NEVER win: ", [s for s in order if s not in ever])


if __name__ == "__main__":
    main()
