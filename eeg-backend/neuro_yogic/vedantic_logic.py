"""
vedantic_logic.py  (v2 — paper-aligned)
========================================
Maps EEG features to three classical Yogic frameworks:

SWARA (Nadi) CLASSIFICATION — paper thresholds
  Ida Nadi      (lunar / left):   FAA < −0.15  (paper: "negative FAA score
                                   indicating left-sided alpha accumulation
                                   and relative right prefrontal activation")
  Pingala Nadi  (solar / right):  FAA > +0.15  (paper: "positive FAA score
                                   indicating relative left-sided frontal
                                   cortical activation")
  Sushumna Nadi (central):        |FAA| ≤ 0.15 (paper: "Frontal Alpha
                                   Asymmetry balances toward zero ≈ 0")

TATTVA / CHAKRA CORRELATES
  - Gamma surge (>12% relative)       → Ajna/Sahasrara activation (Spanda)
  - High Theta + low High-Beta        → Pratyahara Window (Ekagra approach)
  - Delta surge (>35%) + low Alpha    → Tamasic heaviness (Mudha approach)
  - High PLV (>0.80) + low High-Beta  → Sushumna activation / Niruddha

TRIGUNAS
  Derived from band powers + FAA + PLV + Chitta Bhumi via satva_classifier.py

CHITTA BHUMI DEPTH MAPPING (v2 — 5 states)
  Mudha     → "Deep Inertia"  (lowest — Tamas dominant)
  Kshipta   → "Surface"       (scattered — Rajas dominant)
  Vikshipta → "Emerging"      (oscillating — Sattva rising)
  Ekagra    → "Deep"          (one-pointed — pure Sattva)
  Niruddha  → "Profound"      (mastered — beyond gunas)
"""

from dataclasses import dataclass, field
from typing import List, Optional

from neuro_yogic.satva_classifier import classify_gunas, describe_gunas, gunas_note

# ── FAA Nadi thresholds (from paper) ─────────────────────────────────────────
# Paper: Ida FAA < −0.15, Pingala FAA > +0.15, Sushumna |FAA| ≤ 0.15
FAA_IDA_THRESHOLD      = -0.15   # Right prefrontal > Left prefrontal
FAA_PINGALA_THRESHOLD  =  0.15   # Left prefrontal  > Right prefrontal
# Old raw-difference threshold (kept for fallback)
_LEGACY_ASYM_THRESHOLD =  0.10

# Tattva thresholds (from paper)
GAMMA_THRESHOLD  = 0.12   # >12% relative = significant gamma surge
THETA_PRATYAHARA = 0.25   # >25% theta + low high-beta = Pratyahara window
HIGH_BETA_LOW    = 0.10   # <10% high-beta = suppressed stress bands
DELTA_SURGE      = 0.35   # >35% delta in waking = Tamasic heaviness
PLV_COHERENCE    = 0.80   # >80% PLV = Sushumna/Niruddha coherence


@dataclass
class VedanticReading:
    swara:               str       = "Sushumna (Balanced)"
    swara_confidence:    str       = "Low"
    swara_note:          str       = ""
    tattva_flags:        List[str] = field(default_factory=list)
    contemplative_depth: str       = "Surface"
    gunas:               dict           = field(default_factory=lambda: {"sattva": 0.334, "rajas": 0.333, "tamas": 0.333})
    guna_label:          str            = "Balanced (all three)"
    guna_note:           str            = ""
    guna_dominant:       Optional[str]  = None
    guna_secondary:      Optional[str]  = None
    vritti_index:        float          = 0.0
    nirodha_state:       str            = "Settling"
    classical_guna:      str            = "Rajas"
    contemplative_depth_score: float    = 0.0

    def to_dict(self) -> dict:
        return {
            "swara": {
                "state":      self.swara,
                "confidence": self.swara_confidence,
                "note":       self.swara_note,
            },
            "tattva_flags":        self.tattva_flags,
            "contemplative_depth": self.contemplative_depth,
            "vritti_index":        self.vritti_index,
            "nirodha_state":       self.nirodha_state,
            "classical_guna":      self.classical_guna,
            "contemplative_depth_score": self.contemplative_depth_score,
            "gunas": {
                "sattva":    self.gunas.get("sattva", 0.0),
                "rajas":     self.gunas.get("rajas",  0.0),
                "tamas":     self.gunas.get("tamas",  0.0),
                "label":     self.guna_label,
                "dominant":  self.guna_dominant,
                "secondary": self.guna_secondary,
                "note":      self.guna_note,
            },
        }


