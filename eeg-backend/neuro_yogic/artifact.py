"""
artifact.py
===========
Artifact / blink screening — the reference oracle for the C# port in
``src/NeuroYogic.SignalProcessing/Dsp/ArtifactRejection.cs``.

Muse's four electrodes are all frontal (TP9/AF7/AF8/TP10) — the worst location
for eye-blink/EOG contamination — and the pipeline otherwise only band-passes and
notches. A single blink can dominate FAA and the band powers the whole
classification rides on. We screen the RAW signal per channel with a robust,
scale-invariant rule: a sample is "bad" if it exceeds ROBUST_Z robust-sigma
(median ± MAD) from the channel median; a channel is flagged when >BAD_FRAC of
its samples are bad. signal_quality = 1 − mean bad-fraction across channels.
"""
import numpy as np

ROBUST_Z = 6.0        # robust-sigma threshold (median ± MAD) for a bad sample
BAD_FRAC_FLAG = 0.02  # channel flagged when >2% of samples are bad
_MAD_SCALE = 1.4826   # MAD → std for a normal distribution


def artifact_screen(raw) -> dict:
    """Screen raw multi-channel EEG for artifacts.

    Returns {artifact_flagged: bool, signal_quality: float in [0,1]}.
    """
    raw = np.atleast_2d(np.asarray(raw, dtype=np.float64))
    n_ch, n = raw.shape
    if n == 0:
        return {"artifact_flagged": False, "signal_quality": 1.0}

    fracs = []
    any_bad = False
    for ch in raw:
        med = float(np.median(ch))
        dev = np.abs(ch - med)
        mad = float(np.median(dev))
        scale = _MAD_SCALE * mad
        if scale <= 0.0:
            fracs.append(0.0)
            continue
        frac = float(np.sum(dev / scale > ROBUST_Z)) / n
        fracs.append(frac)
        if frac > BAD_FRAC_FLAG:
            any_bad = True

    quality = float(max(0.0, 1.0 - float(np.mean(fracs))))
    return {"artifact_flagged": bool(any_bad), "signal_quality": quality}
