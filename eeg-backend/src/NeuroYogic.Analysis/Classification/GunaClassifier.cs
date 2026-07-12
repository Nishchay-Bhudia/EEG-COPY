using NeuroYogic.Domain.Analysis;
using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Analysis.Classification;

/// <summary>Classifies an EEG epoch into Sattva / Rajas / Tamas proportions.</summary>
public interface IGunaClassifier
{
    GunaProfile Classify(BandPowers bandRelative, double faa, double plv,
        ChittaBhumi? chitta = null, SwaraNadi? swara = null);
}

/// <summary>
/// Paper-aligned Guna scorer — a faithful port of the Python
/// <c>satva_classifier</c>. Rajas is driven by HIGH beta (18-30 Hz) only, the
/// key fix that prevents the old "always Rajas" behaviour.
/// </summary>
public sealed class GunaClassifier : IGunaClassifier
{
    private static double Relu(double x) => Math.Max(0.0, x);

    public GunaProfile Classify(BandPowers br, double faa, double plv,
        ChittaBhumi? chitta = null, SwaraNadi? swara = null)
    {
        var alpha = br.Alpha;
        var theta = br.Theta;
        var delta = br.Delta;
        var gamma = br.Gamma;
        var lowBeta = br.LowBeta;
        var highBeta = br.HighBeta;

        // ── SATTVA ──
        // v4 fix: the coherence bonus used to be flat (plv-0.50)*2.5 regardless
        // of alpha power, so a low-alpha/high-beta reading with a spuriously
        // high PLV could score ~half its Sattva total from coherence alone —
        // confirmed empirically. PLV is measured in the alpha band specifically
        // (FeatureExtractor.ComputePlv), so the bonus is now gated by alpha
        // itself, rescaled to match the old bonus's magnitude at a typical
        // Sattvic alpha (~0.38).
        var sat =
            alpha * 4.5 +
            theta * 2.5 +
            lowBeta * 0.8 +
            Relu(plv - 0.50) * alpha * 7.0 +
            Relu(0.20 - Math.Abs(faa)) * 1.5;

        // ── RAJAS ──
        var raj =
            highBeta * 5.5 +
            Relu(0.20 - alpha) * 2.0 +
            Relu(faa) * 1.8 +
            Relu(gamma - 0.10) * 0.8;

        // ── TAMAS ──
        var tam =
            delta * 4.5 +
            Relu(0.15 - alpha) * 2.5 +
            Relu(0.06 - gamma) * 2.0 +
            Relu(0.45 - plv) * 1.0;

        // ── Chitta Bhumi coupling: intentionally NONE (per-epoch honesty) ──
        // The gunas are the trigunātmaka blend of THIS epoch, read from its
        // measured features — the bhumi LABEL must not override the blend, or
        // legitimate mixed states (triguṇa-sāmya, sattva-pradhāna rājasika) get
        // flattened. A bhumi's characteristic guna is a temporal average and is
        // surfaced at the session level instead. `chitta` is accepted for
        // signature compatibility but unused. See scripts/eval_gunas.py.
        _ = chitta;

        // ── Swara secondary adjustment (FAA-derived, per-epoch) ──
        switch (swara)
        {
            case SwaraNadi.Sushumna:
                sat += 0.20;
                raj = Math.Max(0.0, raj - 0.10);
                break;
            case SwaraNadi.Pingala:
                raj += 0.15;
                sat = Math.Max(0.0, sat - 0.05);
                break;
            case SwaraNadi.Ida:
                if (delta > 0.30) tam += 0.10;
                else sat += 0.08;
                break;
        }

        sat = Math.Max(sat, 0.01);
        raj = Math.Max(raj, 0.01);
        tam = Math.Max(tam, 0.01);
        var totalG = sat + raj + tam;

        var sattva = Math.Round(sat / totalG, 4);
        var rajas = Math.Round(raj / totalG, 4);
        var tamas = Math.Round(tam / totalG, 4);

        var blend = GunaBlend.Describe(sattva, rajas, tamas);
        return new GunaProfile(sattva, rajas, tamas, blend.Label, GunaBlend.Note(blend))
        {
            Dominant = blend.Dominant,
            Secondary = blend.Secondary,
        };
    }
}
