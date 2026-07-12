namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// Paper-aligned EEG frequency band definitions (Hz), from
/// "Electroencephalographic Mapping of Yogic Physiology".
/// </summary>
public static class EegBands
{
    public const string Delta = "delta";
    public const string Theta = "theta";
    public const string Alpha = "alpha";
    public const string LowBeta = "low_beta";
    public const string HighBeta = "high_beta";
    public const string Gamma = "gamma";

    /// <summary>Ordered (low → high frequency) band edges [lo, hi) in Hz.</summary>
    public static readonly IReadOnlyList<(string Name, double Low, double High)> Definitions = new[]
    {
        (Delta, 0.5, 4.0),
        (Theta, 4.0, 8.0),
        (Alpha, 8.0, 13.0),
        (LowBeta, 13.0, 18.0),
        (HighBeta, 18.0, 30.0),
        (Gamma, 30.0, 50.0),
    };

    public const double AlphaLow = 8.0;
    public const double AlphaHigh = 13.0;
}
