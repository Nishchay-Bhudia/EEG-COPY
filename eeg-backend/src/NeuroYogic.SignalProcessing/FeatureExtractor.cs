using NeuroYogic.Domain.Analysis;
using NeuroYogic.SignalProcessing.Dsp;

namespace NeuroYogic.SignalProcessing;

/// <summary>
/// Faithful C# port of the Python <c>FeatureExtractor</c>: band-pass + notch
/// filtering, Welch PSD, band-power integration, hemispheric alpha asymmetry
/// (ln-ratio FAA), and alpha-band interhemispheric PLV.
/// </summary>
public sealed class FeatureExtractor : IFeatureExtractor
{
    private readonly int _defaultLeftIdx0;
    private readonly int _defaultLeftIdx1;
    private readonly int _defaultRightIdx0;
    private readonly int _defaultRightIdx1;
    private readonly double _notchFreq;

    public FeatureExtractor(
        IReadOnlyList<int>? leftIndices = null,
        IReadOnlyList<int>? rightIndices = null,
        double notchFreq = 50.0)
    {
        leftIndices ??= new[] { 0, 1 };
        rightIndices ??= new[] { 2, 3 };
        _defaultLeftIdx0 = leftIndices[0];
        _defaultLeftIdx1 = leftIndices.Count > 1 ? leftIndices[1] : leftIndices[0];
        _defaultRightIdx0 = rightIndices[0];
        _defaultRightIdx1 = rightIndices.Count > 1 ? rightIndices[1] : rightIndices[0];
        _notchFreq = notchFreq;
    }

    public FeatureSet Extract(double[][] rawEeg, int sampleRate = 256, bool isPadded = false)
    {
        if (rawEeg.Length == 0) throw new ArgumentException("EEG data has no channels.", nameof(rawEeg));
        var nCh = rawEeg.Length;
        var nSamp = rawEeg[0].Length;

        var nyq = sampleRate / 2.0;
        var nperseg = Math.Max(sampleRate / 2, 32);

        // ── Step 0: artifact / blink screening (on the raw signal) ──
        var (artifactFlagged, signalQuality) = ArtifactRejection.Screen(rawEeg);

        var leftIdx = new[] { _defaultLeftIdx0, _defaultLeftIdx1 };
        var rightIdx = new[] { _defaultRightIdx0, _defaultRightIdx1 };

        // ── Filter designs (match Python constructor) ──
        var bpSos = Butterworth.BandpassSos(4, 0.5 / nyq, Math.Min(49.9, 50.0) / nyq);
        var notchSos = IirNotch.Sos(Math.Min(_notchFreq / nyq, 0.999), 30.0);
        var alphaSos = Butterworth.BandpassSos(4, EegBands.AlphaLow / nyq, EegBands.AlphaHigh / nyq);

        // ── Step 1+2: band-pass then notch, per channel ──
        var filtered = new double[nCh][];
        for (var c = 0; c < nCh; c++)
        {
            var bp = SosFilter.FiltFilt(bpSos, rawEeg[c]);
            filtered[c] = SosFilter.FiltFilt(notchSos, bp);
        }

        // ── Step 3: Welch PSD per channel ──
        var welchN = Math.Min(nperseg, nSamp);
        var noverlap = welchN / 2;
        double[] freqs = Array.Empty<double>();
        var psd = new double[nCh][];
        for (var c = 0; c < nCh; c++)
        {
            var res = Welch.Compute(filtered[c], sampleRate, welchN, noverlap);
            freqs = res.Frequencies;
            psd[c] = res.Psd;
        }

        // ── Step 4: band-power integration (trapezoid), mean over channels ──
        double BandAbs(double lo, double hi)
        {
            var mask = MaskIndices(freqs, lo, hi);
            if (mask.Count == 0) return 0.0;
            double sum = 0.0;
            for (var c = 0; c < nCh; c++) sum += TrapzMasked(psd[c], freqs, mask);
            return sum / nCh;
        }

        var deltaAbs = BandAbs(0.5, 4.0);
        var thetaAbs = BandAbs(4.0, 8.0);
        var alphaAbs = BandAbs(8.0, 13.0);
        var lowBetaAbs = BandAbs(13.0, 18.0);
        var highBetaAbs = BandAbs(18.0, 30.0);
        var gammaAbs = BandAbs(30.0, 50.0);

        var absolute = new BandPowers(deltaAbs, thetaAbs, alphaAbs, lowBetaAbs, highBetaAbs, gammaAbs);

        // ── Step 5: relative power ──
        var total = deltaAbs + thetaAbs + alphaAbs + lowBetaAbs + highBetaAbs + gammaAbs;
        if (total <= 0) total = 1e-10;
        var relative = new BandPowers(
            deltaAbs / total, thetaAbs / total, alphaAbs / total,
            lowBetaAbs / total, highBetaAbs / total, gammaAbs / total);

        // ── Step 6: hemispheric alpha asymmetry ──
        var alphaMask = MaskIndices(freqs, 8.0, 13.0);

        double MeanAlpha(int[] idx)
        {
            var valid = idx.Where(i => i < nCh).ToArray();
            if (valid.Length == 0) return 1e-12;
            double sum = 0.0;
            foreach (var i in valid) sum += TrapzMasked(psd[i], freqs, alphaMask);
            return Math.Max(sum / valid.Length, 1e-12);
        }

        var alphaLeft = MeanAlpha(leftIdx);
        var alphaRight = MeanAlpha(rightIdx);
        var asymmetry = alphaRight - alphaLeft;

        double faa;
        try
        {
            faa = Math.Log(alphaRight) - Math.Log(alphaLeft);
        }
        catch
        {
            faa = 0.0;
        }
        faa = Math.Clamp(faa, -2.0, 2.0);

        // ── Step 7: PLV ──
        var plv = ComputePlv(filtered, alphaSos, leftIdx, rightIdx);

        // ── Step 7b: non-linear complexity features (deep-state markers) ──
        var complexity = Complexity.Compute(filtered);

        // ── Step 7c: aperiodic (1/f) decomposition ──
        var aperiodic = Aperiodic.Fit(freqs, psd);

        // ── Step 7d: non-linear connectivity (wSMI) ──
        var connectivity = Connectivity.Compute(filtered);

        // ── Step 7e: Individual Alpha Frequency ──
        var iaf = Iaf.Estimate(freqs, psd);

        return new FeatureSet
        {
            BandRelative = relative,
            BandAbsolute = absolute,
            AlphaLeft = alphaLeft,
            AlphaRight = alphaRight,
            AlphaAsymmetry = asymmetry,
            Faa = faa,
            Plv = plv,
            Complexity = complexity,
            Aperiodic = aperiodic,
            Connectivity = connectivity,
            Iaf = iaf,
            ArtifactFlagged = artifactFlagged,
            SignalQuality = signalQuality,
            GammaSpike = relative.Gamma > 0.12,
            IsPadded = isPadded,
        };
    }

