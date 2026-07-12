namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Second-order IIR notch filter, reproducing <c>scipy.signal.iirnotch(w0, Q)</c>
/// followed by <c>tf2sos</c> (which yields a single section since the filter is
/// already order 2).
/// </summary>
internal static class IirNotch
{
    /// <summary>
    /// Design a notch at <paramref name="w0"/> (normalised to Nyquist, 0..1) with
    /// quality factor <paramref name="q"/>. Returns one SOS row [b0,b1,b2,a0,a1,a2].
    /// </summary>
    public static double[][] Sos(double w0, double q)
    {
        // Matches scipy._design_notch_peak_filter(w0, Q, "notch", fs=2.0):
        // with fs=2 the incoming w0 is already normalised to Nyquist.
        var bw = w0 / q;
        var w0Rad = w0 * Math.PI;
        var bwRad = bw * Math.PI;

        const double gb = 0.70710678118654752440; // 1/sqrt(2), the -3 dB point
        var beta = (Math.Sqrt(1.0 - gb * gb) / gb) * Math.Tan(bwRad / 2.0);
        var gain = 1.0 / (1.0 + beta);

        var cos = Math.Cos(w0Rad);
        var b0 = gain;
        var b1 = -2.0 * gain * cos;
        var b2 = gain;
        var a0 = 1.0;
        var a1 = -2.0 * gain * cos;
        var a2 = 2.0 * gain - 1.0;

        return new[] { new[] { b0, b1, b2, a0, a1, a2 } };
    }
}