# ── Swara / Nadi classification ───────────────────────────────────────────────

def _classify_swara(
    alpha_left: float,
    alpha_right: float,
    faa: Optional[float] = None,
) -> tuple:
    """
    Determine Swara (Nadi) from Frontal Alpha Asymmetry.

    Uses the standard ln-ratio FAA when available (from feature extractor).
    Falls back to raw (alpha_right - alpha_left) / mean for legacy callers.

    Paper thresholds:
      Ida      → FAA < −0.15  (right prefrontal activation)
      Pingala  → FAA > +0.15  (left prefrontal activation)
      Sushumna → |FAA| ≤ 0.15 (balanced / both nostrils)
    """
    # Prefer the pre-computed ln-ratio FAA (more accurate)
    if faa is not None:
        score = float(faa)
    else:
        # Legacy fallback: raw asymmetry ratio
        mean_alpha = (alpha_left + alpha_right) / 2.0
        if mean_alpha < 1e-12:
            return "Sushumna (Balanced)", "Low", "Insufficient Alpha power to determine Swara."
        score = (alpha_right - alpha_left) / mean_alpha

    mag = abs(score)

    if score < FAA_IDA_THRESHOLD:
        # Left-sided Alpha accumulation → Right hemisphere activation → Ida
        conf = "High" if mag > 0.40 else "Moderate" if mag > 0.20 else "Low"
        return (
            "Ida (Parasympathetic / Lunar)",
            conf,
            f"Frontal Alpha Asymmetry = {score:+.2f} (threshold < {FAA_IDA_THRESHOLD}). "
            "Right-hemisphere activation detected. Ida nadi: parasympathetic dominance — "
            "receptive, creative, and introspective. Ideal for Yoga Nidra, Yin practice, "
            "deep contemplation, and emotional processing.",
        )
    elif score > FAA_PINGALA_THRESHOLD:
        # Right-sided Alpha accumulation → Left hemisphere activation → Pingala
        conf = "High" if mag > 0.40 else "Moderate" if mag > 0.20 else "Low"
        return (
            "Pingala (Sympathetic / Solar)",
            conf,
            f"Frontal Alpha Asymmetry = {score:+.2f} (threshold > +{FAA_PINGALA_THRESHOLD}). "
            "Left-hemisphere activation detected. Pingala nadi: sympathetic dominance — "
            "analytical, goal-directed, and action-oriented. Ideal for Pranayama, "
            "dynamic Asana, cognitive work, and verbal/logical tasks.",
        )
    else:
        # Balanced → Sushumna
        conf = "High" if mag < 0.05 else "Moderate"
        return (
            "Sushumna (Balanced / Central)",
            conf,
            f"Frontal Alpha Asymmetry = {score:+.2f} — near equilibrium. "
            "Both hemispheres balanced. Sushumna nadi: autonomic coherence — "
            "ideal state for deep meditation, Samadhi approach, and unified awareness. "
            "The gateway to higher contemplative states.",
        )


# ── Tattva / Chakra flag detection ───────────────────────────────────────────

