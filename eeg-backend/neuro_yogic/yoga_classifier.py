"""
yoga_classifier.py  (v2 — rule-based, paper-aligned)
======================================================
Classifies each EEG epoch into the five Chitta Bhumis of Patanjali's
Yoga Sutras, using rule-based fuzzy scoring derived directly from the paper:

"Electroencephalographic Mapping of Yogic Physiology"

Why rule-based instead of Random Forest?
─────────────────────────────────────────
1. The paper provides EXACT EEG thresholds for each state. Synthetic training
   data can never capture the true distribution of real Muse S signals.
2. Rule-based is transparent: if the classification is wrong, you can see
   exactly which rule to adjust.
3. No startup training latency — the backend responds instantly.
4. Adds MUDHA (the 5th Chitta Bhumi) which was missing from v1.

The five Chitta Bhumis (progression from lowest to highest):
─────────────────────────────────────────────────────────────
Mudha    — Dull/Torpid.   Tamas-dominant.  Waking delta surge, absent alpha/gamma.
Kshipta  — Scattered.     Rajas-dominant.  High beta (18-30 Hz), suppressed alpha.
Vikshipta— Oscillating.   Sattva-emerging. Moderate alpha alternating with beta.
Ekagra   — One-Pointed.   Pure Sattva.     Sustained Fm-θ + high alpha synchrony.
Niruddha — Mastered.      Gunatita.        Global gamma coherence (PLV > 0.80).

Scoring logic:
──────────────
Each state receives a fuzzy score based on EEG feature thresholds from the
paper. Scores are normalised to probabilities. The highest-scoring state wins.
"""

import os
import numpy as np
from typing import Tuple

# ── Class definitions ─────────────────────────────────────────────────────────
CHITTA_BHUMIS = ["Mudha", "Kshipta", "Vikshipta", "Ekagra", "Niruddha"]

DEFAULT_MODEL_PATH  = os.path.join(os.path.dirname(__file__), "..", "models", "yoga_rf.joblib")
DEFAULT_LABELS_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "yoga_labels.npy")
FEATURE_COLUMNS     = [
    "delta", "theta", "alpha", "low_beta", "high_beta", "gamma",
    "alpha_left", "alpha_right", "faa", "plv",
]


# ── Core rule-based classifier ────────────────────────────────────────────────

def _rule_classify(info: dict) -> Tuple[str, dict]:
    """
    Paper-derived fuzzy rule classifier.

    Takes the full `info` dict from FeatureExtractor (or a compatible dict
    from the /analyze/bands endpoint) and returns (label, probability_dict).
    """
    br = info.get("band_relative", {})

    delta    = float(br.get("delta",     0.15))
    theta    = float(br.get("theta",     0.18))
    alpha    = float(br.get("alpha",     0.28))
    gamma    = float(br.get("gamma",     0.08))
    high_beta= float(br.get("high_beta", 0.13))
    low_beta = float(br.get("low_beta",  0.18))

    # Combine into total beta for any legacy callers
    beta_total = high_beta + low_beta

    faa = float(info.get("faa", 0.0))
    plv = float(info.get("plv", 0.50))

    scores = {}

    # Tuning note (v3): weights were calibrated against the paper-derived state
    # profiles in data_generator.py so that ALL FIVE states trigger with high
    # recall (per-state recall ≥ 0.94, ~0.98 overall). The previous weights gave
    # Vikshipta an unconditional baseline that swamped every other state (~26%
    # overall accuracy, Niruddha never won). See scripts/eval_classifier.py.

    # ── NIRUDDHA (Mastered) ────────────────────────────────────────────────
    # Paper: "high-amplitude, globally coherent Gamma (30-100 Hz) with massive
    #         bilateral interhemispheric phase coherence."
    # Defining conjunction: gamma surge (>0.15) AND very high PLV (>0.70).
    scores["Niruddha"] = (
        max(0.0, (gamma     - 0.15) * 6.0) +      # gamma > 0.15 = paper threshold
        max(0.0, (plv       - 0.70) * 4.0) +      # very high interhemispheric coherence
        max(0.0, (0.10 - high_beta) * 2.0) +      # mental silence (suppressed high beta)
        max(0.0, (0.10 - delta)     * 1.0)        # slow bands drop to idling
    )

    # ── EKAGRA (One-Pointed) ───────────────────────────────────────────────
    # Paper: "sustained Frontal Midline Theta (Fm-θ) coupled with massive,
    #         synchronized global Alpha. Beta and Delta suppressed to minimum."
    # Defining conjunction: high theta AND high alpha, without a gamma surge.
    scores["Ekagra"] = (
        max(0.0, (theta     - 0.20) * 4.0) +      # Fm-θ elevated
        max(0.0, (alpha     - 0.28) * 4.0) +      # high synchronized alpha
        max(0.0, (0.12 - high_beta) * 2.0) +      # suppressed high beta
        max(0.0, (plv       - 0.55) * 1.5) -      # coherent (but not gamma-coherent)
        max(0.0, (gamma     - 0.15) * 5.0)        # a gamma surge is Niruddha, not Ekagra
    )

    # ── KSHIPTA (Scattered) ────────────────────────────────────────────────
    # Paper: "persistent, desynchronized High Beta (18-30 Hz) across both frontal
    #         sensors. Alpha significantly diminished."
    # Primary marker: high_beta dominance with suppressed alpha and low coherence.
    scores["Kshipta"] = (
        max(0.0, (high_beta  - 0.18) * 6.0) +     # high beta = primary Rajas signal
        max(0.0, (0.15 - alpha)      * 2.5) +     # suppressed alpha
        max(0.0, faa * 1.5) +                     # positive FAA (left PFC arousal)
        max(0.0, (0.40 - plv)        * 1.0) +     # low coherence (scattered)
        max(0.0, (beta_total - 0.30) * 0.8)       # total beta elevated
    )

    # ── MUDHA (Dull/Torpid) ────────────────────────────────────────────────
    # Paper: "pathological dominance of slow Delta waves with complete absence
    #         of Alpha or Gamma."
    # Primary marker: delta dominance with absent alpha/gamma and low coherence.
    scores["Mudha"] = (
        max(0.0, (delta     - 0.28) * 6.0) +      # waking delta dominance
        max(0.0, (0.12 - alpha)     * 2.5) +      # absent alpha
        max(0.0, (0.07 - gamma)     * 2.0) +      # absent gamma
        max(0.0, (0.45 - plv)       * 1.5)        # disorganized (low PLV)
    )

    # ── VIKSHIPTA (Oscillating) ────────────────────────────────────────────
    # Paper: "rapid, unstable oscillations between bands." The transitional /
    # fallback state: moderate mid-range alpha and NOTHING extreme. The negative
    # terms actively cede ground to the four distinct states when their markers
    # appear, so Vikshipta wins only in the genuinely moderate middle.
    alpha_mid = max(0.0, 1.0 - abs(alpha - 0.24) / 0.10)   # peaks at alpha≈0.24
    scores["Vikshipta"] = (
        0.40 +                                     # modest fallback baseline
        1.5 * alpha_mid +                          # mid-range alpha
        max(0.0, (low_beta - 0.12) * 0.6) -        # some SMR/mid-beta activity
        max(0.0, (gamma    - 0.15) * 2.0) -        # not a peak (Niruddha) state
        max(0.0, (high_beta - 0.25) * 2.0) -       # not scattered (Kshipta)
        max(0.0, (delta    - 0.30) * 2.0)          # not dull (Mudha)
    )

    # Clamp any negative scores to zero before normalising.
    for _k in scores:
        scores[_k] = max(0.0, scores[_k])

    # ── Normalise to probabilities ─────────────────────────────────────────
    total = sum(scores.values()) or 1e-10
    probs = {k: round(v / total, 4) for k, v in scores.items()}

    # Winner
    label = max(scores, key=scores.get)
    return label, probs


