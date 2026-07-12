"""
aperiodic.py
============
Aperiodic (1/f) spectral decomposition — the reference oracle for the C# port in
``src/NeuroYogic.SignalProcessing/Dsp/Aperiodic.cs``.

Motivation
----------
A neural power spectrum is the sum of rhythmic *oscillatory* peaks (alpha, beta,
…) riding on a *non-oscillatory* 1/f background. That background is not noise:
its steepness (the aperiodic **exponent**) tracks excitation/inhibition balance
and arousal, and it shifts in deep meditative absorption in ways band-ratios
conflate away. We parameterise it FOOOF-style:

    log10(PSD) ≈ offset − exponent · log10(f)

A single robust least-squares line over 2–40 Hz gives (exponent, offset). This
is the simple single-pass estimate; a peak-masked refit can follow if needed.
Computed per channel then averaged, matching the band-power convention.
"""
import numpy as np


def aperiodic_fit(freqs, psd, lo: float = 2.0, hi: float = 40.0) -> dict:
    """Fit the 1/f background over [lo, hi] Hz.

    Parameters
    ----------
    freqs : ndarray (n_freq,)
    psd   : ndarray (n_channels, n_freq) or (n_freq,)
    lo,hi : fit band in Hz (inclusive)

    Returns
    -------
    dict with keys: exponent (= −slope of the log-log line), offset (intercept).
    """
    freqs = np.asarray(freqs, dtype=np.float64)
    psd = np.atleast_2d(np.asarray(psd, dtype=np.float64))
    mask = (freqs >= lo) & (freqs <= hi) & (freqs > 0.0)
    f = freqs[mask]
    if f.size < 2:
        return {"exponent": 0.0, "offset": 0.0}

    logf = np.log10(f)
    exps, offs = [], []
    for ch in psd:
        logp = np.log10(np.maximum(ch[mask], 1e-20))
        slope, intercept = _lin_fit(logf, logp)
        exps.append(-slope)      # aperiodic exponent = negative log-log slope
        offs.append(intercept)
    return {"exponent": float(np.mean(exps)), "offset": float(np.mean(offs))}


def _lin_fit(xs, ys):
    """Ordinary-least-squares slope & intercept (kept identical to the C# port)."""
    n = len(xs)
    mx = float(np.sum(xs)) / n
    my = float(np.sum(ys)) / n
    num = 0.0
    den = 0.0
    for i in range(n):
        dx = xs[i] - mx
        num += dx * (ys[i] - my)
        den += dx * dx
    slope = num / den if den != 0.0 else 0.0
    intercept = my - slope * mx
    return slope, intercept