def _detect_tattva_flags(
    band_rel: dict,
    alpha_left: float,
    alpha_right: float,
    faa: float = 0.0,
    plv: float = 0.5,
) -> List[str]:
    """
    Detect significant yogic state indicators from EEG features.
    Returns a list of human-readable flag strings.
    """
    flags   = []
    gamma   = band_rel.get("gamma",     0.0)
    theta   = band_rel.get("theta",     0.0)
    delta   = band_rel.get("delta",     0.0)
    alpha   = band_rel.get("alpha",     0.0)
    high_beta = band_rel.get("high_beta", band_rel.get("beta", 0.0) * 0.45)

    # Gamma surge → Ajna/Sahasrara activation
    if gamma > GAMMA_THRESHOLD:
        flags.append(f"Gamma Surge ({gamma*100:.0f}%) — Ajna/Sahasrara activation: "
                     f"multi-sensory binding, peak insight, Spanda (divine pulse)")

    # Pratyahara window
    if theta > THETA_PRATYAHARA and high_beta < HIGH_BETA_LOW:
        flags.append(f"Pratyahara Window — Fm-θ ({theta*100:.0f}%) with suppressed "
                     f"high-beta ({high_beta*100:.0f}%): sensory withdrawal, "
                     f"approach to Ekagra")

    # Turiya approach — Delta surge with retained consciousness markers
    if delta > DELTA_SURGE and alpha > 0.15:
        flags.append(f"Turiya Approach — Delta ({delta*100:.0f}%) + waking Alpha "
                     f"({alpha*100:.0f}%): deep Yoga Nidra or restorative Delta-Alpha "
                     f"healing blend (Svapna-Jagrat boundary)")

    # Sushumna / Niruddha coherence signature
    if plv > PLV_COHERENCE and abs(faa) < 0.10:
        flags.append(f"Sushumna Activated — PLV {plv:.2f} + balanced FAA ({faa:+.2f}): "
                     f"interhemispheric coherence, unified awareness, Samadhi approach")

    # High-beta agitation warning
    if high_beta > 0.30:
        flags.append(f"High-Beta Agitation ({high_beta*100:.0f}%) — Kshipta tendency: "
                     f"prefrontal hyperarousal. Nadi Shodhana pranayama recommended.")

    # Tamasic heaviness
    if delta > 0.40 and alpha < 0.10:
        flags.append(f"Tamasic State — Delta surge ({delta*100:.0f}%) + absent Alpha "
                     f"({alpha*100:.0f}%): cognitive heaviness / Mudha bhumi. "
                     f"Stimulating pranayama (Kapalabhati) recommended.")

    return flags


# ── Vṛtti index (citta-vṛtti activity → nirodha) ─────────────────────────────
# Yoga Sūtra 1.2: yogaś citta-vṛtti-nirodhaḥ — yoga is the stilling of mental
# fluctuations. Their EEG correlate is frontal high-beta desynchronisation
# (rajasic chatter); interhemispheric coherence (PLV) reflects settling. The
# index is 0 (still / nirodha) → 1 (scattered / vikṣepa). Note this measures
# *agitation*, not dullness: tamasic Mudha reads low, exactly like sattvic
# stillness — the guna reading distinguishes the two.

def _vritti_index(band_rel: dict, plv: float) -> float:
    high_beta = band_rel.get("high_beta", band_rel.get("beta", 0.0) * 0.45)
    raw = 1.6 * high_beta + 0.35 * (1.0 - plv) - 0.15
    return float(min(max(raw, 0.0), 1.0))


def _depth_score(band_rel: dict, plv: float, vritti: float) -> float:
    """Continuous contemplative depth in [0,1] — a transparent weighted blend of
    relaxed-awareness alpha, stillness (1−vṛtti), interhemispheric coherence,
    Fm-θ absorption, and peak-state gamma. Uses only bands+PLV+vṛtti so it is
    identical on the /analyze and /analyze/bands paths. Weights are provisional —
    Phase 4b fits them against real depth-probe labels."""
    alpha = band_rel.get("alpha", 0.0)
    theta = band_rel.get("theta", 0.0)
    gamma = band_rel.get("gamma", 0.0)
    raw = (0.30 * alpha + 0.25 * (1.0 - vritti) + 0.20 * plv
           + 0.15 * theta + 0.10 * gamma)
    return float(min(max(raw, 0.0), 1.0))


def _nirodha_state(vritti: float) -> str:
    if vritti < 0.20:
        return "Nirodha (still)"
    if vritti < 0.45:
        return "Settling"
    if vritti < 0.70:
        return "Active"
    return "Vikshepa (scattered)"


# ── Corroboration: Western neuromarkers as SIGNED evidence under the bhūmi ────
# The Chitta Bhūmi is the primary (śāstric) claim; these axes are *witnesses*
# folded underneath it. Each is SIGNED — it either corroborates the bhūmi or
# registers *tension* with it — so a disagreement (e.g. tāmasic dullness
# masquerading as sāttvic stillness) surfaces instead of being hidden by a
# corroboration-only view. Only signals already computed upstream are used (no
# new DSP); axes whose inputs are absent on the /analyze/bands path are omitted
# rather than guessed. Neural complexity is the key discriminator the bhūmi's
# own band-power features cannot supply: it separates low-arousal dullness
# (low complexity) from low-arousal absorption (retained complexity).

