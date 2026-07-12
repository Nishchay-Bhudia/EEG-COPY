using NeuroYogic.Domain.Analysis;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Aperiodic (1/f) spectral decomposition — faithful C# port of the Python
/// oracle in <c>neuro_yogic/aperiodic.py</c>. Fits the non-oscillatory 1/f
/// background of the power spectrum, FOOOF-style:
/// <c>log10(PSD) ≈ offset − exponent · log10(f)</c> over 2–40 Hz, per channel
/// then averaged. The exponent tracks excitation/inhibition balance and arousal.
/// </summary>
internal static class Aperiodic
{
    public static AperiodicFit Fit(double[] freqs, double[][] psd, double lo = 2.0, double hi = 40.0)
    {
        var maskIdx = new List<int>();
        for (var i = 0; i < freqs.Length; i++)
            if (freqs[i] >= lo && freqs[i] <= hi && freqs[i] > 0.0) maskIdx.Add(i);
        if (maskIdx.Count < 2) return new AperiodicFit(0.0, 0.0);

        var logf = new double[maskIdx.Count];
        for (var j = 0; j < maskIdx.Count; j++) logf[j] = Math.Log10(freqs[maskIdx[j]]);

        var nCh = psd.Length;
        double expSum = 0.0, offSum = 0.0;
        var logp = new double[maskIdx.Count];
        for (var c = 0; c < nCh; c++)
        {
            for (var j = 0; j < maskIdx.Count; j++)
                logp[j] = Math.Log10(Math.Max(psd[c][maskIdx[j]], 1e-20));
            var (slope, intercept) = LinFit(logf, logp);
            expSum += -slope;      // aperiodic exponent = negative log-log slope
            offSum += intercept;
        }
        return new AperiodicFit(expSum / nCh, offSum / nCh);
    }

    /// <summary>Ordinary-least-squares slope &amp; intercept (identical to aperiodic.py).</summary>
    private static (double Slope, double Intercept) LinFit(double[] xs, double[] ys)
    {
        var n = xs.Length;
        double mx = 0.0, my = 0.0;
        for (var i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
        mx /= n; my /= n;
        double num = 0.0, den = 0.0;
        for (var i = 0; i < n; i++)
        {
            var dx = xs[i] - mx;
            num += dx * (ys[i] - my);
            den += dx * dx;
        }
        var slope = den != 0.0 ? num / den : 0.0;
        return (slope, my - slope * mx);
    }
}
