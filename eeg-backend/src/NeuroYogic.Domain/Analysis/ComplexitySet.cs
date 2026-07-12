namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// Non-linear complexity / entropy measures for one EEG epoch — markers of the
/// <em>non-oscillatory</em> dynamics that distinguish deep contemplative states
/// (Ekagra / Niruddha), which band powers capture poorly.
/// </summary>
/// <param name="Lziv">Normalised Lempel-Ziv complexity (LZ76) of the median-binarised signal.</param>
/// <param name="HiguchiFd">Higuchi fractal dimension (signal roughness / self-similarity).</param>
/// <param name="SampleEntropy">Sample entropy SampEn(2, 0.2·std) — unpredictability.</param>
/// <param name="PermEntropy">Normalised permutation entropy (order 3) — ordinal-pattern diversity.</param>
public sealed record ComplexitySet(
    double Lziv,
    double HiguchiFd,
    double SampleEntropy,
    double PermEntropy);
