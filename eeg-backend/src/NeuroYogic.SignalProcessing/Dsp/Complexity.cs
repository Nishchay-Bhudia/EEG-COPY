using NeuroYogic.Domain.Analysis;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Non-linear complexity / entropy features — faithful C# port of the Python
/// oracle in <c>neuro_yogic/complexity.py</c>. These index the *non-oscillatory*
/// structure that distinguishes deep contemplative states (Ekagra / Niruddha),
/// which band-power and phase measures capture poorly.
///
/// Each measure is computed per channel then averaged across channels, matching
/// the band-power convention in <see cref="FeatureExtractor"/>.
/// </summary>
internal static class Complexity
{
    public static ComplexitySet Compute(double[][] filtered)
    {
        var nCh = filtered.Length;
        double lz = 0.0, hf = 0.0, se = 0.0, pe = 0.0;
        for (var c = 0; c < nCh; c++)
        {
            lz += LempelZiv(filtered[c]);
            hf += HiguchiFd(filtered[c]);
            se += SampleEntropy(filtered[c]);
            pe += PermEntropy(filtered[c]);
        }
        return new ComplexitySet(lz / nCh, hf / nCh, se / nCh, pe / nCh);
    }

    /// <summary>Normalised Lempel-Ziv complexity (LZ76) of the median-binarised signal.</summary>
    public static double LempelZiv(double[] x)
    {
        var n = x.Length;
        if (n < 2) return 0.0;
        var med = Median(x);
        var s = new int[n];
        for (var t = 0; t < n; t++) s[t] = x[t] > med ? 1 : 0;

        // LZ76 substring-counting (Kaspar & Schuster) — identical to complexity.py.
        int i = 0, c = 1, l = 1, k = 1, kMax = 1;
        while (true)
        {
            if (s[i + k - 1] == s[l + k - 1])
            {
                k++;
                if (l + k > n) { c++; break; }
            }
            else
            {
                if (k > kMax) kMax = k;
                i++;
                if (i == l)
                {
                    c++;
                    l += kMax;
                    if (l + 1 > n) break;
                    i = 0; k = 1; kMax = 1;
                }
                else
                {
                    k = 1;
                }
            }
        }
        return c * Math.Log2(n) / n;
    }

    /// <summary>Higuchi fractal dimension via the log-log slope of curve length L(k).</summary>
    public static double HiguchiFd(double[] x, int kmax = 10)
    {
        var n = x.Length;
        if (n < 4) return 0.0;
        kmax = Math.Min(kmax, n / 2);
        var lnk = new List<double>();
        var lnl = new List<double>();
        for (var k = 1; k <= kmax; k++)
        {
            var lm = new List<double>();
            for (var m = 0; m < k; m++)
            {
                var nm = (n - m - 1) / k;
                if (nm <= 0) continue;
                var acc = 0.0;
                for (var i = 1; i <= nm; i++)
                    acc += Math.Abs(x[m + i * k] - x[m + (i - 1) * k]);
                var norm = (double)(n - 1) / (nm * k);
                lm.Add(acc * norm / k);
            }
            if (lm.Count > 0)
            {
                lnl.Add(Math.Log(Mean(lm)));
                lnk.Add(Math.Log(1.0 / k));
            }
        }
        if (lnk.Count < 2) return 0.0;
        return Slope(lnk, lnl);
    }

    /// <summary>Sample entropy SampEn(m, r) with r = rCoef · std(x) (population std).</summary>
    public static double SampleEntropy(double[] x, int m = 2, double rCoef = 0.2)
    {
        var n = x.Length;
        if (n < m + 2) return 0.0;
        var r = rCoef * Std(x);
        if (r <= 0.0) return 0.0;

        int Count(int mm)
        {
            var countN = n - m;   // N - m templates for both m and m+1 (aligned)
            var c = 0;
            for (var i = 0; i < countN; i++)
                for (var j = i + 1; j < countN; j++)
                {
                    var d = 0.0;
                    for (var t = 0; t < mm; t++)
                    {
                        var diff = Math.Abs(x[i + t] - x[j + t]);
                        if (diff > d) d = diff;
                    }
                    if (d <= r) c++;
                }
            return c;
        }

        var b = Count(m);
        var a = Count(m + 1);
        if (a == 0 || b == 0) return 0.0;
        return -Math.Log((double)a / b);
    }

    /// <summary>Normalised permutation entropy of ordinal patterns (Bandt-Pompe).</summary>
    public static double PermEntropy(double[] x, int order = 3, int delay = 1)
    {
        var n = x.Length;
        var span = delay * (order - 1);
        if (n - span <= 1) return 0.0;
        var counts = new Dictionary<string, int>();
        var window = new double[order];
        for (var i = 0; i < n - span; i++)
        {
            for (var t = 0; t < order; t++) window[t] = x[i + t * delay];
            var key = string.Join(",", ArgsortStable(window));
            counts.TryGetValue(key, out var cur);
            counts[key] = cur + 1;
        }
        var total = 0;
        foreach (var v in counts.Values) total += v;
        var pe = 0.0;
        foreach (var v in counts.Values)
        {
            var p = (double)v / total;
            pe -= p * Math.Log2(p);
        }
        var denom = Math.Log2(Factorial(order));
        return denom > 0 ? pe / denom : 0.0;
    }

    // ── small helpers (kept identical to complexity.py) ─────────────────────

    private static double Median(double[] x)
    {
        var s = (double[])x.Clone();
        Array.Sort(s);
        var n = s.Length;
        return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2.0;
    }

    private static double Std(double[] x)
    {
        var n = x.Length;
        var mean = 0.0;
        foreach (var v in x) mean += v;
        mean /= n;
        var acc = 0.0;
        foreach (var v in x) { var d = v - mean; acc += d * d; }
        return Math.Sqrt(acc / n);
    }

    private static double Mean(List<double> xs)
    {
        var s = 0.0;
        foreach (var v in xs) s += v;
        return s / xs.Count;
    }

    private static double Slope(List<double> xs, List<double> ys)
    {
        var nx = xs.Count;
        double mx = 0.0, my = 0.0;
        for (var i = 0; i < nx; i++) { mx += xs[i]; my += ys[i]; }
        mx /= nx; my /= nx;
        double num = 0.0, den = 0.0;
        for (var i = 0; i < nx; i++)
        {
            var dx = xs[i] - mx;
            num += dx * (ys[i] - my);
            den += dx * dx;
        }
        return den != 0.0 ? num / den : 0.0;
    }

    private static int[] ArgsortStable(double[] w)
    {
        var idx = new int[w.Length];
        for (var i = 0; i < w.Length; i++) idx[i] = i;
        Array.Sort(idx, (a, b) =>
        {
            var cmp = w[a].CompareTo(w[b]);
            return cmp != 0 ? cmp : a.CompareTo(b);
        });
        return idx;
    }

    private static long Factorial(int k)
    {
        long f = 1;
        for (var i = 2; i <= k; i++) f *= i;
        return f;
    }
}
