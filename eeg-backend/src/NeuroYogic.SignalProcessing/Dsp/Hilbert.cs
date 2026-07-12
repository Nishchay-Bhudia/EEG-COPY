using System.Numerics;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Analytic signal via the Hilbert transform, reproducing
/// <c>scipy.signal.hilbert</c>.
/// </summary>
internal static class Hilbert
{
    /// <summary>Instantaneous phase (radians) of the analytic signal of <paramref name="x"/>.</summary>
    public static double[] InstantaneousPhase(double[] x)
    {
        var n = x.Length;
        var spectrum = FourierTransform.Fft(x);

        // Build the frequency-doubling vector h.
        var h = new double[n];
        if (n % 2 == 0)
        {
            h[0] = 1.0;
            h[n / 2] = 1.0;
            for (var i = 1; i < n / 2; i++) h[i] = 2.0;
        }
        else
        {
            h[0] = 1.0;
            for (var i = 1; i < (n + 1) / 2; i++) h[i] = 2.0;
        }

        for (var i = 0; i < n; i++) spectrum[i] *= h[i];

        var analytic = FourierTransform.Ifft(spectrum);
        var phase = new double[n];
        for (var i = 0; i < n; i++) phase[i] = Math.Atan2(analytic[i].Imaginary, analytic[i].Real);
        return phase;
    }
}
