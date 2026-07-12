using System.Text.Json;
using NeuroYogic.Analysis;
using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Enums;
using Xunit;

namespace NeuroYogic.Analysis.Tests;

/// <summary>
/// Validates the classification + vedantic layers against golden values from the
/// original Python pipeline (scripts/generate_golden_classify.py).
/// </summary>
public class GoldenClassifyTests
{
    private static readonly IReadOnlyList<Case> Cases = Load();

    private static readonly IEegAnalysisService Service = new EegAnalysisService(
        new NeuroYogic.SignalProcessing.FeatureExtractor(),
        new YogaClassifier(),
        new VedanticAnalyzer(new GunaClassifier()));

    public static IEnumerable<object[]> Names => Cases.Select(c => new object[] { c.Name });

    [Theory]
    [MemberData(nameof(Names))]
    public void MatchesPythonPipeline(string name)
    {
        var c = Cases.First(x => x.Name == name);
        var input = new BandInput(c.Input.Delta, c.Input.Theta, c.Input.Alpha, c.Input.Beta, c.Input.Gamma)
        {
            HighBeta = c.Input.HighBeta,
            LowBeta = c.Input.LowBeta,
            Faa = c.Input.Faa,
            Plv = c.Input.Plv,
        };

        var result = Service.AnalyzeBands(input);
        var e = c.Expected;

        Assert.Equal(e.Chitta, result.Chitta.State.ToString());
        Assert.Equal(e.Margin, result.Chitta.Margin, 3);
        Assert.Equal(e.Indeterminate, result.Chitta.IsIndeterminate);
        Assert.StartsWith(e.Swara.Split(' ')[0], result.Vedantic.Swara.State);
        Assert.Equal(e.Depth, result.Vedantic.ContemplativeDepth);

        Assert.Equal(e.VrittiIndex, result.Vedantic.VrittiIndex, 3);
        Assert.Equal(e.NirodhaState, result.Vedantic.NirodhaState);
        Assert.Equal(e.ClassicalGuna, result.Vedantic.ClassicalGuna);
        Assert.Equal(e.ContemplativeDepthScore, result.Vedantic.ContemplativeDepthScore, 3);

        Assert.Equal(e.Gunas.Sattva, result.Vedantic.Gunas.Sattva, 3);
        Assert.Equal(e.Gunas.Rajas, result.Vedantic.Gunas.Rajas, 3);
        Assert.Equal(e.Gunas.Tamas, result.Vedantic.Gunas.Tamas, 3);
        Assert.Equal(e.Gunas.Label, result.Vedantic.Gunas.Label);

        Assert.Equal(e.TattvaCount, result.Vedantic.TattvaFlags.Count);

        // Signed corroboration folded under the bhūmi.
        var corr = result.Vedantic.Corroboration;
        Assert.Equal(e.Corroboration.Concord, corr.Concord);
        Assert.Equal(e.Corroboration.Indeterminate, corr.Indeterminate);
        Assert.Equal(e.Corroboration.Caveat, corr.Caveat);
        Assert.Equal(e.Corroboration.Axes.Count, corr.Axes.Count);
        for (var i = 0; i < e.Corroboration.Axes.Count; i++)
        {
            Assert.Equal(e.Corroboration.Axes[i].Axis, corr.Axes[i].Axis);
            Assert.Equal(e.Corroboration.Axes[i].Agrees, corr.Axes[i].Agrees);
            Assert.Equal(e.Corroboration.Axes[i].Reading, corr.Axes[i].Reading);
        }

        // Probabilities per state.
        foreach (var (state, prob) in e.Probs)
        {
            var cb = Enum.Parse<ChittaBhumi>(state);
            Assert.Equal(prob, result.Chitta.Probabilities[cb], 3);
        }
    }

    private static IReadOnlyList<Case> Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "golden_classify.json");
        var opts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true,
        };
        return JsonSerializer.Deserialize<List<Case>>(File.ReadAllText(path), opts)!;
    }

    public sealed record Case(string Name, CaseInput Input, CaseExpected Expected);

    public sealed record CaseInput(
        double Delta, double Theta, double Alpha, double Beta, double Gamma,
        double? HighBeta, double? LowBeta, double? Faa, double? Plv);

    public sealed record CaseExpected(
        string Chitta,
        Dictionary<string, double> Probs,
        double Margin,
        bool Indeterminate,
        string Swara,
        string Depth,
        double VrittiIndex,
        string NirodhaState,
        string ClassicalGuna,
        double ContemplativeDepthScore,
        ExpectedGunas Gunas,
        int TattvaCount,
        ExpectedCorroboration Corroboration);

    public sealed record ExpectedGunas(double Sattva, double Rajas, double Tamas, string Label);

    public sealed record ExpectedCorroboration(
        string Concord, bool Indeterminate, string Caveat, IReadOnlyList<ExpectedAxis> Axes);

    public sealed record ExpectedAxis(string Axis, bool? Agrees, string Reading);
}