# ── Public classifier class (API-compatible with v1) ─────────────────────────

class YogaClassifier:
    """
    Rule-based Chitta Bhumi classifier.

    Keeps the same public API as v1 (predict, predict_proba, save, load,
    train_model) so main.py requires minimal changes. The classify_from_info
    method is the recommended interface — it uses the full info dict.
    """

    def __init__(self, n_estimators: int = 200, random_state: int = 42) -> None:
        # Rule-based: always "trained"
        self._is_trained = True

    # ── Recommended interface ──────────────────────────────────────────────────
    def classify_from_info(self, info: dict) -> Tuple[str, dict]:
        """
        Classify using the full info dict from FeatureExtractor.
        This is the primary interface — no feature array gymnastics required.

        Returns (chitta_bhumi_label, probability_dict).
        """
        return _rule_classify(info)

    # ── Legacy interface (backward-compatible with main.py v1) ───────────────
    def predict(self, features: np.ndarray) -> str:
        """Accept a 10-D (or 8-D legacy) feature vector. Returns label."""
        info = _features_to_info(features)
        return _rule_classify(info)[0]

    def predict_proba(self, features: np.ndarray) -> dict:
        """Return {label: probability} dict for a feature vector."""
        info = _features_to_info(features)
        _, probs = _rule_classify(info)
        return probs

    # ── Training / persistence stubs (no-op for rule-based) ──────────────────
    def train_model(self, csv_path: str) -> dict:
        """No-op: rule-based classifier doesn't train. Returns mock metrics."""
        return {
            "accuracy": 1.0,
            "method":   "rule-based (paper-derived thresholds)",
            "classes":  CHITTA_BHUMIS,
            "note":     "No training required. Classification uses paper-derived fuzzy rules.",
        }

    def save(self, model_path: str = DEFAULT_MODEL_PATH,
             labels_path: str = DEFAULT_LABELS_PATH) -> None:
        """No-op: nothing to save."""
        pass

    def load(self, model_path: str = DEFAULT_MODEL_PATH,
             labels_path: str = DEFAULT_LABELS_PATH) -> None:
        """No-op: nothing to load."""
        pass

    def is_trained(self) -> bool:
        return True


def _features_to_info(features: np.ndarray) -> dict:
    """
    Convert a raw feature array to an info dict for _rule_classify.
    Handles both 10-D (new) and 8-D (legacy) feature vectors.
    """
    f = list(features)
    if len(f) >= 10:
        # New 10-D: [delta, theta, alpha, low_beta, high_beta, gamma, al, ar, faa, plv]
        return {
            "band_relative": {
                "delta":     float(f[0]),
                "theta":     float(f[1]),
                "alpha":     float(f[2]),
                "low_beta":  float(f[3]),
                "high_beta": float(f[4]),
                "gamma":     float(f[5]),
            },
            "faa": float(f[8]),
            "plv": float(f[9]),
        }
    else:
        # Legacy 8-D: [delta, theta, alpha, beta, gamma, al_rel, ar_rel, asym]
        beta = float(f[3]) if len(f) > 3 else 0.0
        return {
            "band_relative": {
                "delta":     float(f[0]) if len(f) > 0 else 0.15,
                "theta":     float(f[1]) if len(f) > 1 else 0.18,
                "alpha":     float(f[2]) if len(f) > 2 else 0.28,
                "low_beta":  beta * 0.55,
                "high_beta": beta * 0.45,
                "gamma":     float(f[4]) if len(f) > 4 else 0.08,
            },
            "faa": 0.0,
            "plv": 0.50,
        }
