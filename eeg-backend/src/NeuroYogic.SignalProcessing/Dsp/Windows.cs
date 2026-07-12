namespace NeuroYogic.SignalProcessing.Dsp;

internal static class Windows
{
    /// <summary>
    /// Periodic (DFT-even) Hann window, matching SciPy's
    /// <c>get_window('hann', M)</c> (fftbins=True): w[n] = 0.5 − 0.5·cos(2πn/M).
    /// </summary>
    public static double[] Hann(int m)
    {
        var w = new double[m];
        if (m == 1)
        {
            w[0] = 1.0;
            return w;
        }
        for (var n = 0; n < m; n++)
            w[n] = 0.5 - 0.5 * Math.Cos(2.0 * Math.PI * n / m);
        return w;
    }
}
