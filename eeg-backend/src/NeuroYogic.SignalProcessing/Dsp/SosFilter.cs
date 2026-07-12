namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Second-order-section filtering, reproducing SciPy's <c>sosfilt</c> /
/// <c>sosfiltfilt</c> (Direct-Form-II transposed, steady-state initial
/// conditions, odd padding).
/// </summary>
internal static class SosFilter
{
    /// <summary>
    /// Zero-phase forward-backward filter (SciPy <c>sosfiltfilt</c>, padtype='odd').
    /// </summary>
    public static double[] FiltFilt(double[][] sos, double[] x)
    {
        var nSections = sos.Length;
        var ntaps = 2 * nSections + 1;
        // Subtract shared trailing-zero taps (b2/a2). Our filters never have them.
        var zeroB2 = sos.Count(s => s[2] == 0.0);
        var zeroA2 = sos.Count(s => s[5] == 0.0);
        ntaps -= Math.Min(zeroB2, zeroA2);

        var edge = ntaps * 3;
        if (edge >= x.Length)
            edge = x.Length - 1; // SciPy raises; we clamp for very short epochs.
        if (edge < 0) edge = 0;

        var ext = OddExtension(x, edge);

        var zi = SosFiltZi(sos); // (nSections, 2)

        // Forward pass, initial condition scaled by first sample.
        var ziF = ScaleZi(zi, ext[0]);
        var (yF, _) = Sosfilt(sos, ext, ziF);

        // Backward pass, initial condition scaled by last sample.
        var reversed = (double[])yF.Clone();
        Array.Reverse(reversed);
        var ziB = ScaleZi(zi, reversed[0]);
        var (yB, _) = Sosfilt(sos, reversed, ziB);
        Array.Reverse(yB);

        if (edge > 0)
        {
            var trimmed = new double[yB.Length - 2 * edge];
            Array.Copy(yB, edge, trimmed, 0, trimmed.Length);
            return trimmed;
        }
        return yB;
    }

    /// <summary>Forward SOS filter with per-section initial conditions.</summary>
    private static (double[] y, double[,] zf) Sosfilt(double[][] sos, double[] x, double[,] zi)
    {
        var nSections = sos.Length;
        var z = (double[,])zi.Clone();
        var y = (double[])x.Clone();

        for (var s = 0; s < nSections; s++)
        {
            var b0 = sos[s][0];
            var b1 = sos[s][1];
            var b2 = sos[s][2];
            var a1 = sos[s][4];
            var a2 = sos[s][5];
            var z0 = z[s, 0];
            var z1 = z[s, 1];

            for (var n = 0; n < y.Length; n++)
            {
                var xn = y[n];
                var yn = b0 * xn + z0;
                z0 = b1 * xn - a1 * yn + z1;
                z1 = b2 * xn - a2 * yn;
                y[n] = yn;
            }
            z[s, 0] = z0;
            z[s, 1] = z1;
        }
        return (y, z);
    }

    /// <summary>
    /// Steady-state (unit step) initial conditions per section, matching
    /// <c>scipy.signal.sosfilt_zi</c>. Each section's zi is scaled by the
    /// cumulative DC gain of the preceding sections.
    /// </summary>
    private static double[,] SosFiltZi(double[][] sos)
    {
        var nSections = sos.Length;
        var zi = new double[nSections, 2];
        var scale = 1.0;
        for (var s = 0; s < nSections; s++)
        {
            var b = new[] { sos[s][0], sos[s][1], sos[s][2] };
            var a = new[] { sos[s][3], sos[s][4], sos[s][5] };
            var sectionZi = LfilterZi(b, a);
            zi[s, 0] = scale * sectionZi[0];
            zi[s, 1] = scale * sectionZi[1];
            var bSum = b[0] + b[1] + b[2];
            var aSum = a[0] + a[1] + a[2];
            scale *= bSum / aSum;
        }
        return zi;
    }

    /// <summary>
    /// Initial conditions for a second-order section (SciPy <c>lfilter_zi</c>,
    /// specialised to order 2 with a0 = 1). Solves (I − Aᵀ) zi = B.
    /// </summary>
    private static double[] LfilterZi(double[] b, double[] a)
    {
        // Normalise by a0 (already 1 for our sections, but be safe).
        var a0 = a[0];
        var b0 = b[0] / a0;
        var b1 = b[1] / a0;
        var b2 = b[2] / a0;
        var a1 = a[1] / a0;
        var a2 = a[2] / a0;

        // IminusA = eye(2) - companion(a).T = [[1+a1, -1], [a2, 1]]
        // B = [b1 - a1*b0, b2 - a2*b0]
        var bb0 = b1 - a1 * b0;
        var bb1 = b2 - a2 * b0;

        // Solve [[1+a1, -1],[a2, 1]] · zi = [bb0, bb1]
        var m00 = 1.0 + a1;
        const double m01 = -1.0;
        var m10 = a2;
        const double m11 = 1.0;
        var det = m00 * m11 - m01 * m10;
        var zi0 = (bb0 * m11 - m01 * bb1) / det;
        var zi1 = (m00 * bb1 - bb0 * m10) / det;
        return new[] { zi0, zi1 };
    }

    private static double[,] ScaleZi(double[,] zi, double x0)
    {
        var n = zi.GetLength(0);
        var scaled = new double[n, 2];
        for (var i = 0; i < n; i++)
        {
            scaled[i, 0] = zi[i, 0] * x0;
            scaled[i, 1] = zi[i, 1] * x0;
        }
        return scaled;
    }

    /// <summary>
    /// Odd extension of length <paramref name="n"/> on each end, matching
    /// <c>scipy.signal._arraytools.odd_ext</c>:
    /// left = 2·x[0] − x[n..1], right = 2·x[-1] − x[-2..-(n+1)].
    /// </summary>
    private static double[] OddExtension(double[] x, int n)
    {
        if (n == 0) return (double[])x.Clone();
        var len = x.Length;
        var ext = new double[len + 2 * n];

        var leftEnd = x[0];
        for (var i = 0; i < n; i++)
            ext[i] = 2.0 * leftEnd - x[n - i]; // x[n], x[n-1], ..., x[1]

        Array.Copy(x, 0, ext, n, len);

        var rightEnd = x[len - 1];
        for (var i = 0; i < n; i++)
            ext[len + n + i] = 2.0 * rightEnd - x[len - 2 - i]; // x[-2], x[-3], ...

        return ext;
    }
}
