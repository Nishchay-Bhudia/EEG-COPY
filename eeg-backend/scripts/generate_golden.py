"""
Generate golden reference values from the Python FeatureExtractor so the C#
port can be validated against the ground-truth DSP pipeline.

Emits tests/NeuroYogic.SignalProcessing.Tests/golden.json with, for each fixture:
  - the raw EEG signal (channels x samples)
  - the sample rate
  - the extracted info dict (band_relative, faa, plv, alpha_left/right, ...)
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from neuro_yogic.feature_extractor import FeatureExtractor  # noqa: E402


def make_signal(seed, sr, n_samp, channel_specs):
    """channel_specs: list of list of (freq, amplitude). Adds mild noise."""
    rng = np.random.default_rng(seed)
    t = np.arange(n_samp) / sr
    channels = []
    for comps in channel_specs:
        sig = np.zeros(n_samp)
        for freq, amp in comps:
            phase = rng.uniform(0, 2 * np.pi)
            sig += amp * np.sin(2 * np.pi * freq * t + phase)
        sig += rng.normal(0, 2.0, n_samp)  # µV noise
        channels.append(sig)
    return np.array(channels)


FIXTURES = {
    # Relaxed / alpha-dominant (Sattva / Vikshipta tendency)
    "alpha_dominant": dict(
        seed=1, sr=256, n_samp=512,
        specs=[
            [(10, 30), (6, 12), (2, 8)],
            [(10, 28), (6, 10), (2, 8)],
            [(10, 29), (6, 11), (2, 8)],
            [(10, 31), (6, 12), (2, 8)],
        ],
    ),
    # High-beta / scattered (Rajas / Kshipta tendency)
    "high_beta": dict(
        seed=2, sr=256, n_samp=512,
        specs=[
            [(24, 30), (10, 6), (2, 5)],
            [(24, 32), (10, 5), (2, 5)],
            [(23, 28), (10, 6), (2, 5)],
            [(25, 31), (10, 5), (2, 5)],
        ],
    ),
    # Delta-dominant (Tamas / Mudha tendency)
    "delta_dominant": dict(
        seed=3, sr=256, n_samp=512,
        specs=[
            [(2, 40), (5, 10), (10, 3)],
            [(2, 42), (5, 9), (10, 3)],
            [(2, 39), (5, 10), (10, 3)],
            [(2, 41), (5, 9), (10, 3)],
        ],
    ),
    # Gamma + coherent (Niruddha tendency), lower sample count / rate
    "gamma_coherent": dict(
        seed=4, sr=256, n_samp=768,
        specs=[
            [(40, 22), (10, 20), (6, 10)],
            [(40, 22), (10, 20), (6, 10)],
            [(40, 22), (10, 20), (6, 10)],
            [(40, 22), (10, 20), (6, 10)],
        ],
    ),
    # Blink-contaminated (large EOG deflections on ch0 → artifact_flagged)
    "blink_artifact": dict(
        seed=6, sr=256, n_samp=512, spikes=[60, 180, 300, 420],
        specs=[
            [(10, 20), (6, 6)],
            [(10, 20), (6, 6)],
            [(10, 20), (6, 6)],
            [(10, 20), (6, 6)],
        ],
    ),
    # Lateralised (asymmetric alpha → non-zero FAA)
    "lateralised": dict(
        seed=5, sr=256, n_samp=512,
        specs=[
            [(10, 12), (6, 8)],   # left weak alpha
            [(10, 12), (6, 8)],
            [(10, 34), (6, 8)],   # right strong alpha
            [(10, 34), (6, 8)],
        ],
    ),
}


def main():
    out = []
    for name, cfg in FIXTURES.items():
        raw = make_signal(cfg["seed"], cfg["sr"], cfg["n_samp"], cfg["specs"])
        # Inject smooth blink-like deflections on ch0 for artifact fixtures.
        for pos in cfg.get("spikes", []):
            for k in range(-7, 8):
                idx = pos + k
                if 0 <= idx < cfg["n_samp"]:
                    raw[0][idx] += 400.0 * np.exp(-((k / 4.0) ** 2))
        ext = FeatureExtractor(sample_rate=cfg["sr"])
        _, info = ext.extract(raw, {"sample_rate": cfg["sr"], "is_padded": False})
        out.append({
            "name": name,
            "sample_rate": cfg["sr"],
            "eeg": [list(map(float, ch)) for ch in raw],
            "expected": {
                "band_relative": {k: float(v) for k, v in info["band_relative"].items()},
                "alpha_left": float(info["alpha_left"]),
                "alpha_right": float(info["alpha_right"]),
                "faa": float(info["faa"]),
                "plv": float(info["plv"]),
                "complexity": {k: float(v) for k, v in info["complexity"].items()},
                "aperiodic": {k: float(v) for k, v in info["aperiodic"].items()},
                "connectivity": {k: float(v) for k, v in info["connectivity"].items()},
                "iaf": float(info["iaf"]),
                "artifact_flagged": bool(info["artifact_flagged"]),
                "signal_quality": float(info["signal_quality"]),
            },
        })

    dest = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tests", "NeuroYogic.SignalProcessing.Tests", "golden.json",
    )
    with open(dest, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(out)} fixtures -> {dest}")
    # Print a summary for eyeballing
    for item in out:
        br = item["expected"]["band_relative"]
        cx = item["expected"]["complexity"]
        print(f"  {item['name']:16s} alpha={br['alpha']:.3f} high_beta={br['high_beta']:.3f} "
              f"delta={br['delta']:.3f} gamma={br['gamma']:.3f} faa={item['expected']['faa']:+.3f} "
              f"plv={item['expected']['plv']:.3f}")
        ap = item["expected"]["aperiodic"]
        cn = item["expected"]["connectivity"]
        print(f"  {'':16s} lziv={cx['lziv']:.3f} higuchi={cx['higuchi_fd']:.3f} "
              f"sampen={cx['sample_entropy']:.3f} permen={cx['perm_entropy']:.3f} "
              f"| ap_exp={ap['exponent']:+.3f} ap_off={ap['offset']:+.3f} wsmi={cn['wsmi']:.4f}")


if __name__ == "__main__":
    main()
