namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// Relative EEG band powers (each in 0..1, summing to ~1 across the six primary bands).
/// Mirrors the Python <c>band_relative</c> dict, including the legacy combined <see cref="Beta"/>.
/// </summary>
public sealed record BandPowers(
    double Delta,
    double Theta,
    double Alpha,
    double LowBeta,
    double HighBeta,
    double Gamma)
{
    /// <summary>Legacy combined beta = low_beta + high_beta.</summary>
    public double Beta => LowBeta + HighBeta;

    /// <summary>Normalise the six primary bands so they sum to 1.</summary>
    public BandPowers Normalized()
    {
        var total = Delta + Theta + Alpha + LowBeta + HighBeta + Gamma;
        if (total <= 1e-10) total = 1e-10;
        return new BandPowers(
            Delta / total,
            Theta / total,
            Alpha / total,
            LowBeta / total,
            HighBeta / total,
            Gamma / total);
    }

    public IReadOnlyDictionary<string, double> ToDictionary() => new Dictionary<string, double>
    {
        [EegBands.Delta] = Delta,
        [EegBands.Theta] = Theta,
        [EegBands.Alpha] = Alpha,
        [EegBands.LowBeta] = LowBeta,
        [EegBands.HighBeta] = HighBeta,
        [EegBands.Gamma] = Gamma,
        ["beta"] = Beta,
    };
}
