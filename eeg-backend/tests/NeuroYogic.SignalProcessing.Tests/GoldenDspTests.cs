using System.Text.Json;
using NeuroYogic.SignalProcessing;
using Xunit;

namespace NeuroYogic.SignalProcessing.Tests;

/// <summary>
/// Validates the C# DSP port against golden reference values produced by the
/// original Python/scipy pipeline (see scripts/generate_golden.py).
/// </summary>
public class GoldenDspTests
{
    private static readonly IReadOnlyList<GoldenFixture> Fixtures = LoadFixtures();

    public static IEnumerable<object[]> FixtureNames =>
        Fixtures.Select(f => new object[] { f.Name });

    [Theory]
    [MemberData(nameof(FixtureNames))]
    public void MatchesPythonReference(string name)
    {
        var fx = Fixtures.First(f => f.Name == name);
        var extractor = new FeatureExtractor();
        var result = extractor.Extract(fx.Eeg, fx.SampleRate);

        var e = fx.Expected;
        var br = result.BandRelative;

        // Relative band powers: tight absolute tolerance (these drive the classifier).
        Assert.Equal(e.BandRelative["delta"], br.Delta, 3);
        Assert.Equal(e.BandRelative["theta"], br.Theta, 3);
        Assert.Equal(e.BandRelative["alpha"], br.Alpha, 3);
        Assert.Equal(e.BandRelative["low_beta"], br.LowBeta, 3);
        Assert.Equal(e.BandRelative["high_beta"], br.HighBeta, 3);
        Assert.Equal(e.BandRelative["gamma"], br.Gamma, 3);

        // Derived metrics.
        Assert.Equal(e.Faa, result.Faa, 2);
        Assert.Equal(e.Plv, result.Plv, 2);

        // Non-linear complexity features. Like FAA/PLV these are per-sample
        // filter-derived, so they use the 2-dp tolerance convention.
        Assert.NotNull(result.Complexity);
        Assert.Equal(e.Complexity.Lziv, result.Complexity!.Lziv, 2);
        Assert.Equal(e.Complexity.HiguchiFd, result.Complexity.HiguchiFd, 2);
        Assert.Equal(e.Complexity.SampleEntropy, result.Complexity.SampleEntropy, 2);
        Assert.Equal(e.Complexity.PermEntropy, result.Complexity.PermEntropy, 2);

        // Aperiodic 1/f fit (log-log slope aggregate — 2-dp filter-derived tolerance).
        Assert.NotNull(result.Aperiodic);
        Assert.Equal(e.Aperiodic.Exponent, result.Aperiodic!.Exponent, 2);
        Assert.Equal(e.Aperiodic.Offset, result.Aperiodic.Offset, 2);

        // Non-linear connectivity (wSMI) — ordinal-based, robust to 3 dp.
        Assert.NotNull(result.Connectivity);
        Assert.Equal(e.Connectivity.Wsmi, result.Connectivity!.Wsmi, 3);

        // Individual Alpha Frequency (spectral centroid).
        Assert.NotNull(result.Iaf);
        Assert.Equal(e.Iaf, result.Iaf!.Value, 2);

        // Artifact screening (robust-z on the raw signal).
        Assert.Equal(e.ArtifactFlagged, result.ArtifactFlagged);
        Assert.NotNull(result.SignalQuality);
        Assert.Equal(e.SignalQuality, result.SignalQuality!.Value, 3);
    }

    private static IReadOnlyList<GoldenFixture> LoadFixtures()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "golden.json");
        var json = File.ReadAllText(path);
        var opts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true,
        };
        return JsonSerializer.Deserialize<List<GoldenFixture>>(json, opts)!;
    }

    public sealed record GoldenFixture(string Name, int SampleRate, double[][] Eeg, GoldenExpected Expected);

    public sealed record GoldenExpected(
        Dictionary<string, double> BandRelative,
        double AlphaLeft,
        double AlphaRight,
        double Faa,
        double Plv,
        ComplexityExpected Complexity,
        AperiodicExpected Aperiodic,
        ConnectivityExpected Connectivity,
        double Iaf,
        bool ArtifactFlagged,
        double SignalQuality);

    public sealed record ComplexityExpected(
        double Lziv,
        double HiguchiFd,
        double SampleEntropy,
        double PermEntropy);

    public sealed record AperiodicExpected(
        double Exponent,
        double Offset);

    public sealed record ConnectivityExpected(
        double Wsmi);
}
