"""
Offline evaluation harness for the continuous contemplative-depth score
(Phase 3b) — reproduces the design of "Decoding Depth of Meditation"
(PMC11629179): predict a continuous depth label and report MAE vs a
mean-predicting chance baseline, Pearson r, and binary (deep/shallow) AUC.

Ground truth here is SYNTHETIC — a canonical per-bhūmi depth — so this validates
the *harness*, not the mappings. Once real experience-sampling probes exist
(Phase 4a), swap CANONICAL_DEPTH for the collected 1–5 ratings and re-fit the
feature weights (the linear-fit block below is exactly that path).

numpy-only (no pandas/sklearn dependency).
"""
import os
import sys

import numpy as np

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))
sys.path.insert(0, _HERE)

from eval_classifier import CHITTA_BHUMIS, gen  # noqa: E402
from neuro_yogic.vedantic_logic import vedantic_analyze  # noqa: E402
from neuro_yogic.yoga_classifier import _rule_classify  # noqa: E402

# Synthetic ground-truth depth per bhūmi (0..1). Replace with real probe ratings.
CANONICAL_DEPTH = {
    "Mudha": 0.10, "Kshipta": 0.25, "Vikshipta": 0.50, "Ekagra": 0.80, "Niruddha": 0.95,
}

# Feature vector used for the label-fitting demo.
FEATS = ["alpha", "theta", "gamma", "low_beta", "high_beta", "delta"]


def _auc(scores, labels):
    """Rank-based AUC = P(score(pos) > score(neg)); ties count 0.5."""
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    if not pos or not neg:
        return float("nan")
    wins = sum((1.0 if p > n else 0.5 if p == n else 0.0) for p in pos for n in neg)
    return wins / (len(pos) * len(neg))


def main(n=400, seed=7):
    rng = np.random.default_rng(seed)
    preds, trues, X = [], [], []
    for state in CHITTA_BHUMIS:
        for info in gen(state, n, rng):
            chitta, _ = _rule_classify(info)
            reading = vedantic_analyze(info, chitta_bhumi=chitta)
            preds.append(reading.contemplative_depth_score)
            trues.append(CANONICAL_DEPTH[state])
            br = info["band_relative"]
            X.append([br[f] for f in FEATS] + [info["plv"], 1.0 - reading.vritti_index])

    preds, trues = np.array(preds), np.array(trues)
    X = np.array(X)

    # ── Model-as-shipped: the provisional depth_score vs synthetic ground truth ──
    mae = float(np.mean(np.abs(preds - trues)))
    chance = float(np.mean(np.abs(trues - trues.mean())))
    r = float(np.corrcoef(preds, trues)[0, 1])
    labels = (trues >= 0.5).astype(int)
    auc = _auc(list(preds), list(labels))

    print("── Continuous depth score (Phase 3b) vs synthetic ground truth ──")
    print(f"  n epochs            : {len(preds)}")
    print(f"  MAE (shipped score) : {mae:.3f}")
    print(f"  MAE (chance = mean) : {chance:.3f}   (score is useful iff MAE < chance)")
    print(f"  Pearson r           : {r:.3f}")
    print(f"  binary AUC (deep≥.5): {auc:.3f}")

    # ── Label-fitting path: least-squares fit features → depth (replaces the
    #    hand-set weights once real probe labels are available) ──
    Xb = np.hstack([X, np.ones((len(X), 1))])
    w, *_ = np.linalg.lstsq(Xb, trues, rcond=None)
    fit = Xb @ w
    print("\n── Linear feature-fit (in-sample; the Phase-4b weight-learning path) ──")
    print(f"  MAE (fitted)        : {float(np.mean(np.abs(fit - trues))):.3f}")
    print(f"  fitted weights      : " +
          ", ".join(f"{f}={c:+.2f}" for f, c in zip(FEATS + ['plv', '1-vritti'], w[:-1])))


if __name__ == "__main__":
    main()