    private static double ComputePlv(double[][] filtered, double[][] alphaSos, int[] leftIdx, int[] rightIdx)
    {
        var nCh = filtered.Length;
        var nSamp = filtered[0].Length;
        var left = leftIdx.Where(i => i < nCh).ToArray();
        var right = rightIdx.Where(i => i < nCh).ToArray();
        if (left.Length == 0 || right.Length == 0 || nSamp < 64) return 0.5;

        try
        {
            var leftAlpha = SosFilter.FiltFilt(alphaSos, filtered[left[0]]);
            var rightAlpha = SosFilter.FiltFilt(alphaSos, filtered[right[0]]);
            var leftPhase = Hilbert.InstantaneousPhase(leftAlpha);
            var rightPhase = Hilbert.InstantaneousPhase(rightAlpha);

            double sumRe = 0.0, sumIm = 0.0;
            for (var i = 0; i < nSamp; i++)
            {
                var d = rightPhase[i] - leftPhase[i];
                sumRe += Math.Cos(d);
                sumIm += Math.Sin(d);
            }
            var plv = Math.Sqrt(sumRe * sumRe + sumIm * sumIm) / nSamp;
            return Math.Clamp(plv, 0.0, 1.0);
        }
        catch
        {
            return 0.5;
        }
    }

    /// <summary>Indices where lo ≤ freq &lt; hi (matches Python mask semantics).</summary>
    private static List<int> MaskIndices(double[] freqs, double lo, double hi)
    {
        var idx = new List<int>();
        for (var i = 0; i < freqs.Length; i++)
            if (freqs[i] >= lo && freqs[i] < hi) idx.Add(i);
        return idx;
    }

    /// <summary>Trapezoidal integral of y over x at the given (contiguous) mask indices.</summary>
    private static double TrapzMasked(double[] y, double[] x, List<int> mask)
    {
        if (mask.Count < 2) return 0.0;
        double sum = 0.0;
        for (var k = 0; k < mask.Count - 1; k++)
        {
            var i0 = mask[k];
            var i1 = mask[k + 1];
            sum += (x[i1] - x[i0]) * (y[i1] + y[i0]) / 2.0;
        }
        return sum;
    }
}
