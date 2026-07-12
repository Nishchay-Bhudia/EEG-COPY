namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Individual Alpha Frequency — faithful C# port of the Python oracle in
/// <c>neuro_yogic/iaf.py</c>. Estimates the alpha peak as the spectral
/// centre-of-gravity of power in 7–13 Hz (more stable than a raw argmax), per
/// channel then averaged.
/// </summary>
internal static class Iaf
{
    public static double Estimate(double[] freqs, double[][] psd, double lo = 7.0, double hi = 13.0)
    {
        var maskIdx = new List<int>();
        for (var i = 0; i < freqs.Length; i++)
            if (freqs[i] >= lo && freqs[i] <= hi) maskIdx.Add(i);
        if (maskIdx.Count == 0) return 0.0;

        double sum = 0.0;
        var count = 0;
        foreach (var ch in psd)
        {
            double num = 0.0, den = 0.0;
            foreach (var i in maskIdx) { num += freqs[i] * ch[i]; den += ch[i]; }
            if (den <= 0.0) continue;
            sum += num / den;
            count++;
        }
        return count > 0 ? sum / count : 0.0;
    }
}