def _richness(complexity: Optional[dict]) -> Optional[float]:
    """Collapse the four complexity metrics into a single relative richness in
    [0,1]. Rough expected ranges (not calibrated absolutes) — a low/moderate/high
    reading is all this is claimed to support."""
    if not complexity:
        return None
    lz = float(complexity.get("lziv", 0.0))
    hf = float(complexity.get("higuchi_fd", 0.0))
    se = float(complexity.get("sample_entropy", 0.0))
    pe = float(complexity.get("perm_entropy", 0.0))
    parts = [
        min(max(lz / 1.0, 0.0), 1.0),
        min(max((hf - 1.0) / 1.0, 0.0), 1.0),
        min(max(se / 2.0, 0.0), 1.0),
        min(max(pe, 0.0), 1.0),
    ]
    return float(sum(parts) / len(parts))


def _complexity_verdict(bhumi: str, level: str):
    if bhumi == "Mudha":
        if level == "low":  return True,  "low complexity is consistent with tāmasic dullness"
        if level == "high": return False, "rich, structured signal — resembles resting awareness more than inertia"
        return None, "richness is higher than a purely inert state would show"
    if bhumi == "Kshipta":
        if level == "high": return True,  "high, unpredictable complexity fits a scattered mind"
        if level == "low":  return False, "unusually ordered for a scattered state"
        return None, ""
    if bhumi == "Vikshipta":
        if level == "moderate": return True, "mid-range complexity fits an oscillating mind"
        return None, ""
    if bhumi in ("Ekagra", "Niruddha"):
        if level in ("moderate", "high"): return True,  "retained complexity — genuine stillness, not drowsiness"
        return False, "low complexity resembles drowsiness (tāmasic Mudha), not absorption"
    return None, ""


def _aperiodic_verdict(bhumi: str, level: str):
    # The 1/f exponent tracks arousal / E–I balance: steep = quiet, inhibition-
    # weighted cortex; flat = excitation-weighted. NOTE it is shared by Mudha and
    # the deep states (both low-arousal) — complexity is what separates them.
    if bhumi == "Kshipta":
        if level == "flat":  return True,  "flat 1/f (cortical excitation) fits hyperarousal"
        if level == "steep": return False, "a quiet cortical background is unexpected for agitation"
        return None, ""
    if bhumi in ("Ekagra", "Niruddha"):
        if level == "steep": return True,  "steep 1/f — a quiet, inhibition-weighted cortex"
        if level == "flat":  return False, "an excitation-weighted background is unexpected for deep absorption"
        return None, ""
    if bhumi == "Mudha":
        if level == "steep": return True, "steep 1/f fits low-arousal heaviness"
        return None, ""
    return None, ""


def _vritti_verdict(bhumi: str, level: str):
    if bhumi == "Kshipta":
        if level == "high": return True,  "elevated high-β chatter fits Kṣipta"
        if level == "low":  return False, "unusually quiet for a scattered state"
        return None, ""
    if bhumi in ("Ekagra", "Niruddha"):
        if level == "low":  return True,  "stilled fluctuations — citta-vṛtti-nirodha"
        if level == "high": return False, "active chatter is at odds with one-pointedness"
        return None, ""
    if bhumi == "Mudha":
        if level == "low":  return True,  "low chatter — though dullness and stillness both read low here"
        return None, ""
    if bhumi == "Vikshipta":
        if level in ("moderate", "high"): return True, "some restlessness fits an oscillating mind"
        return None, ""
    return None, ""


def _absorption_verdict(bhumi: str, present: bool):
    if bhumi == "Ekagra":
        if present: return True,  "Fm-θ + α synchrony — the focused-attention absorption signature"
        return False, "the one-pointed absorption signature is absent"
    return None, ""


def _flow_verdict(present: bool):
    # Frontal-β suppression = transient hypofrontality: effortless absorption
    # (dhyāna) vs effortful holding (dhāraṇā). Only meaningful for the deep states,
    # and informative rather than contradictory — its absence is NOT a dissent.
    if present:
        return True, "effortless — the flow-like signature of dhyāna, not strained holding"
    return None, "focus appears effortful — dhāraṇā-like holding rather than settled flow"


