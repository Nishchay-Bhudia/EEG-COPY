"""
data_generator.py  (v2 — paper-aligned, 5 Chitta Bhumis)
=========================================================
Generates a synthetic EEG feature dataset based on the paper:
"Electroencephalographic Mapping of Yogic Physiology"

Changes from v1:
  • Adds MUDHA as the 5th Chitta Bhumi (was missing)
  • Splits beta into low_beta (13-18 Hz) and high_beta (18-30 Hz) — the
    critical distinction that fixes "always Rajas" classification
  • Adds FAA and PLV features
  • Band power distributions grounded in paper's exact specifications:
    - Kshipta:  high_beta > 0.20, alpha < 0.15
    - Mudha:    delta > 0.40,     alpha < 0.10, gamma < 0.05
    - Vikshipta: moderate alpha (0.18-0.28), moderate beta
    - Ekagra:   theta > 0.25,    alpha > 0.30, high_beta < 0.10
    - Niruddha: gamma > 0.15,    PLV > 0.80,   minimal high_beta/delta
"""

import os

import numpy as np
import pandas as pd

CHITTA_BHUMIS = ["Mudha", "Kshipta", "Vikshipta", "Ekagra", "Niruddha"]

FEATURE_COLUMNS = [
    "delta", "theta", "alpha", "low_beta", "high_beta", "gamma",
    "alpha_left", "alpha_right", "faa", "plv",
]

DEFAULT_MODEL_PATH  = os.path.join(os.path.dirname(__file__), "..", "models", "yoga_rf.joblib")
DEFAULT_LABELS_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "yoga_labels.npy")
DEFAULT_CSV_PATH    = "mock_eeg_data.csv"


# ── State profiles (mean, std) for each Chitta Bhumi ─────────────────────────
# Based on the paper's exact EEG signatures for each state.
# All 5 main bands must sum to ~1.0 per row (normalised in generation).
# FAA: ln(alpha_right) - ln(alpha_left). PLV: 0-1 coherence.

_STATE_PROFILES = {
    # ── Mudha (Dull, Torpid — Tamas dominant) ─────────────────────────────
    # Paper: "waking EEG reveals pathological dominance of slow Delta (0.5-4 Hz)
    #         and sluggish, low-frequency Theta (4-6 Hz). Complete absence of
    #         Alpha or Gamma rhythms."
    "Mudha": {
        "delta":     (0.45, 0.06),   # HIGH delta = Tamas primary marker
        "theta":     (0.18, 0.04),   # Some slow theta
        "alpha":     (0.07, 0.03),   # Very low alpha
        "low_beta":  (0.16, 0.04),
        "high_beta": (0.10, 0.03),   # Minimal high beta
        "gamma":     (0.04, 0.02),   # Very low gamma
        "faa":       (0.05, 0.15),   # Variable FAA
        "plv":       (0.30, 0.08),   # Low PLV (disorganized)
    },

    # ── Kshipta (Scattered — Rajas dominant) ──────────────────────────────
    # Paper: "persistent, high-amplitude, desynchronized High Beta (18-30 Hz)
    #         across both frontal sensors. Alpha-band power significantly
    #         diminished. Hyper-active amygdala, reduced PFC control."
    "Kshipta": {
        "delta":     (0.10, 0.04),
        "theta":     (0.12, 0.04),
        "alpha":     (0.12, 0.04),   # Suppressed alpha = Rajasic marker
        "low_beta":  (0.22, 0.05),
        "high_beta": (0.34, 0.07),   # HIGH beta = primary Rajas signal
        "gamma":     (0.10, 0.03),
        "faa":       (0.25, 0.15),   # Positive FAA (left PFC activation)
        "plv":       (0.30, 0.08),   # Low PLV (scattered)
    },

    # ── Vikshipta (Oscillating — Sattva emerging) ──────────────────────────
    # Paper: "rapid, unstable oscillations between Alpha synchronization and
    #         High Beta desynchronization. Competition between DMN and CEN."
    # Realistic model: NOT a single moderate distribution (that reads as a
    # static, Sattva-leaning state and blurs into Ekagra). Vikshipta genuinely
    # OSCILLATES, so it is bimodal — the mind alternates between brief absorbed
    # alpha bursts (Sāttvic) and more frequent high-beta wandering (Rājasic).
    # Per epoch the guna varies; the SESSION MEAN leans Rajas, matching the
    # classical "Rajas-predominant, Sattva-emerging". The desync high-beta stays
    # below Kshipta's persistent-desync threshold so single epochs still read as
    # Vikshipta (the distinction from Kshipta is the alternation, not one epoch).
    "Vikshipta": {
        # Mode params tuned (scripts/tune_vikshipta.py) to keep single-epoch
        # classification inside the Vikshipta basin (recall ≈ 0.89) while still
        # oscillating: ~1/3 of epochs read Rājasic, ~2/3 Sāttvic.
        "_modes": [
            # Absorption burst (DMN / alpha synchronization) — Sāttvic
            (0.45, {
                "delta":     (0.14, 0.03),
                "theta":     (0.15, 0.04),
                "alpha":     (0.27, 0.04),   # alpha synchronization (kept in basin)
                "low_beta":  (0.16, 0.04),
                "high_beta": (0.11, 0.03),   # low — mind briefly settled
                "gamma":     (0.08, 0.02),
                "faa":       (0.00, 0.10),   # balanced (Sushumna-ish)
                "plv":       (0.58, 0.08),   # coherent during the burst
            }),
            # Desynchronization (CEN / mind-wandering) — Rājasic, Pingala lean
            (0.55, {
                "delta":     (0.15, 0.03),
                "theta":     (0.14, 0.04),
                "alpha":     (0.19, 0.04),   # alpha suppressed by desync
                "low_beta":  (0.20, 0.04),
                "high_beta": (0.21, 0.03),   # elevated — but < Kshipta (0.34)
                "gamma":     (0.11, 0.03),
                "faa":       (0.18, 0.10),   # positive → left-PFC / Pingala / Rajas
                "plv":       (0.42, 0.08),   # scattered coherence
            }),
        ],
    },

    # ── Ekagra (One-Pointed — Pure Sattva) ────────────────────────────────
    # Paper: "sustained, exceptionally high-amplitude Frontal Midline Theta
    #         (Fm-θ, 4-8 Hz) coupled with massive, synchronized, global
    #         Alpha (8-12 Hz). Beta and Delta suppressed to minimum."
    "Ekagra": {
        "delta":     (0.07, 0.03),   # Suppressed delta
        "theta":     (0.30, 0.05),   # HIGH theta = Fm-θ primary signal
        "alpha":     (0.38, 0.06),   # HIGH alpha synchrony
        "low_beta":  (0.12, 0.04),   # Suppressed
        "high_beta": (0.07, 0.03),   # Very low high beta
        "gamma":     (0.06, 0.02),
        "faa":       (0.00, 0.08),   # Balanced FAA (Sushumna)
        "plv":       (0.72, 0.08),   # High PLV (coherent)
    },

    # ── Niruddha (Mastered — Gunatita/Beyond Gunas) ────────────────────────
    # Paper: "high-amplitude, highly synchronized Gamma (30-100 Hz) displaying
    #         massive bilateral, interhemispheric phase coherence. Documented in
    #         Olympic meditators (Tibetan Buddhist monks, Kriya Yoga adepts)."
    "Niruddha": {
        "delta":     (0.05, 0.02),   # Minimal delta
        "theta":     (0.18, 0.04),
        "alpha":     (0.30, 0.05),   # Sustained alpha
        "low_beta":  (0.10, 0.03),   # Minimal low beta
        "high_beta": (0.05, 0.02),   # Minimal high beta (mental silence)
        "gamma":     (0.32, 0.06),   # HIGH gamma = primary Niruddha signal
        "faa":       (0.00, 0.05),   # Perfectly balanced FAA
        "plv":       (0.88, 0.06),   # Very high PLV (global coherence)
    },
}


