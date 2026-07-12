namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// Non-linear functional connectivity for one EEG epoch. Unlike the symmetric
/// alpha PLV, weighted symbolic mutual information captures non-oscillatory
/// coupling and discounts volume conduction — it distinguished deep absorption
/// where phase synchrony did not.
/// </summary>
/// <param name="Wsmi">Mean weighted symbolic mutual information over channel pairs.</param>
public sealed record ConnectivitySet(double Wsmi);
