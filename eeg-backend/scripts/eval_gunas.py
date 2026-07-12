"""
Diagnose the Guna label produced for each Chitta Bhumi's paper-derived profile.
Classically:  Mudha→Tamas, Kshipta→Rajas, Vikshipta→Rajas, Ekagra→Sattva,
              Niruddha→Sattva.
"""
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from eval_classifier import STATE_PROFILES, CHITTA_BHUMIS, BANDS, gen  # noqa: E402
from neuro_yogic.satva_classifier import classify_gunas, describe_gunas  # noqa: E402

EXPECTED = {"Mudha": "tamas", "Kshipta": "rajas", "Vikshipta": "rajas",
            "Ekagra": "sattva", "Niruddha": "sattva"}


def swara_key(faa):
    if faa < -0.15:
        return "ida"
    if faa > 0.15:
        return "pingala"
    return "sushumna"


def main(n=400, seed=7):
    """Per-epoch PREDOMINANT guna distribution per state (band-driven, no coupling)."""
    rng = np.random.default_rng(seed)
    print(f"{'state':<12}{'classical':<10}{'sattva':>8}{'rajas':>8}{'tamas':>8}{'sama':>8}"
          f"   session-mean S/R/T")
    for state in CHITTA_BHUMIS:
        dist = defaultdict(int)
        means = np.zeros(3)
        for info in gen(state, n, rng):
            g = classify_gunas(info["band_relative"], faa=info["faa"], plv=info["plv"],
                               chitta_bhumi=state, swara=swara_key(info["faa"]))
            means += np.array([g["sattva"], g["rajas"], g["tamas"]])
            dom = describe_gunas(g)["dominant"]
            dist[dom if dom else "sama"] += 1
        means /= n
        print(f"{state:<12}{EXPECTED[state]:<10}"
              f"{dist.get('sattva',0):>8}{dist.get('rajas',0):>8}"
              f"{dist.get('tamas',0):>8}{dist.get('sama',0):>8}"
              f"   {means[0]:.2f}/{means[1]:.2f}/{means[2]:.2f}")


if __name__ == "__main__":
    main()
