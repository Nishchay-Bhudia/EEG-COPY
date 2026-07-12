using NeuroYogic.Domain.Analysis;

namespace NeuroYogic.SignalProcessing;

/// <summary>Extracts the classifier feature set from one raw multi-channel EEG epoch.</summary>
public interface IFeatureExtractor
{
    /// <summary>
    /// Run the full DSP pipeline on one epoch.
    /// </summary>
    /// <param name="rawEeg">Raw µV data, shape [channels][samples].</param>
    /// <param name="sampleRate">Samples per second.</param>
    /// <param name="isPadded">Whether the epoch was zero-padded upstream.</param>
    FeatureSet Extract(double[][] rawEeg, int sampleRate = 256, bool isPadded = false);
}
