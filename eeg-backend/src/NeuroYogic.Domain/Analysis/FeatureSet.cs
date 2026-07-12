namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// The complete feature set extracted from one EEG epoch — the C# analogue of the
/// Python <c>info</c> dict passed between the feature extractor and the classifiers.
/// </summary>
public sealed record FeatureSet
{
    /// <summary>Relative band powers (sum ≈ 1 over six primary bands).</summary>
    public required BandPowers BandRelative { get; init; }

    /// <summary>Absolute (un-normalised) band powers, when available from raw extraction.</summary>
    public BandPowers? BandAbsolute { get; init; }

    /// <summary>Mean absolute alpha power over left-hemisphere channels.</summary>
    public double AlphaLeft { get; init; }

    /// <summary>Mean absolute alpha power over right-hemisphere channels.</summary>
    public double AlphaRight { get; init; }

    /// <summary>Raw difference alpha_right − alpha_left (legacy asymmetry).</summary>
    public double AlphaAsymmetry { get; init; }

    /// <summary>Frontal Alpha Asymmetry = ln(alpha_right) − ln(alpha_left), clipped to [-2, 2].</summary>
    public double Faa { get; init; }

    /// <summary>Phase Locking Value between hemispheres (alpha band), 0..1.</summary>
    public double Plv { get; init; } = 0.5;

    /// <summary>
    /// Non-linear complexity / entropy measures (deep-state markers). Null when the
    /// epoch was analysed from pre-computed band powers (no raw signal available).
    /// </summary>
    public ComplexitySet? Complexity { get; init; }

    /// <summary>
    /// Aperiodic (1/f) spectral parameters. Null when the epoch was analysed from
    /// pre-computed band powers (no full spectrum available).
    /// </summary>
    public AperiodicFit? Aperiodic { get; init; }

    /// <summary>
    /// Non-linear functional connectivity (wSMI). Null when the epoch was analysed
    /// from pre-computed band powers (no raw signal available).
    /// </summary>
    public ConnectivitySet? Connectivity { get; init; }

    /// <summary>
    /// Individual Alpha Frequency (Hz) — the alpha spectral centroid. Null when the
    /// epoch was analysed from pre-computed band powers (no spectrum available).
    /// </summary>
    public double? Iaf { get; init; }

    /// <summary>True when an artifact (e.g. blink/EOG) was detected in the raw epoch.
    /// Null when analysed from pre-computed band powers (no raw signal).</summary>
    public bool? ArtifactFlagged { get; init; }

    /// <summary>Raw-signal quality in [0,1] (1 = clean). Null when analysed from bands.</summary>
    public double? SignalQuality { get; init; }

    /// <summary>True when relative gamma &gt; 0.12.</summary>
    public bool GammaSpike { get; init; }

    /// <summary>True when the source epoch was zero-padded to reach minimum length.</summary>
    public bool IsPadded { get; init; }
}
