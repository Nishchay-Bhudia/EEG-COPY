using System.Numerics;
using MathNet.Numerics.IntegralTransforms;

namespace NeuroYogic.SignalProcessing.Dsp;

/// <summary>
/// Thin FFT wrapper that reproduces NumPy's FFT scaling convention:
/// forward transform is un-scaled, inverse is scaled by 1/N
/// (MathNet <see cref="FourierOptions.AsymmetricScaling"/>).
/// </summary>
internal static class FourierTransform
{
    public static Complex[] Fft(Complex[] input)
    {
        var buffer = (Complex[])input.Clone();
        Fourier.Forward(buffer, FourierOptions.AsymmetricScaling);
        return buffer;
    }

    public static Complex[] Ifft(Complex[] input)
    {
        var buffer = (Complex[])input.Clone();
        Fourier.Inverse(buffer, FourierOptions.AsymmetricScaling);
        return buffer;
    }

    public static Complex[] Fft(double[] real)
    {
        var buffer = new Complex[real.Length];
        for (var i = 0; i < real.Length; i++) buffer[i] = new Complex(real[i], 0.0);
        Fourier.Forward(buffer, FourierOptions.AsymmetricScaling);
        return buffer;
    }
}
