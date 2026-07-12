using System.Numerics;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Welch's power spectral density estimate, reproducing
/// <c>scipy.signal.welch</c> with its defaults: periodic Hann window,
/// <c>detrend='constant'</c>, <c>scaling='density'</c>, one-sided,
/// <c>average='mean'</c>.
/// </summary>
internal static class Welch
{
    public sealed record Result(double[] Frequencies, double[] Psd);

    public static Result Compute(double[] x, double fs, int nperseg, int noverlap)
    {
        nperseg = Math.Min(nperseg, x.Length);
        if (nperseg < 1) nperseg = 1;
        noverlap = Math.Min(noverlap, nperseg);
        if (noverlap >= nperseg) noverlap = nperseg / 2;

        var window = Windows.Hann(nperseg);
        double winSqSum = 0.0;
        foreach (var w in window) winSqSum += w * w;

        var step = nperseg - noverlap;
        if (step < 1) step = 1;

        var nfft = nperseg;
        var nFreq = nfft / 2 + 1;
        var psd = new double[nFreq];

        var nSegments = 0;
        for (var start = 0; start + nperseg <= x.Length; start += step)
        {
            // Detrend (constant): subtract segment mean.
            double mean = 0.0;
            for (var i = 0; i < nperseg; i++) mean += x[start + i];
            mean /= nperseg;

            var seg = new Complex[nfft];
            for (var i = 0; i < nperseg; i++)
                seg[i] = new Complex((x[start + i] - mean) * window[i], 0.0);

            var spectrum = FourierTransform.Fft(seg);

            for (var f = 0; f < nFreq; f++)
            {
                var mag2 = spectrum[f].Real * spectrum[f].Real + spectrum[f].Imaginary * spectrum[f].Imaginary;
                var scaled = mag2 / (fs * winSqSum);
                // One-sided: double all bins except DC and (for even nfft) Nyquist.
                if (f != 0 && !(nfft % 2 == 0 && f == nFreq - 1))
                    scaled *= 2.0;
                psd[f] += scaled;
            }
            nSegments++;
        }

        if (nSegments == 0)
        {
            // Signal shorter than a single segment; fall back to one padded segment.
            return ComputeSingle(x, fs, window, winSqSum, nfft, nFreq);
        }

        for (var f = 0; f < nFreq; f++) psd[f] /= nSegments;

        var freqs = new double[nFreq];
        for (var f = 0; f < nFreq; f++) freqs[f] = f * fs / nfft;

        return new Result(freqs, psd);
    }

    private static Result ComputeSingle(double[] x, double fs, double[] window,
        double winSqSum, int nfft, int nFreq)
    {
        double mean = 0.0;
        foreach (var v in x) mean += v;
        mean /= Math.Max(x.Length, 1);

        var seg = new Complex[nfft];
        for (var i = 0; i < x.Length && i < nfft; i++)
            seg[i] = new Complex((x[i] - mean) * window[Math.Min(i, window.Length - 1)], 0.0);

        var spectrum = FourierTransform.Fft(seg);
        var psd = new double[nFreq];
        for (var f = 0; f < nFreq; f++)
        {
            var mag2 = spectrum[f].Real * spectrum[f].Real + spectrum[f].Imaginary * spectrum[f].Imaginary;
            var scaled = mag2 / (fs * winSqSum);
            if (f != 0 && !(nfft % 2 == 0 && f == nFreq - 1)) scaled *= 2.0;
            psd[f] = scaled;
        }
        var freqs = new double[nFreq];
        for (var f = 0; f < nFreq; f++) freqs[f] = f * fs / nfft;
        return new Result(freqs, psd);
    }
}
