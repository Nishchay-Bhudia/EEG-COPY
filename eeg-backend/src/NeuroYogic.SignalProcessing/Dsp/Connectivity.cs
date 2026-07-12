using NeuroYogic.Domain.Analysis;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Non-linear functional connectivity — faithful C# port of the Python oracle in
/// <c>neuro_yogic/connectivity.py</c>. Computes weighted Symbolic Mutual
/// Information (wSMI, King et al. 2013) over channel pairs: ordinal-pattern
/// symbolisation, mutual information between symbol streams, with identical and
/// mirror-image symbol pairs weighted out to discount volume conduction.
/// </summary>
internal static class Connectivity
{
    public static ConnectivitySet Compute(double[][] filtered) => new(Wsmi(filtered));

    public static double Wsmi(double[][] filtered, int order = 3, int delay = 1)
    {
        var nCh = filtered.Length;
        var mirror = BuildMirrorMap(order);
        var syms = new long[nCh][];
        for (var c = 0; c < nCh; c++) syms[c] = Symbolize(filtered[c], order, delay);

        var denom = Math.Log(Factorial(order));
        double sum = 0.0;
        var pairs = 0;
        for (var i = 0; i < nCh; i++)
            for (var j = i + 1; j < nCh; j++)
            {
                sum += WsmiPair(syms[i], syms[j], denom, mirror);
                pairs++;
            }
        return pairs > 0 ? sum / pairs : 0.0;
    }

    private static double WsmiPair(long[] sa, long[] sb, double denom, IReadOnlyDictionary<long, long> mirror)
    {
        var t = sa.Length;
        if (t == 0 || denom <= 0.0) return 0.0;

        var joint = new Dictionary<(long, long), int>();
        var ca = new Dictionary<long, int>();
        var cb = new Dictionary<long, int>();
        for (var k = 0; k < t; k++)
        {
            var a = sa[k];
            var b = sb[k];
            joint.TryGetValue((a, b), out var jc); joint[(a, b)] = jc + 1;
            ca.TryGetValue(a, out var ac); ca[a] = ac + 1;
            cb.TryGetValue(b, out var bc); cb[b] = bc + 1;
        }

        var smi = 0.0;
        foreach (var kv in joint)
        {
            var (aCode, bCode) = kv.Key;
            if (aCode == bCode || aCode == mirror[bCode]) continue;
            var pab = (double)kv.Value / t;
            var pa = (double)ca[aCode] / t;
            var pb = (double)cb[bCode] / t;
            smi += pab * Math.Log(pab / (pa * pb));
        }
        return smi / denom;
    }

    /// <summary>Ordinal-pattern symbol codes for one channel.</summary>
    private static long[] Symbolize(double[] x, int order, int delay)
    {
        var n = x.Length;
        var span = delay * (order - 1);
        var count = n - span;
        if (count <= 0) return Array.Empty<long>();
        var codes = new long[count];
        var window = new double[order];
        for (var i = 0; i < count; i++)
        {
            for (var t = 0; t < order; t++) window[t] = x[i + t * delay];
            codes[i] = Encode(ArgsortStable(window), order);
        }
        return codes;
    }

    /// <summary>Maps each ordinal-pattern code to the code of its reversed pattern.</summary>
    private static Dictionary<long, long> BuildMirrorMap(int order)
    {
        var map = new Dictionary<long, long>();
        foreach (var perm in Permutations(order))
        {
            var rev = (int[])perm.Clone();
            Array.Reverse(rev);
            map[Encode(perm, order)] = Encode(rev, order);
        }
        return map;
    }

    private static long Encode(int[] perm, int order)
    {
        long code = 0, mul = 1;
        for (var t = 0; t < order; t++) { code += perm[t] * mul; mul *= order; }
        return code;
    }

    private static IEnumerable<int[]> Permutations(int order)
    {
        var items = new int[order];
        for (var i = 0; i < order; i++) items[i] = i;
        return Permute(items, 0);
    }

    private static IEnumerable<int[]> Permute(int[] arr, int start)
    {
        if (start == arr.Length - 1)
        {
            yield return (int[])arr.Clone();
            yield break;
        }
        for (var i = start; i < arr.Length; i++)
        {
            (arr[start], arr[i]) = (arr[i], arr[start]);
            foreach (var p in Permute(arr, start + 1)) yield return p;
            (arr[start], arr[i]) = (arr[i], arr[start]);
        }
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
