"""
connectivity.py
===============
Non-linear functional connectivity — the reference oracle for the C# port in
``src/NeuroYogic.SignalProcessing/Dsp/Connectivity.cs``.

Weighted Symbolic Mutual Information (wSMI, King et al. 2013)
------------------------------------------------------------
Each channel is transformed into a sequence of ordinal patterns (order k, delay
tau — the same Bandt-Pompe symbolisation used by permutation entropy). For each
channel pair we compute the mutual information between their symbol streams,
*weighting out* symbol pairs that are identical or mirror-images. Those trivial
couplings mostly reflect a common source / volume conduction, so discounting
them leaves genuine non-linear interaction — which distinguished deep absorption
where ordinary phase synchrony (PLV/WPLI) failed.

    wSMI(a,b) = (1/log k!) · Σ w(i,j)·p(i,j)·log[ p(i,j) / (p(i)·p(j)) ]
    w(i,j) = 0 if symbol i == j  or  i == reverse(j),  else 1

Reported as the mean wSMI over all channel pairs (broadband, on the
band-pass+notch signal).
"""
from math import log

import numpy as np


def wsmi(filtered, order: int = 3, delay: int = 1) -> float:
    """Mean weighted symbolic mutual information over all channel pairs."""
    filtered = np.atleast_2d(np.asarray(filtered, dtype=np.float64))
    n_ch = filtered.shape[0]
    syms = [_symbolize(filtered[c], order, delay) for c in range(n_ch)]
    denom = log(_factorial(order))
    vals = []
    for i in range(n_ch):
        for j in range(i + 1, n_ch):
            vals.append(_wsmi_pair(syms[i], syms[j], denom))
    return float(np.mean(vals)) if vals else 0.0


def connectivity_features(filtered) -> dict:
    """Non-linear connectivity summary for one epoch."""
    return {"wsmi": float(wsmi(filtered))}


# ── internals (kept identical to the C# port) ────────────────────────────────

def _symbolize(x, order, delay):
    """Sequence of ordinal-pattern symbols as (code, mirror_code) tuples."""
    n = len(x)
    span = delay * (order - 1)
    out = []
    for i in range(n - span):
        window = [x[i + t * delay] for t in range(order)]
        perm = _argsort_stable(window)
        code = _encode(perm, order)
        mirror = _encode(tuple(reversed(perm)), order)
        out.append((code, mirror))
    return out


def _wsmi_pair(sa, sb, denom):
    t = len(sa)
    if t == 0 or denom <= 0.0:
        return 0.0
    joint: dict = {}
    ca: dict = {}
    cb: dict = {}
    for k in range(t):
        a = sa[k]      # (code, mirror)
        b = sb[k]
        key = (a[0], b[0])
        joint[key] = joint.get(key, 0) + 1
        ca[a[0]] = ca.get(a[0], 0) + 1
        cb[b[0]] = cb.get(b[0], 0) + 1
    # mirror lookup: symbol code -> its mirror code
    mirror_of = {}
    for a in sa:
        mirror_of[a[0]] = a[1]
    for b in sb:
        mirror_of[b[0]] = b[1]

    smi = 0.0
    for (a_code, b_code), cnt in joint.items():
        if a_code == b_code or a_code == mirror_of[b_code]:
            continue
        pab = cnt / t
        pa = ca[a_code] / t
        pb = cb[b_code] / t
        smi += pab * log(pab / (pa * pb))
    return smi / denom


def _argsort_stable(window):
    return tuple(idx for idx, _ in sorted(enumerate(window), key=lambda p: (p[1], p[0])))


def _encode(perm, order):
    code = 0
    mul = 1
    for t in range(order):
        code += perm[t] * mul
        mul *= order
    return code


def _factorial(k):
    f = 1
    for i in range(2, k + 1):
        f *= i
    return f