def corroborate(info: dict, chitta_bhumi: Optional[str], probs: Optional[dict] = None) -> dict:
    """Build the SIGNED corroboration block that folds under the bhūmi.

    Returns {axes:[{axis,reading,agrees,note}], concord, indeterminate, caveat}.
    `agrees` is True (corroborates), False (tension), or None (neutral/orthogonal).
    `indeterminate` softens the bhūmi ONLY on strong tension + a thin classifier
    margin — a confident śāstric win is never overruled by a lone dissenting axis.
    """
    br     = info.get("band_relative", {}) or {}
    plv    = float(info.get("plv", 0.5))
    vritti = _vritti_index(br, plv)
    bhumi  = chitta_bhumi or ""

    axes = []

    # ── Axis 1: Neural complexity (richness of conscious content) ──
    rich = _richness(info.get("complexity"))
    if rich is not None:
        level = "low" if rich < 0.33 else ("high" if rich > 0.60 else "moderate")
        agrees, note = _complexity_verdict(bhumi, level)
        axes.append({"axis": "neural_complexity",
                     "reading": f"{level} richness ({rich:.2f})",
                     "agrees": agrees, "note": note})

    # ── Axis 2: Cortical quietude (aperiodic 1/f exponent → arousal / E–I) ──
    aperiodic = info.get("aperiodic")
    if aperiodic is not None:
        exp = float(aperiodic.get("exponent", 0.0))
        level = "flat" if exp < 1.0 else ("steep" if exp > 1.5 else "moderate")
        agrees, note = _aperiodic_verdict(bhumi, level)
        axes.append({"axis": "cortical_quietude",
                     "reading": f"{level} 1/f slope (exponent {exp:.2f})",
                     "agrees": agrees, "note": note})

    # ── Axis 3: Mental chatter (vṛtti / mind-wandering) — always available ──
    vlevel = "low" if vritti < 0.20 else ("high" if vritti > 0.45 else "moderate")
    agrees, note = _vritti_verdict(bhumi, vlevel)
    axes.append({"axis": "mental_chatter",
                 "reading": f"{vlevel} vṛtti ({vritti:.2f})",
                 "agrees": agrees, "note": note})

    # ── Axis 4: Absorption signature (Fm-θ + α, suppressed high-β) ──
    theta     = br.get("theta", 0.0)
    alpha     = br.get("alpha", 0.0)
    high_beta = br.get("high_beta", br.get("beta", 0.0) * 0.45)
    fa_present = (theta + alpha) > 0.45 and high_beta < 0.15
    agrees, note = _absorption_verdict(bhumi, fa_present)
    if agrees is not None:   # only relevant for Ekagra; skip elsewhere to reduce noise
        axes.append({"axis": "absorption_signature",
                     "reading": "present" if fa_present else "absent",
                     "agrees": agrees, "note": note})

    # ── Axis 5: Effortlessness (flow / frontal-β suppression) — deep states only ──
    if bhumi in ("Ekagra", "Niruddha"):
        low_beta = br.get("low_beta", 0.0)
        flow_present = high_beta < 0.10 and low_beta < 0.15
        agrees, note = _flow_verdict(flow_present)
        axes.append({"axis": "effortlessness",
                     "reading": "effortless" if flow_present else "effortful",
                     "agrees": agrees, "note": note})

    # ── Concord over the signed axes ──
    dissents = [a for a in axes if a["agrees"] is False]
    agreed   = [a for a in axes if a["agrees"] is True]
    if dissents and len(dissents) >= len(agreed):
        concord = "tension"
    elif dissents:
        concord = "mixed"
    elif agreed:
        concord = "corroborated"
    else:
        concord = "inconclusive"

    # ── Softening to indeterminate: ONLY when the KEY discriminating axis for
    # this bhūmi dissents AND the classifier's own margin is thin. A dissent on a
    # merely secondary axis, or a confident śāstric win, is left standing — the
    # tradition is not overruled by a lone marker. The key axis is the one the
    # bhūmi's band-power features cannot themselves supply (complexity separates
    # dullness from absorption; chatter separates a scattered mind from a still one).
    _KEY_AXIS = {
        "Mudha":    "neural_complexity",
        "Ekagra":   "neural_complexity",
        "Niruddha": "neural_complexity",
        "Kshipta":  "mental_chatter",
    }
    key_axis       = _KEY_AXIS.get(bhumi)
    strong_dissent = bool(key_axis) and any(d["axis"] == key_axis for d in dissents)

    margin = None
    if probs:
        vals = sorted((float(v) for v in probs.values()), reverse=True)
        if len(vals) >= 2:
            margin = vals[0] - vals[1]
    indeterminate = strong_dissent and (margin is None or margin < 0.15)

    complexity_dissent = any(d["axis"] == "neural_complexity" for d in dissents)
    if complexity_dissent and bhumi in ("Ekagra", "Niruddha"):
        caveat = ("Low neural complexity resembles drowsiness (tāmasic Mudha) rather than "
                  "genuine absorption.")
    elif complexity_dissent and bhumi == "Mudha":
        caveat = ("The signal retains rich structure — this may be quiet resting awareness "
                  "rather than inertia.")
    elif dissents:
        caveat = "Neuromarkers diverge from the śāstric reading."
    else:
        caveat = ""

    return {
        "axes":          axes,
        "concord":       concord,
        "indeterminate": indeterminate,
        "caveat":        caveat,
    }


