using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Analysis;
using NeuroYogic.Domain.Enums;
using Xunit;

namespace NeuroYogic.Analysis.Tests;

/// <summary>
/// Guards the classifier tuning: samples drawn from each paper-derived state
/// profile must classify back to that state with high recall. Prevents a
/// regression to the old "everything is Vikshipta" behaviour.
/// </summary>
public class ClassifierRecallTests
{
    private static readonly YogaClassifier Classifier = new();

    // (mean, std) per band + faa/plv — mirrors data_generator._STATE_PROFILES.
    private static readonly Dictionary<ChittaBhumi, Profile> Profiles = new()
    {
        [ChittaBhumi.Mudha] = new(0.45, 0.06, 0.18, 0.04, 0.07, 0.03, 0.16, 0.04, 0.10, 0.03, 0.04, 0.02, 0.05, 0.15, 0.30, 0.08),
        [ChittaBhumi.Kshipta] = new(0.10, 0.04, 0.12, 0.04, 0.12, 0.04, 0.22, 0.05, 0.34, 0.07, 0.10, 0.03, 0.25, 0.15, 0.30, 0.08),
        [ChittaBhumi.Ekagra] = new(0.07, 0.03, 0.30, 0.05, 0.38, 0.06, 0.12, 0.04, 0.07, 0.03, 0.06, 0.02, 0.00, 0.08, 0.72, 0.08),
        [ChittaBhumi.Niruddha] = new(0.05, 0.02, 0.18, 0.04, 0.30, 0.05, 0.10, 0.03, 0.05, 0.02, 0.32, 0.06, 0.00, 0.05, 0.88, 0.06),
    };

    // Vikshipta is bimodal (oscillating): absorption bursts (Sāttvic) alternate
    // with high-beta desync (Rājasic). Kept in lock-step with data_generator.py.
    private const double VikshiptaDesyncWeight = 0.55;
    private static readonly Profile VikshiptaAbsorption =
        new(0.14, 0.03, 0.15, 0.04, 0.27, 0.04, 0.16, 0.04, 0.11, 0.03, 0.08, 0.02, 0.00, 0.10, 0.58, 0.08);
    private static readonly Profile VikshiptaDesync =
        new(0.15, 0.03, 0.14, 0.04, 0.19, 0.04, 0.20, 0.04, 0.21, 0.03, 0.11, 0.03, 0.18, 0.10, 0.42, 0.08);

    private static readonly ChittaBhumi[] AllStates =
    {
        ChittaBhumi.Mudha, ChittaBhumi.Kshipta, ChittaBhumi.Vikshipta,
        ChittaBhumi.Ekagra, ChittaBhumi.Niruddha,
    };

    [Theory]
    [InlineData(ChittaBhumi.Mudha)]
    [InlineData(ChittaBhumi.Kshipta)]
    [InlineData(ChittaBhumi.Vikshipta)]
    [InlineData(ChittaBhumi.Ekagra)]
    [InlineData(ChittaBhumi.Niruddha)]
    public void EachStateProfile_ClassifiesBackToItself_WithHighRecall(ChittaBhumi state)
    {
        var rng = new Random(1234 + (int)state);
        const int n = 500;
        var correct = 0;
        for (var i = 0; i < n; i++)
        {
            var features = SampleFor(state, rng);
            if (Classifier.Classify(features).State == state) correct++;
        }

        var recall = correct / (double)n;
        // Unimodal states ≥0.94; bimodal Vikshipta oscillates near the basin edge (~0.87).
        Assert.True(recall >= 0.82, $"{state} recall was {recall:F2} (expected ≥ 0.82)");
    }

    [Fact]
    public void AllFiveStates_AreReachable()
    {
        var rng = new Random(99);
        var seen = new HashSet<ChittaBhumi>();
        foreach (var state in AllStates)
            for (var i = 0; i < 200; i++)
                seen.Add(Classifier.Classify(SampleFor(state, rng)).State);

        Assert.Equal(5, seen.Count);
    }

    /// <summary>Draw one synthetic feature sample for a state (shared with GunaMappingTests).</summary>
    public static FeatureSet SampleFor(ChittaBhumi state, Random rng)
    {
        if (state == ChittaBhumi.Vikshipta)
            return Sample(rng.NextDouble() < VikshiptaDesyncWeight ? VikshiptaDesync : VikshiptaAbsorption, rng);
        return Sample(Profiles[state], rng);
    }

    private static FeatureSet Sample(Profile p, Random rng)
    {
        double B(double m, double s) => Math.Clamp(m + s * Gaussian(rng), 0.01, 0.99);
        var delta = B(p.DeltaM, p.DeltaS);
        var theta = B(p.ThetaM, p.ThetaS);
        var alpha = B(p.AlphaM, p.AlphaS);
        var lowBeta = B(p.LowBetaM, p.LowBetaS);
        var highBeta = B(p.HighBetaM, p.HighBetaS);
        var gamma = B(p.GammaM, p.GammaS);
        var faa = Math.Clamp(p.FaaM + p.FaaS * Gaussian(rng), -2.0, 2.0);
        var plv = Math.Clamp(p.PlvM + p.PlvS * Gaussian(rng), 0.0, 1.0);

        var relative = new BandPowers(delta, theta, alpha, lowBeta, highBeta, gamma).Normalized();
        return new FeatureSet { BandRelative = relative, Faa = faa, Plv = plv };
    }

    private static double Gaussian(Random rng)
    {
        // Box–Muller transform.
        var u1 = 1.0 - rng.NextDouble();
        var u2 = 1.0 - rng.NextDouble();
        return Math.Sqrt(-2.0 * Math.Log(u1)) * Math.Cos(2.0 * Math.PI * u2);
    }

    private sealed record Profile(
        double DeltaM, double DeltaS, double ThetaM, double ThetaS,
        double AlphaM, double AlphaS, double LowBetaM, double LowBetaS,
        double HighBetaM, double HighBetaS, double GammaM, double GammaS,
        double FaaM, double FaaS, double PlvM, double PlvS);
}