def _sample_flat(profile: dict, n: int) -> list:
    """Generate `n` normalised feature rows from a single-mode (mean, std) profile."""
    def samp(key):
        m, s = profile[key]
        return np.clip(np.random.normal(m, s, n), 0.01, 0.99)

    delta, theta, alpha = samp("delta"), samp("theta"), samp("alpha")
    low_beta, high_beta, gamma = samp("low_beta"), samp("high_beta"), samp("gamma")
    faa = np.clip(np.random.normal(*profile["faa"], n), -2.0, 2.0)
    plv = np.clip(np.random.normal(*profile["plv"], n), 0.0, 1.0)

    totals = delta + theta + alpha + low_beta + high_beta + gamma
    delta, theta, alpha = delta / totals, theta / totals, alpha / totals
    low_beta, high_beta, gamma = low_beta / totals, high_beta / totals, gamma / totals

    # Hemispheric alpha consistent with FAA = ln(alpha_right) − ln(alpha_left)
    alpha_half_mean = 1e-5
    alpha_left = alpha_half_mean * np.exp(-faa / 2)
    alpha_right = alpha_half_mean * np.exp(faa / 2)

    return [{
        "delta": round(float(delta[i]), 6), "theta": round(float(theta[i]), 6),
        "alpha": round(float(alpha[i]), 6), "low_beta": round(float(low_beta[i]), 6),
        "high_beta": round(float(high_beta[i]), 6), "gamma": round(float(gamma[i]), 6),
        "alpha_left": round(float(alpha_left[i]), 6), "alpha_right": round(float(alpha_right[i]), 6),
        "faa": round(float(faa[i]), 6), "plv": round(float(plv[i]), 6),
    } for i in range(n)]


def _sample_profile(profile: dict, n: int) -> list:
    """
    Generate `n` rows for a state. Multi-mode profiles (with a `_modes` list of
    (weight, sub-profile)) draw each epoch from one of their oscillation modes —
    e.g. Vikshipta alternating between absorption and desynchronization.
    """
    if "_modes" not in profile:
        return _sample_flat(profile, n)
    rows = []
    modes = profile["_modes"]
    counts = [int(round(w * n)) for w, _ in modes]
    counts[-1] = n - sum(counts[:-1])   # make the counts sum exactly to n
    for (_, sub), c in zip(modes, counts):
        rows.extend(_sample_flat(sub, c))
    return rows


def generate_dataset(n_samples_per_class: int = 600, random_seed: int = 42) -> pd.DataFrame:
    """
    Generate a synthetic EEG feature dataset with 10 features and 5 class labels.
    Band powers are normalised so they sum to 1.0 per row.
    """
    np.random.seed(random_seed)
    rows = []
    for state, profile in _STATE_PROFILES.items():
        for row in _sample_profile(profile, n_samples_per_class):
            row["label"] = state
            rows.append(row)

    df = pd.DataFrame(rows)
    return df.sample(frac=1, random_state=random_seed).reset_index(drop=True)


def save_dataset(
    path: str = DEFAULT_CSV_PATH,
    n_samples_per_class: int = 600,
) -> str:
    """Generate and save the dataset to a CSV file. Returns the path."""
    df = generate_dataset(n_samples_per_class=n_samples_per_class)
    df.to_csv(path, index=False)
    print(f"[DataGenerator] Saved {len(df)} rows ({len(_STATE_PROFILES)} classes) -> '{path}'")
    return path
