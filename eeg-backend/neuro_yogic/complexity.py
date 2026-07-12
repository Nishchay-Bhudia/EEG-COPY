"""
complexity.py
=============
Non-linear complexity / entropy features for EEG epochs — the reference oracle
for the C# port in ``src/NeuroYogic.SignalProcessing/Dsp/Complexity.cs``.

Motivation
----------
The deepest contemplative states (Ekagra / Niruddha) are distinguished by
*non-oscillatory* dynamics that band-power and phase measures capture poorly.
These four measures index that structure directly:

  lziv          : Lempel-Ziv complexity (LZ76, normalised) — regularity of the
                  median-binarised signal.
  higuchi_fd    : Higuchi fractal dimension — self-similarity / roughness.
  sample_entropy: Sample entropy (m=2, r=0.2·std) — unpredictability.
  perm_entropy  : Permutation entropy (order=3) — ordinal-pattern diversity.

Each is computed per channel then averaged across channels, matching the
band-power convention in feature_extractor.py. Implementations are deliberately
hand-rolled in pure numpy (no antropy dependency) so the algorithm is
transparent and portable bit-for-behaviour to C#.
"""
from math import log, log2

import numpy as np


def lempel_ziv(x: np.ndarray) -> float:
    """Normalised Lempel-Ziv complexity (LZ76) of the median-binarised signal.

    Returns c(n) · log2(n) / n, where c(n) is the LZ76 substring count.
    """
    n = len(x)
    if n < 2:
        return 0.0
    med = float(np.median(x))
    s = [1 if v > med else 0 for v in x]

    # LZ76 substring-counting (Kaspar & Schuster).
    i, c, l, k, k_max = 0, 1, 1, 1, 1
    while True:
        if s[i + k - 1] == s[l + k - 1]:
            k += 1
            if l + k > n:
                c += 1
                break
        else:
            if k > k_max:
                k_max = k
            i += 1
            if i == l:
                c += 1
                l += k_max
                if l + 1 > n:
                    break
                i = 0
                k = 1
                k_max = 1
            else:
                k = 1
    return float(c * log2(n) / n)


def higuchi_fd(x: np.ndarray, kmax: int = 10) -> float:
    """Higuchi fractal dimension via the log-log slope of curve length L(k)."""
    n = len(x)
    if n < 4:
        return 0.0
    kmax = min(kmax, n // 2)
    lnk = []
    lnl = []
    for k in range(1, kmax + 1):
        lm = []
        for m in range(k):
            n_m = (n - m - 1) // k
            if n_m <= 0:
                continue
            acc = 0.0
            for i in range(1, n_m + 1):
                acc += abs(x[m + i * k] - x[m + (i - 1) * k])
            norm = (n - 1) / (n_m * k)
            lm.append((acc * norm) / k)
        if lm:
            lnl.append(log(float(np.mean(lm))))
            lnk.append(log(1.0 / k))
    if len(lnk) < 2:
        return 0.0
    # Least-squares slope of lnl vs lnk.
    return float(_slope(lnk, lnl))


def sample_entropy(x: np.ndarray, m: int = 2, r_coef: float = 0.2) -> float:
    """Sample entropy SampEn(m, r) with r = r_coef · std(x) (population std)."""
    n = len(x)
    if n < m + 2:
        return 0.0
    r = r_coef * float(np.std(x))
    if r <= 0.0:
        return 0.0

    def count(mm: int) -> int:
        # N - m templates for both m and m+1 (aligned convention).
        count_n = n - m
        c = 0
        for i in range(count_n):
            for j in range(i + 1, count_n):
                # Chebyshev distance over the mm-length template.
                d = 0.0
                for t in range(mm):
                    diff = abs(x[i + t] - x[j + t])
                    if diff > d:
                        d = diff
                if d <= r:
                    c += 1
        return c

    b = count(m)
    a = count(m + 1)
    if a == 0 or b == 0:
        return 0.0
    return float(-log(a / b))


def perm_entropy(x: np.ndarray, order: int = 3, delay: int = 1) -> float:
    """Normalised permutation entropy of ordinal patterns (Bandt-Pompe)."""
    n = len(x)
    span = delay * (order - 1)
    if n - span <= 1:
        return 0.0
    counts: dict = {}
    for i in range(n - span):
        window = [x[i + t * delay] for t in range(order)]
        pattern = tuple(_argsort_stable(window))
        counts[pattern] = counts.get(pattern, 0) + 1
    total = sum(counts.values())
    pe = 0.0
    for c in counts.values():
        p = c / total
        pe -= p * log2(p)
    denom = log2(_factorial(order))
    return float(pe / denom) if denom > 0 else 0.0


def complexity_features(filtered: np.ndarray) -> dict:
    """Per-channel complexity measures averaged across channels.

    Parameters
    ----------
    filtered : ndarray (n_channels, n_samples) — the band-pass+notch signal.

    Returns
    -------
    dict with keys: lziv, higuchi_fd, sample_entropy, perm_entropy.
    """
    filtered = np.atleast_2d(filtered)
    lz, hf, se, pe = [], [], [], []
    for ch in filtered:
        ch = np.asarray(ch, dtype=np.float64)
        lz.append(lempel_ziv(ch))
        hf.append(higuchi_fd(ch))
        se.append(sample_entropy(ch))
        pe.append(perm_entropy(ch))
    return {
        "lziv": float(np.mean(lz)),
        "higuchi_fd": float(np.mean(hf)),
        "sample_entropy": float(np.mean(se)),
        "perm_entropy": float(np.mean(pe)),
    }


# ── small helpers (kept identical to the C# port) ────────────────────────────

def _slope(xs, ys) -> float:
    nx = len(xs)
    mx = sum(xs) / nx
    my = sum(ys) / nx
    num = 0.0
    den = 0.0
    for i in range(nx):
        dx = xs[i] - mx
        num += dx * (ys[i] - my)
        den += dx * dx
    return num / den if den != 0.0 else 0.0


def _argsort_stable(window):
    # Stable argsort by (value, index) — matches numpy argsort(kind='stable').
    return [idx for idx, _ in sorted(enumerate(window), key=lambda p: (p[1], p[0]))]


def _factorial(k: int) -> int:
    f = 1
    for i in range(2, k + 1):
        f *= i
    return f
