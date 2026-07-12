using NeuroYogic.Domain.Analysis;
using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Analysis.Classification;

/// <summary>Classifies an EEG epoch into one of the five Chitta Bhumis.</summary>
public interface IYogaClassifier
{
    ChittaClassification Classify(FeatureSet features);
}

/// <summary>
/// Rule-based, paper-aligned Chitta Bhumi classifier — a faithful port of the
/// Python <c>yoga_classifier._rule_classify</c>. Each state receives a fuzzy
/// score from paper-derived EEG thresholds; scores are normalised to
/// probabilities and the highest wins.
/// </summary>
public sealed class YogaClassifier : IYogaClassifier
{
    private static double Relu(double x) => Math.Max(0.0, x);

    public ChittaClassification Classify(FeatureSet features)
    {
        var br = features.BandRelative;
        var delta = br.Delta;
        var theta = br.Theta;
        var alpha = br.Alpha;
        var gamma = br.Gamma;
        var highBeta = br.HighBeta;
        var lowBeta = br.LowBeta;
        var betaTotal = highBeta + lowBeta;

        var faa = features.Faa;
        var plv = features.Plv;

        var scores = new Dictionary<ChittaBhumi, double>();

        // Tuning note (v3): weights calibrated against the paper-derived state
        // profiles so all five states trigger with high recall (per-state recall
        // ≥ 0.94, ~0.98 overall). Kept in exact lock-step with the Python
        // reference (neuro_yogic/yoga_classifier.py) — see scripts/eval_classifier.py.

        // ── NIRUDDHA (Mastered) — gamma surge AND very high coherence ──
        scores[ChittaBhumi.Niruddha] =
            Relu((gamma - 0.15) * 6.0) +
            Relu((plv - 0.70) * 4.0) +
            Relu((0.10 - highBeta) * 2.0) +
            Relu((0.10 - delta) * 1.0);

        // ── EKAGRA (One-Pointed) — high Fm-θ AND high alpha, no gamma surge ──
        scores[ChittaBhumi.Ekagra] =
            Relu((theta - 0.20) * 4.0) +
            Relu((alpha - 0.28) * 4.0) +
            Relu((0.12 - highBeta) * 2.0) +
            Relu((plv - 0.55) * 1.5) -
            Relu((gamma - 0.15) * 5.0);

        // ── KSHIPTA (Scattered) — high-beta dominance, suppressed alpha ──
        scores[ChittaBhumi.Kshipta] =
            Relu((highBeta - 0.18) * 6.0) +
            Relu((0.15 - alpha) * 2.5) +
            Relu(faa * 1.5) +
            Relu((0.40 - plv) * 1.0) +
            Relu((betaTotal - 0.30) * 0.8);

        // ── MUDHA (Dull / Torpid) — delta dominance, absent alpha/gamma ──
        scores[ChittaBhumi.Mudha] =
            Relu((delta - 0.28) * 6.0) +
            Relu((0.12 - alpha) * 2.5) +
            Relu((0.07 - gamma) * 2.0) +
            Relu((0.45 - plv) * 1.5);

        // ── VIKSHIPTA (Oscillating) — moderate fallback; cedes to the extremes ──
        var alphaMid = Math.Max(0.0, 1.0 - Math.Abs(alpha - 0.24) / 0.10);
        scores[ChittaBhumi.Vikshipta] =
            0.40 +
            1.5 * alphaMid +
            Relu((lowBeta - 0.12) * 0.6) -
            Relu((gamma - 0.15) * 2.0) -
            Relu((highBeta - 0.25) * 2.0) -
            Relu((delta - 0.30) * 2.0);

        // Clamp any negative scores to zero before normalising.
        foreach (var key in scores.Keys.ToList())
            scores[key] = Math.Max(0.0, scores[key]);

        var total = scores.Values.Sum();
        if (total <= 0) total = 1e-10;

        var probs = scores.ToDictionary(
            kv => kv.Key,
            kv => Math.Round(kv.Value / total, 4));

        // Match Python's max(scores, key=...) tie-break: first in insertion order.
        var order = new[]
        {
            ChittaBhumi.Niruddha, ChittaBhumi.Ekagra, ChittaBhumi.Vikshipta,
            ChittaBhumi.Kshipta, ChittaBhumi.Mudha,
        };
        var winner = order[0];
        foreach (var state in order)
            if (scores[state] > scores[winner]) winner = state;

        return new ChittaClassification(winner, probs);
    }
}
