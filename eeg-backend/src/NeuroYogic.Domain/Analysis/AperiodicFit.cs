namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// The non-oscillatory 1/f background of the power spectrum, parameterised as
/// <c>log10(PSD) ≈ Offset − Exponent · log10(f)</c>. A steeper <see cref="Exponent"/>
/// reflects greater low-frequency dominance / inhibition; it shifts in deep
/// absorption in ways band-ratios miss.
/// </summary>
/// <param name="Exponent">Steepness of the 1/f slope (higher = steeper).</param>
/// <param name="Offset">Broadband spectral offset (log10 power intercept).</param>
public sealed record AperiodicFit(double Exponent, double Offset);
