using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Enums;
using Xunit;

namespace NeuroYogic.Analysis.Tests;

/// <summary>
/// Guards the per-epoch (band-driven) guna mapping. Four states have an
/// unambiguous band signature that implies a predominant guna: Mudha→Tamas,
/// Kshipta→Rajas, Ekagra→Sattva, Niruddha→Sattva. Vikshipta is intentionally
/// excluded — it oscillates, so its per-epoch guna genuinely varies and its
/// classical Rajas character is a session-level trend, not a per-epoch rule
/// (see scripts/eval_gunas.py and SessionSummaryDto.GunaTrend).
/// </summary>
public class GunaMappingTests
{
    private static readonly GunaClassifier Gunas = new();

    [Theory]
    [InlineData(ChittaBhumi.Mudha, Guna.Tamas)]
    [InlineData(ChittaBhumi.Kshipta, Guna.Rajas)]
    [InlineData(ChittaBhumi.Ekagra, Guna.Sattva)]
    [InlineData(ChittaBhumi.Niruddha, Guna.Sattva)]
    public void UnambiguousStates_MapToPredominantGuna_ByMajority(ChittaBhumi state, Guna expected)
    {
        var rng = new Random(4321 + (int)state);
        const int n = 500;
        var matches = 0;
        for (var i = 0; i < n; i++)
        {
            var f = ClassifierRecallTests.SampleFor(state, rng);
            var swara = SwaraFromFaa(f.Faa);
            var g = Gunas.Classify(f.BandRelative, f.Faa, f.Plv, state, swara);
            if (g.Dominant == expected) matches++;
        }

        var share = matches / (double)n;
        Assert.True(share >= 0.80,
            $"{state} predominant guna was {expected} in only {share:P0} of samples (expected ≥ 80%)");
    }

    [Fact]
    public void Vikshipta_OscillatesPerEpoch_AndSurfacesRajasAtSessionLevel()
    {
        var rng = new Random(777);
        const int n = 800;
        var sattvicEpochs = 0;
        var rajasicEpochs = 0;
        double mS = 0, mR = 0, mT = 0;

        for (var i = 0; i < n; i++)
        {
            var f = ClassifierRecallTests.SampleFor(ChittaBhumi.Vikshipta, rng);
            var g = Gunas.Classify(f.BandRelative, f.Faa, f.Plv, ChittaBhumi.Vikshipta, SwaraFromFaa(f.Faa));
            if (g.Dominant == Guna.Sattva) sattvicEpochs++;
            if (g.Dominant == Guna.Rajas) rajasicEpochs++;
            mS += g.Sattva; mR += g.Rajas; mT += g.Tamas;
        }
        mS /= n; mR /= n; mT /= n;

        // Per-epoch genuinely oscillates: both sāttvic bursts and rājasic desyncs occur.
        Assert.True(sattvicEpochs > 0 && rajasicEpochs > 0,
            $"Vikshipta did not oscillate: sattvic={sattvicEpochs}, rajasic={rajasicEpochs}");
        Assert.True(rajasicEpochs >= 0.20 * n,
            $"Too few rajasic desync epochs ({rajasicEpochs}/{n}) — oscillation too weak.");

        // Session-level trend surfaces Rajas as at least the secondary current.
        var trend = GunaBlend.Describe(mS, mR, mT);
        Assert.True(trend.Dominant == Guna.Rajas || trend.Secondary == Guna.Rajas,
            $"Session trend {trend.Label} (S/R/T {mS:F2}/{mR:F2}/{mT:F2}) does not surface Rajas.");
    }

    private static SwaraNadi SwaraFromFaa(double faa) =>
        faa < -0.15 ? SwaraNadi.Ida : faa > 0.15 ? SwaraNadi.Pingala : SwaraNadi.Sushumna;
}
