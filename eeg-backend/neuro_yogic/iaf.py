"""
iaf.py
======
Individual Alpha Frequency — the reference oracle for the C# port in
``src/NeuroYogic.SignalProcessing/Dsp/Iaf.cs``.

The alpha peak sits at different frequencies for different people (~8–12 Hz), and
the multi-session literature found that *generalised* bands measurably hurt
classification — individual band-centering helps. We estimate the IAF as the
spectral centre-of-gravity of power in 7–13 Hz (more stable than a raw argmax),
per channel then averaged. Phase 1 computes the scalar only; per-user band
re-centering is deferred to Phase 4c.
"""
import numpy as np


def individual_alpha_freq(freqs, psd, lo: float = 7.0, hi: float = 13.0) -> float:
    """Alpha centre-of-gravity (Hz) over [lo, hi], averaged across channels.

    Returns 0.0 if there is no alpha-band power.
    """
    freqs = np.asarray(freqs, dtype=np.float64)
    psd = np.atleast_2d(np.asarray(psd, dtype=np.float64))
    mask = (freqs >= lo) & (freqs <= hi)
    f = freqs[mask]
    if f.size == 0:
        return 0.0

    peaks = []
    for ch in psd:
        p = ch[mask]
        denom = float(np.sum(p))
        if denom <= 0.0:
            continue
        peaks.append(float(np.sum(f * p) / denom))
    return float(np.mean(peaks)) if peaks else 0.0
