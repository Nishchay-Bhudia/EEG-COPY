"""
Prototype + evaluate tuned Chitta Bhumi scoring against the paper-derived state
profiles. Iterate here (fast) before committing weights to yoga_classifier.py
and YogaClassifier.cs.
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from eval_classifier import STATE_PROFILES, CHITTA_BHUMIS, BANDS, gen  # noqa: E402


def relu(x):
    return max(0.0, x)


def classify(info):
    br = info["band_relative"]
    delta = br.get("delta", 0.15)
    theta = br.get("theta", 0.18)
    alpha = br.get("alpha", 0.28)
    gamma = br.get("gamma", 0.08)
    high_beta = br.get("high_beta", 0.13)
    low_beta = br.get("low_beta", 0.18)
    beta_total = high_beta + low_beta
    faa = info.get("faa", 0.0)
    plv = info.get("plv", 0.5)

    s = {}

    # MUDHA — delta dominant, absent alpha/gamma, low coherence
    s["Mudha"] = (
        6.0 * relu(delta - 0.28)
        + 2.5 * relu(0.12 - alpha)
        + 2.0 * relu(0.07 - gamma)
        + 1.5 * relu(0.45 - plv)
    )

    # KSHIPTA — high beta dominant, suppressed alpha, scattered (low plv), +FAA
    s["Kshipta"] = (
        6.0 * relu(high_beta - 0.18)
        + 2.5 * relu(0.15 - alpha)
        + 1.5 * relu(faa)
        + 1.0 * relu(0.40 - plv)
        + 0.8 * relu(beta_total - 0.30)
    )

    # EKAGRA — high Fm-theta AND high alpha, suppressed high-beta, coherent
    s["Ekagra"] = (
        4.0 * relu(theta - 0.20)
        + 4.0 * relu(alpha - 0.28)
        + 2.0 * relu(0.12 - high_beta)
        + 1.5 * relu(plv - 0.55)
        - 5.0 * relu(gamma - 0.15)  # gamma surge belongs to Niruddha
    )

    # NIRUDDHA — gamma surge AND very high interhemispheric coherence
    s["Niruddha"] = (
        6.0 * relu(gamma - 0.15)
        + 4.0 * relu(plv - 0.70)
        + 2.0 * relu(0.10 - high_beta)
        + 1.0 * relu(0.10 - delta)
    )

    # VIKSHIPTA — moderate/oscillating fallback: mid-range alpha, nothing extreme
    alpha_mid = relu(1.0 - abs(alpha - 0.24) / 0.10)
    s["Vikshipta"] = (
        0.40
        + 1.5 * alpha_mid
        + 0.6 * relu(low_beta - 0.12)
        - 2.0 * relu(gamma - 0.15)      # not a peak state
        - 2.0 * relu(high_beta - 0.25)  # not scattered
        - 2.0 * relu(delta - 0.30)      # not dull
    )

    for k in s:
        s[k] = max(0.0, s[k])
    total = sum(s.values()) or 1e-10
    probs = {k: round(v / total, 4) for k, v in s.items()}
    order = ["Niruddha", "Ekagra", "Vikshipta", "Kshipta", "Mudha"]
    winner = order[0]
    for st in order:
        if s[st] > s[winner]:
            winner = st
    return winner, probs


def main(n=400, seed=42):
    rng = np.random.default_rng(seed)
    confusion = defaultdict(lambda: defaultdict(int))
    for state in CHITTA_BHUMIS:
        for info in gen(state, n, rng):
            pred, _ = classify(info)
            confusion[state][pred] += 1

    order = CHITTA_BHUMIS
    print(f"\n{'true \\ pred':<12}" + "".join(f"{p:>10}" for p in order) + f"{'recall':>10}")
    tc = tt = 0
    for t in order:
        row = confusion[t]
        c = row.get(t, 0)
        n_t = sum(row.values())
        tc += c
        tt += n_t
        print(f"{t:<12}" + "".join(f"{row.get(p,0):>10}" for p in order) + f"{c/max(n_t,1):>10.2f}")
    print(f"\noverall accuracy: {tc/max(tt,1):.3f}")


if __name__ == "__main__":
    main()