# ── Contemplative depth ───────────────────────────────────────────────────────

# The classical guna *doctrine* for each bhumi — a fixed traditional attribution,
# a temporal average, distinct from the honest per-epoch measured blend (which is
# never overridden). Vikshipta's doctrinal guna is Rajas (its measured session
# mean is Sattvic-predominant/Rajasic-secondary — the transitional turning point).
CLASSICAL_GUNA = {
    "Mudha":     "Tamas",
    "Kshipta":   "Rajas",
    "Vikshipta": "Rajas",
    "Ekagra":    "Sattva",
    "Niruddha":  "Sattva",
}


_BHUMI_DEPTH = {
    "Mudha":     "Deep Inertia",   # NEW: lowest state
    "Kshipta":   "Surface",
    "Vikshipta": "Emerging",
    "Ekagra":    "Deep",
    "Niruddha":  "Profound",
}


# ── Main public function ──────────────────────────────────────────────────────

def vedantic_analyze(
    info: dict,
    chitta_bhumi: Optional[str] = None,
) -> VedanticReading:
    """
    Produce a complete VedanticReading from the feature-extractor info dict.

    Parameters
    ----------
    info         : dict from FeatureExtractor.extract() — must contain
                   band_relative, alpha_left, alpha_right, faa, plv.
    chitta_bhumi : optional Chitta Bhumi label (used for Guna secondary adj.)

    Returns
    -------
    VedanticReading dataclass with .to_dict() method.
    """
    band_rel    = info.get("band_relative", {})
    alpha_left  = float(info.get("alpha_left",  1e-12))
    alpha_right = float(info.get("alpha_right", 1e-12))
    faa         = float(info.get("faa",         0.0))
    plv         = float(info.get("plv",         0.50))

    # ── Swara classification (using ln-ratio FAA) ─────────────────────────
    swara_state, swara_conf, swara_note = _classify_swara(
        alpha_left, alpha_right, faa=faa
    )

    # ── Tattva / Chakra flags ─────────────────────────────────────────────
    tattva_flags = _detect_tattva_flags(band_rel, alpha_left, alpha_right, faa, plv)

    # ── Contemplative depth from Chitta Bhumi ─────────────────────────────
    contemplative_depth = _BHUMI_DEPTH.get(chitta_bhumi or "", "Surface")

    # ── Vṛtti index (mental-fluctuation activity → nirodha) ───────────────
    vritti_index  = _vritti_index(band_rel, plv)
    nirodha_state = _nirodha_state(vritti_index)

    # ── Classical guna doctrine (fixed per bhumi; does NOT override the blend) ─
    classical_guna = CLASSICAL_GUNA.get(chitta_bhumi or "", "Rajas")

    # ── Continuous contemplative depth ────────────────────────────────────
    depth_score = _depth_score(band_rel, plv, vritti_index)

    # ── Trigunas (paper-aligned scorer) ───────────────────────────────────
    # Extract swara key for secondary adjustment
    swara_key = (
        "sushumna" if "sushumna" in swara_state.lower()
        else "ida"    if "ida"     in swara_state.lower()
        else "pingala"
    )

    gunas = classify_gunas(
        band_rel,
        faa=faa,
        plv=plv,
        chitta_bhumi=chitta_bhumi,
        swara=swara_key,
    )
    gdesc  = describe_gunas(gunas)
    gnote  = gunas_note(gunas)

    return VedanticReading(
        swara               = swara_state,
        swara_confidence    = swara_conf,
        swara_note          = swara_note,
        tattva_flags        = tattva_flags,
        contemplative_depth = contemplative_depth,
        vritti_index        = vritti_index,
        nirodha_state       = nirodha_state,
        classical_guna      = classical_guna,
        contemplative_depth_score = depth_score,
        gunas               = gunas,
        guna_label          = gdesc["label"],
        guna_dominant       = gdesc["dominant"],
        guna_secondary      = gdesc["secondary"],
        guna_note           = gnote,
    )
