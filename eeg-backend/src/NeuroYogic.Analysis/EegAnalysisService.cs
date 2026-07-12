using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Analysis;
using NeuroYogic.SignalProcessing;

namespace NeuroYogic.Analysis;

/// <summary>Raw multi-channel EEG epoch input.</summary>
public sealed record RawEegInput(double[][] EegData, int SampleRate = 256)
{
    public double? BloodOxygen { get; init; }
    public double? HeartRate { get; init; }
}

/// <summary>
/// Pre-computed band-power input (the lightweight <c>/analyze/bands</c> path).
/// Optional fields mirror the Python endpoint's estimation rules.
/// </summary>
public sealed record BandInput(double Delta, double Theta, double Alpha, double Beta, double Gamma)
{
    public double? HighBeta { get; init; }
    public double? LowBeta { get; init; }
    public double? AlphaLeft { get; init; }
    public double? AlphaRight { get; init; }
    public double? Faa { get; init; }
    public double? Plv { get; init; }
    public double? BloodOxygen { get; init; }
    public double? HeartRate { get; init; }
}

/// <summary>Runs the full EEG → yogic-state analysis pipeline.</summary>
public interface IEegAnalysisService
{
    AnalysisResult AnalyzeRaw(RawEegInput input);
    AnalysisResult AnalyzeBands(BandInput input);
}

/// <inheritdoc />
public sealed class EegAnalysisService : IEegAnalysisService
{
    private readonly IFeatureExtractor _extractor;
    private readonly IYogaClassifier _yoga;
    private readonly IVedanticAnalyzer _vedantic;

    public EegAnalysisService(IFeatureExtractor extractor, IYogaClassifier yoga, IVedanticAnalyzer vedantic)
    {
        _extractor = extractor;
        _yoga = yoga;
        _vedantic = vedantic;
    }

    public AnalysisResult AnalyzeRaw(RawEegInput input)
    {
        var features = _extractor.Extract(input.EegData, input.SampleRate);
        return Compose(features, input.BloodOxygen, input.HeartRate);
    }

    public AnalysisResult AnalyzeBands(BandInput input)
    {
        // Mirror the Python /analyze/bands estimation rules.
        var highBeta = input.HighBeta ?? input.Beta * 0.45;
        var lowBeta = input.LowBeta ?? input.Beta * 0.55;
        var alphaLeft = input.AlphaLeft ?? input.Alpha / 2.0;
        var alphaRight = input.AlphaRight ?? input.Alpha / 2.0;

        double faa;
        if (input.Faa.HasValue)
        {
            faa = input.Faa.Value;
        }
        else
        {
            faa = Math.Log(Math.Max(alphaRight, 1e-12)) - Math.Log(Math.Max(alphaLeft, 1e-12));
        }
        faa = Math.Clamp(faa, -2.0, 2.0);
        var plv = Math.Clamp(input.Plv ?? 0.50, 0.0, 1.0);

        var raw = new BandPowers(input.Delta, input.Theta, input.Alpha, lowBeta, highBeta, input.Gamma);
        var relative = raw.Normalized();

        var features = new FeatureSet
        {
            BandRelative = relative,
            AlphaLeft = alphaLeft,
            AlphaRight = alphaRight,
            AlphaAsymmetry = alphaRight - alphaLeft,
            Faa = faa,
            Plv = plv,
            GammaSpike = relative.Gamma > 0.12,
            IsPadded = false,
        };

        return Compose(features, input.BloodOxygen, input.HeartRate);
    }

    private AnalysisResult Compose(FeatureSet features, double? spo2, double? hr)
    {
        var chitta = _yoga.Classify(features);
        var vedantic = _vedantic.Analyze(features, chitta);
        return new AnalysisResult(chitta, vedantic, features)
        {
            BloodOxygen = spo2,
            HeartRate = hr,
        };
    }
}
