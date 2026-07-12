using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Enums;
using Xunit;

namespace NeuroYogic.Analysis.Tests;

/// <summary>
/// Verifies the mixed-guna label scheme covers all 10 canonical combos
/// (3 pure + 6 predominant→secondary blends + 1 equilibrium) and matches the
/// Python reference (scripts/generate_golden_classify.py / describe_gunas).
/// </summary>
public class GunaBlendTests
{
    [Theory]
    // pure (secondary < half of predominant)
    [InlineData(0.80, 0.12, 0.08, "Sattvic", "Sattva", null)]
    [InlineData(0.12, 0.80, 0.08, "Rajasic", "Rajas", null)]
    [InlineData(0.08, 0.12, 0.80, "Tamasic", "Tamas", null)]
    // six ordered two-guna blends
    [InlineData(0.55, 0.32, 0.13, "Sattvic-predominant, Rajasic-secondary", "Sattva", "Rajas")]
    [InlineData(0.55, 0.13, 0.32, "Sattvic-predominant, Tamasic-secondary", "Sattva", "Tamas")]
    [InlineData(0.32, 0.55, 0.13, "Rajasic-predominant, Sattvic-secondary", "Rajas", "Sattva")]
    [InlineData(0.13, 0.55, 0.32, "Rajasic-predominant, Tamasic-secondary", "Rajas", "Tamas")]
    [InlineData(0.32, 0.13, 0.55, "Tamasic-predominant, Sattvic-secondary", "Tamas", "Sattva")]
    [InlineData(0.13, 0.32, 0.55, "Tamasic-predominant, Rajasic-secondary", "Tamas", "Rajas")]
    // equilibrium
    [InlineData(0.34, 0.33, 0.33, "Balanced (all three)", null, null)]
    public void Describe_CoversAllCanonicalCombos(
        double s, double r, double t, string label, string? dominant, string? secondary)
    {
        var d = GunaBlend.Describe(s, r, t);

        Assert.Equal(label, d.Label);
        Assert.Equal(dominant, d.Dominant?.ToString());
        Assert.Equal(secondary, d.Secondary?.ToString());
    }

    [Fact]
    public void EquilibriumBand_IsHonoured_NearEqualTriad()
    {
        // top − bottom just under the 0.12 sama band → equilibrium
        var d = GunaBlend.Describe(0.39, 0.33, 0.28);
        Assert.Null(d.Dominant);
        Assert.Equal("Balanced (all three)", d.Label);
    }

    [Fact]
    public void BlendRatio_Boundary_NamesSecondaryWhenAtLeastHalf()
    {
        // secondary exactly half of predominant → blend
        var blend = GunaBlend.Describe(0.50, 0.25, 0.25);
        Assert.Equal(Guna.Rajas, blend.Secondary); // ties keep Sattva>Rajas>Tamas order

        // secondary just under half → pure
        var pure = GunaBlend.Describe(0.60, 0.22, 0.18);
        Assert.Null(pure.Secondary);
        Assert.Equal("Sattvic", pure.Label);
    }
}
