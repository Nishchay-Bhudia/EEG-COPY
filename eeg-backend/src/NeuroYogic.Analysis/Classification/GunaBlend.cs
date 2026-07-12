using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Analysis.Classification;

/// <summary>
/// Describes a Sattva/Rajas/Tamas triad as one of the 10 canonical combos
/// (3 pure + 6 predominant→secondary blends + 1 equilibrium). Single source of
/// truth for guna labelling, shared by the per-epoch classifier and the
/// session-level trend. Kept in lock-step with the Python
/// <c>satva_classifier.describe_gunas</c>.
/// </summary>
public static class GunaBlend
{
    /// <summary>Top − bottom below this ⇒ equilibrium (triguṇa-sāmya).</summary>
    public const double SamaBand = 0.12;

    /// <summary>Secondary ≥ this × predominant ⇒ name the secondary.</summary>
    public const double BlendRatio = 0.50;

    public sealed record Description(string Label, Guna? Dominant, Guna? Secondary);

    public static Description Describe(double sattva, double rajas, double tamas)
    {
        var ranked = new[]
        {
            (Guna: Guna.Sattva, V: sattva),
            (Guna: Guna.Rajas, V: rajas),
            (Guna: Guna.Tamas, V: tamas),
        };
        // Stable descending sort (ties keep Sattva, Rajas, Tamas order — matches Python).
        Array.Sort(ranked, (a, b) => b.V.CompareTo(a.V));
        var (g1, v1) = ranked[0];
        var (g2, _) = ranked[1];
        var (_, v3) = ranked[2];

        if (v1 - v3 < SamaBand)
            return new Description("Balanced (all three)", null, null);

        if (ranked[1].V >= BlendRatio * v1)
            return new Description($"{Adjective(g1)}-predominant, {Adjective(g2)}-secondary", g1, g2);

        return new Description(Adjective(g1), g1, null);
    }

    public static string Note(Description d)
    {
        if (d.Dominant is null)
            return "The three Gunas are in equilibrium (triguṇa-sāmya) — a poised, " +
                   "transitional state, an ideal threshold into deeper meditation.";

        var note = d.Dominant switch
        {
            Guna.Sattva => "Sattva — the mind is luminous, calm, and self-regulated (elevated alpha " +
                           "synchrony, parasympathetic tone). Optimal for contemplative practice.",
            Guna.Rajas => "Rajas — high-beta (18-30 Hz) prefrontal activity: active, driven, " +
                          "outward-directed, sympathetically engaged. Nadi Shodhana can settle it.",
            Guna.Tamas => "Tamas — elevated waking delta: heaviness, cognitive fog, low arousal. " +
                          "Stimulating pranayama (Kapalabhati, Bhastrika) can lift the state.",
            _ => string.Empty,
        };
        if (d.Secondary is { } sec)
            note += $" A secondary current of {sec} is also present — the blend, " +
                    "not a single quality, characterises this moment.";
        return note;
    }

    private static string Adjective(Guna g) => g switch
    {
        Guna.Sattva => "Sattvic",
        Guna.Rajas => "Rajasic",
        Guna.Tamas => "Tamasic",
        _ => g.ToString(),
    };
}
