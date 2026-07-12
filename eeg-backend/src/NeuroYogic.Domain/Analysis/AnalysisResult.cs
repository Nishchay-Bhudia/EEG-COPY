using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Domain.Analysis;

/// <summary>Chitta Bhumi classification with fuzzy-scored probabilities per state.</summary>
public sealed record ChittaClassification(
    ChittaBhumi State,
    IReadOnlyDictionary<ChittaBhumi, double> Probabilities)
{
    /// <summary>Margin below which the winner isn't meaningfully ahead of the runner-up.</summary>
    public const double IndeterminateMargin = 0.10;

    public double Confidence => Probabilities.TryGetValue(State, out var p) ? p : 0.0;

    /// <summary>Gap between the top and second-most-likely bhūmi (0 when &lt;2 states).</summary>
    public double Margin
    {
        get
        {
            if (Probabilities.Count < 2) return Confidence;
            var top2 = Probabilities.Values.OrderByDescending(v => v).Take(2).ToArray();
            return top2[0] - top2[1];
        }
    }

    /// <summary>
    /// True when the top bhūmi isn't meaningfully ahead — the honest "don't overclaim"
    /// signal for a trust-based product (subject-independent EEG classification is noisy).
    /// </summary>
    public bool IsIndeterminate => Margin < IndeterminateMargin;
}

/// <summary>
/// Sattva / Rajas / Tamas proportions (sum to 1) — always a trigunātmaka blend —
/// with the predominant and (when substantial) secondary guna, a plain-English
/// label, and an interpretive note. <see cref="Dominant"/>/<see cref="Secondary"/>
/// are null for an equilibrium (triguṇa-sāmya) reading.
/// </summary>
public sealed record GunaProfile(
    double Sattva,
    double Rajas,
    double Tamas,
    string Label,
    string Note)
{
    public Guna? Dominant { get; init; }
    public Guna? Secondary { get; init; }
}

/// <summary>Swara (Nadi) reading derived from Frontal Alpha Asymmetry.</summary>
public sealed record SwaraReading(
    SwaraNadi Nadi,
    string State,
    string Confidence,
    string Note);

/// <summary>The Vedantic interpretation layer over the raw EEG features.</summary>
/// <param name="VrittiIndex">
/// Citta-vṛtti activity, 0 (still / nirodha) → 1 (scattered / vikṣepa) — the EEG
/// correlate of Yoga Sūtra 1.2 (yogaś citta-vṛtti-nirodhaḥ). Measures agitation,
/// not dullness.
/// </param>
/// <param name="NirodhaState">Plain-language band over <paramref name="VrittiIndex"/>.</param>
/// <param name="ClassicalGuna">
/// The fixed classical guna doctrine for the bhūmi (a temporal average) — distinct
/// from the honest per-epoch measured <see cref="GunaProfile"/>, which it never overrides.
/// </param>
public sealed record VedanticReading(
    SwaraReading Swara,
    IReadOnlyList<string> TattvaFlags,
    string ContemplativeDepth,
    GunaProfile Gunas,
    double VrittiIndex,
    string NirodhaState,
    string ClassicalGuna,
    double ContemplativeDepthScore,
    Corroboration Corroboration);

/// <summary>
/// The full analysis output for one EEG epoch — everything the API returns and
/// everything persisted per epoch.
/// </summary>
public sealed record AnalysisResult(
    ChittaClassification Chitta,
    VedanticReading Vedantic,
    FeatureSet Features)
{
    public double? BloodOxygen { get; init; }
    public double? HeartRate { get; init; }
}
