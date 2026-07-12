namespace NeuroYogic.Domain.Enums;

/// <summary>
/// The five Chitta Bhumis (planes of mind) of Patanjali's Yoga Sutras,
/// ordered from lowest (dull) to highest (mastered).
/// </summary>
public enum ChittaBhumi
{
    /// <summary>Dull / torpid — Tamas-dominant. Waking delta surge, absent alpha/gamma.</summary>
    Mudha = 0,

    /// <summary>Scattered — Rajas-dominant. High beta (18-30 Hz), suppressed alpha.</summary>
    Kshipta = 1,

    /// <summary>Oscillating — Sattva-emerging. Moderate alpha alternating with beta.</summary>
    Vikshipta = 2,

    /// <summary>One-pointed — pure Sattva. Sustained Fm-θ + high alpha synchrony.</summary>
    Ekagra = 3,

    /// <summary>Mastered — Gunatita. Global gamma coherence (PLV &gt; 0.80).</summary>
    Niruddha = 4,
}

/// <summary>The three Samkhya / Ayurvedic Gunas (qualities of nature).</summary>
public enum Guna
{
    /// <summary>Clarity, purity, balance.</summary>
    Sattva,

    /// <summary>Activity, passion, dynamism.</summary>
    Rajas,

    /// <summary>Inertia, heaviness, dullness.</summary>
    Tamas,
}

/// <summary>Swara / Nadi — the dominant breath-energy channel, derived from Frontal Alpha Asymmetry.</summary>
public enum SwaraNadi
{
    /// <summary>Parasympathetic / lunar. FAA &lt; -0.15. Right-hemisphere activation.</summary>
    Ida,

    /// <summary>Central / balanced. |FAA| ≤ 0.15. Interhemispheric coherence.</summary>
    Sushumna,

    /// <summary>Sympathetic / solar. FAA &gt; +0.15. Left-hemisphere activation.</summary>
    Pingala,
}

/// <summary>How a self-reported depth label was captured (experience sampling).</summary>
public enum ProbeKind
{
    /// <summary>Prompted at a random interval during practice.</summary>
    Probe,

    /// <summary>Spontaneously reported by the practitioner on surfacing (outperforms probing).</summary>
    Emerge,
}
