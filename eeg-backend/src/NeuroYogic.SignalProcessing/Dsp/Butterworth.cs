using System.Numerics;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Digital Butterworth band-pass filter design, reproducing
/// <c>scipy.signal.butter(N, [lo, hi], btype='bandpass', output='sos')</c>.
///
/// Pipeline: analog low-pass prototype (buttap) → frequency pre-warp →
/// low-pass→band-pass transform (lp2bp_zpk) → bilinear transform → second-order
/// sections. For a Butterworth band-pass every finite zero lands at DC (z=+1) or
/// Nyquist (z=-1), so each section shares the numerator [1, 0, -1]; only the
/// denominators (one conjugate pole pair each) and the overall gain differ.
/// </summary>
internal static class Butterworth
{
    /// <summary>
    /// Design an order-<paramref name="order"/> band-pass filter.
    /// </summary>
    /// <param name="order">Prototype order N (the band-pass is order 2N).</param>
    /// <param name="lowNorm">Low edge normalised to Nyquist (0..1).</param>
    /// <param name="highNorm">High edge normalised to Nyquist (0..1).</param>
    /// <returns>SOS matrix: rows of [b0, b1, b2, a0, a1, a2].</returns>
    public static double[][] BandpassSos(int order, double lowNorm, double highNorm)
    {
        // ── 1. Analog low-pass prototype poles (buttap): p_k = -exp(iπ·m/(2N)) ──
        var protoPoles = new Complex[order];
        var idx = 0;
        for (var m = -order + 1; m < order; m += 2)
        {
            protoPoles[idx++] = -Complex.Exp(Complex.ImaginaryOne * (Math.PI * m / (2.0 * order)));
        }
        // prototype gain k = 1, zeros = none

        // ── 2. Pre-warp band edges (bilinear, internal fs = 2) ──
        const double fs = 2.0;
        var warpedLow = 2.0 * fs * Math.Tan(Math.PI * lowNorm / fs);
        var warpedHigh = 2.0 * fs * Math.Tan(Math.PI * highNorm / fs);
        var bw = warpedHigh - warpedLow;
        var wo = Math.Sqrt(warpedLow * warpedHigh);

        // ── 3. lp2bp_zpk: transform prototype poles to band-pass ──
        // p_bp = p_lp ± sqrt(p_lp² − wo²), with p_lp = p·bw/2
        var bpPoles = new Complex[2 * order];
        for (var i = 0; i < order; i++)
        {
            var pLp = protoPoles[i] * (bw / 2.0);
            var disc = Complex.Sqrt(pLp * pLp - wo * wo);
            bpPoles[i] = pLp + disc;
            bpPoles[i + order] = pLp - disc;
        }
        // Finite zeros: `order` zeros at the origin. gain k_bp = bw^order.
        var kBp = Math.Pow(bw, order);

        // ── 4. Bilinear transform (fs2 = 2·fs = 4) ──
        const double fs2 = 2.0 * fs;
        var zPoles = new Complex[2 * order];
        for (var i = 0; i < 2 * order; i++)
            zPoles[i] = (fs2 + bpPoles[i]) / (fs2 - bpPoles[i]);

        // k_z = k_bp · Re( prod(fs2 − z_finite) / prod(fs2 − p) ).
        // z_finite are `order` zeros at 0 → prod = fs2^order.
        Complex denom = Complex.One;
        for (var i = 0; i < 2 * order; i++) denom *= (fs2 - bpPoles[i]);
        var kZ = kBp * (Math.Pow(fs2, order) / denom).Real;

        // ── 5. Assemble second-order sections ──
        // Pair each pole with its complex conjugate; each section numerator is
        // (z−1)(z+1) → [1, 0, −1]; all gain goes into the first section.
        var pairs = GroupConjugatePairs(zPoles);
        var sos = new double[order][];
        for (var s = 0; s < order; s++)
        {
            var (p, pConj) = pairs[s];
            // denominator (1 + a1 z^-1 + a2 z^-2) = (1 − p z^-1)(1 − p* z^-1)
            var a1 = -(p + pConj).Real;
            var a2 = (p * pConj).Real;
            var gain = s == 0 ? kZ : 1.0;
            sos[s] = new[] { gain, 0.0, -gain, 1.0, a1, a2 };
        }
        return sos;
    }

    /// <summary>
    /// Group a list of poles (that occur in conjugate pairs) into pairs.
    /// Real poles are paired with themselves; genuine conjugate pairs are matched
    /// by nearest conjugate.
    /// </summary>
    private static List<(Complex, Complex)> GroupConjugatePairs(Complex[] poles)
    {
        var remaining = poles.ToList();
        var pairs = new List<(Complex, Complex)>();
        while (remaining.Count > 0)
        {
            var p = remaining[0];
            remaining.RemoveAt(0);

            if (Math.Abs(p.Imaginary) < 1e-9)
            {
                // Real pole: find another real pole to pair, else self-pair.
                var realIdx = remaining.FindIndex(q => Math.Abs(q.Imaginary) < 1e-9);
                if (realIdx >= 0)
                {
                    var q = remaining[realIdx];
                    remaining.RemoveAt(realIdx);
                    pairs.Add((p, q));
                }
                else
                {
                    pairs.Add((p, p));
                }
                continue;
            }

            // Complex pole: match nearest conjugate.
            var target = Complex.Conjugate(p);
            var bestIdx = 0;
            var bestDist = double.MaxValue;
            for (var i = 0; i < remaining.Count; i++)
            {
                var d = (remaining[i] - target).Magnitude;
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            var conj = remaining[bestIdx];
            remaining.RemoveAt(bestIdx);
            pairs.Add((p, conj));
        }
        return pairs;
    }
}
