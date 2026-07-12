namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Artifact / blink screening — faithful C# port of the Python oracle in
/// <c>neuro_yogic/artifact.py</c>. Screens the raw signal per channel with a
/// robust, scale-invariant rule (median ± MAD → robust-sigma): a sample is bad
/// if it exceeds <see cref="RobustZ"/> robust-sigma; a channel is flagged when
/// &gt;<see cref="BadFracFlag"/> of its samples are bad.
/// </summary>
internal static class ArtifactRejection
{
    private const double RobustZ = 6.0;
    private const double BadFracFlag = 0.02;
    private const double MadScale = 1.4826;

    public static (bool Flagged, double Quality) Screen(double[][] raw)
    {
        var nCh = raw.Length;
        if (nCh == 0 || raw[0].Length == 0) return (false, 1.0);

        double fracSum = 0.0;
        var anyBad = false;
        foreach (var ch in raw)
        {
            var n = ch.Length;
            var med = Median(ch);
            var dev = new double[n];
            for (var i = 0; i < n; i++) dev[i] = Math.Abs(ch[i] - med);
            var scale = MadScale * Median(dev);
            if (scale <= 0.0) continue;   // frac 0 for this channel

            var over = 0;
            for (var i = 0; i < n; i++) if (dev[i] / scale > RobustZ) over++;
            var frac = (double)over / n;
            fracSum += frac;
            if (frac > BadFracFlag) anyBad = true;
        }

        var quality = Math.Max(0.0, 1.0 - fracSum / nCh);
        return (anyBad, quality);
    }

    private static double Median(double[] x)
    {
        var s = (double[])x.Clone();
        Array.Sort(s);
        var n = s.Length;
        return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2.0;
    }
}
