using System.Globalization;
using NeuroYogic.Domain.Analysis;
using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Analysis.Classification;

/// <summary>Produces the full Vedantic interpretation from an EEG feature set.</summary>
public interface IVedanticAnalyzer
{
    VedanticReading Analyze(FeatureSet features, ChittaClassification chitta);
}

/// <summary>
/// Faithful port of the Python <c>vedantic_logic</c>: Swara/Nadi from Frontal
/// Alpha Asymmetry, Tattva/Chakra flags, contemplative depth, and Gunas.
/// </summary>
public sealed class VedanticAnalyzer : IVedanticAnalyzer
{
    private const double FaaIdaThreshold = -0.15;
    private const double FaaPingalaThreshold = 0.15;

    private const double GammaThreshold = 0.12;
    private const double ThetaPratyahara = 0.25;
    private const double HighBetaLow = 0.10;
    private const double DeltaSurge = 0.35;
    private const double PlvCoherence = 0.80;

    private readonly IGunaClassifier _gunas;

    public VedanticAnalyzer(IGunaClassifier gunas) => _gunas = gunas;

    public VedanticReading Analyze(FeatureSet features, ChittaClassification chitta)
    {
        var bhumi = chitta.State;
        var swara = ClassifySwara(features.Faa);
        var flags = DetectTattvaFlags(features);
        var depth = DepthFor(bhumi);
        var gunas = _gunas.Classify(features.BandRelative, features.Faa, features.Plv, bhumi, swara.Nadi);
        var vritti = VrittiIndex(features.BandRelative, features.Plv);
        var nirodha = NirodhaState(vritti);
        var classicalGuna = ClassicalGunaFor(bhumi);
        var depthScore = DepthScore(features.BandRelative, features.Plv, vritti);
        var corroboration = Corroborate(features, bhumi, chitta.Margin);
        return new VedanticReading(swara, flags, depth, gunas, vritti, nirodha, classicalGuna, depthScore, corroboration);
    }

    /// <summary>
    /// Continuous contemplative depth in [0,1]: a transparent weighted blend of
    /// alpha, stillness (1−vṛtti), interhemispheric coherence, Fm-θ, and gamma.
    /// Bands+PLV+vṛtti only, so identical on the raw and band-power paths.
    /// Weights are provisional pending Phase 4b label-fitting.
    /// </summary>
    private static double DepthScore(BandPowers br, double plv, double vritti)
    {
        var raw = 0.30 * br.Alpha + 0.25 * (1.0 - vritti) + 0.20 * plv
                  + 0.15 * br.Theta + 0.10 * br.Gamma;
        return Math.Clamp(raw, 0.0, 1.0);
    }

    /// <summary>
    /// The fixed classical guna doctrine for each bhūmi (a temporal average). This
    /// deliberately does NOT override the per-epoch measured <c>GunaProfile</c> —
    /// Vikshipta's doctrinal Rajas coexists with its Sattvic-predominant measured blend.
    /// </summary>
    private static string ClassicalGunaFor(ChittaBhumi chitta) => chitta switch
    {
        ChittaBhumi.Mudha => "Tamas",
        ChittaBhumi.Kshipta => "Rajas",
        ChittaBhumi.Vikshipta => "Rajas",
        ChittaBhumi.Ekagra => "Sattva",
        ChittaBhumi.Niruddha => "Sattva",
        _ => "Rajas",
    };

    /// <summary>
    /// Citta-vṛtti activity (YS 1.2): frontal high-beta desynchronisation is the
    /// rajasic-chatter marker; interhemispheric coherence (PLV) reflects settling.
    /// 0 = still (nirodha), 1 = scattered (vikṣepa). Measures agitation, not
    /// dullness — tamasic Mudha reads low, like sattvic stillness.
    /// </summary>
    private static double VrittiIndex(BandPowers br, double plv)
    {
        var raw = 1.6 * br.HighBeta + 0.35 * (1.0 - plv) - 0.15;
        return Math.Clamp(raw, 0.0, 1.0);
    }

    private static string NirodhaState(double vritti) =>
        vritti < 0.20 ? "Nirodha (still)"
        : vritti < 0.45 ? "Settling"
        : vritti < 0.70 ? "Active"
        : "Vikshepa (scattered)";

    // ── Corroboration: Western neuromarkers as SIGNED evidence under the bhūmi ──
    // Faithful port of the Python vedantic_logic.corroborate. Each axis either
    // backs the śāstric label or registers tension with it; only signals already
    // computed upstream are used (no new DSP), so axes whose inputs are absent on
    // the /analyze/bands path are omitted. Neural complexity is the key
    // discriminator the bhūmi's band-power features cannot supply: it separates
    // low-arousal dullness (low complexity) from low-arousal absorption.

    // Margin below which a KEY-axis dissent softens the bhūmi to indeterminate —
    // distinct from ChittaClassification.IndeterminateMargin (a different signal).
    private const double CorroborationMargin = 0.15;

    private Corroboration Corroborate(FeatureSet f, ChittaBhumi bhumi, double margin)
    {
        var br = f.BandRelative;
        var vritti = VrittiIndex(br, f.Plv);
        var axes = new List<CorroborationAxis>();

        // Axis 1: Neural complexity (richness of conscious content).
        var rich = Richness(f.Complexity);
        if (rich is { } r)
        {
            var level = r < 0.33 ? "low" : r > 0.60 ? "high" : "moderate";
            var (agrees, note) = ComplexityVerdict(bhumi, level);
            axes.Add(new CorroborationAxis("neural_complexity", $"{level} richness ({Fmt2(r)})", agrees, note));
        }

        // Axis 2: Cortical quietude (aperiodic 1/f exponent → arousal / E–I).
        if (f.Aperiodic is { } ap)
        {
            var level = ap.Exponent < 1.0 ? "flat" : ap.Exponent > 1.5 ? "steep" : "moderate";
            var (agrees, note) = AperiodicVerdict(bhumi, level);
            axes.Add(new CorroborationAxis("cortical_quietude", $"{level} 1/f slope (exponent {Fmt2(ap.Exponent)})", agrees, note));
        }

        // Axis 3: Mental chatter (vṛtti / mind-wandering) — always available.
        var vlevel = vritti < 0.20 ? "low" : vritti > 0.45 ? "high" : "moderate";
        {
            var (agrees, note) = VrittiVerdict(bhumi, vlevel);
            axes.Add(new CorroborationAxis("mental_chatter", $"{vlevel} vṛtti ({Fmt2(vritti)})", agrees, note));
        }

        // Axis 4: Absorption signature (Fm-θ + α, suppressed high-β) — Ekagra only.
        var faPresent = (br.Theta + br.Alpha) > 0.45 && br.HighBeta < 0.15;
        var (aAgrees, aNote) = AbsorptionVerdict(bhumi, faPresent);
        if (aAgrees is not null)
            axes.Add(new CorroborationAxis("absorption_signature", faPresent ? "present" : "absent", aAgrees, aNote));

        // Axis 5: Effortlessness (flow / frontal-β suppression) — deep states only.
        if (bhumi is ChittaBhumi.Ekagra or ChittaBhumi.Niruddha)
        {
            var flowPresent = br.HighBeta < 0.10 && br.LowBeta < 0.15;
            var (fAgrees, fNote) = FlowVerdict(flowPresent);
            axes.Add(new CorroborationAxis("effortlessness", flowPresent ? "effortless" : "effortful", fAgrees, fNote));
        }

        // Concord over the signed axes.
        var dissents = axes.Where(a => a.Agrees == false).ToList();
        var agreed = axes.Where(a => a.Agrees == true).ToList();
        var concord =
            dissents.Count > 0 && dissents.Count >= agreed.Count ? "tension"
            : dissents.Count > 0 ? "mixed"
            : agreed.Count > 0 ? "corroborated"
            : "inconclusive";

        // Soften to indeterminate ONLY on a KEY-axis dissent + a thin margin.
        var keyAxis = bhumi switch
        {
            ChittaBhumi.Mudha or ChittaBhumi.Ekagra or ChittaBhumi.Niruddha => "neural_complexity",
            ChittaBhumi.Kshipta => "mental_chatter",
            _ => null,
        };
        var strongDissent = keyAxis is not null && dissents.Any(d => d.Axis == keyAxis);
        var indeterminate = strongDissent && margin < CorroborationMargin;

        var complexityDissent = dissents.Any(d => d.Axis == "neural_complexity");
        var caveat =
            complexityDissent && bhumi is ChittaBhumi.Ekagra or ChittaBhumi.Niruddha
                ? "Low neural complexity resembles drowsiness (tāmasic Mudha) rather than genuine absorption."
            : complexityDissent && bhumi == ChittaBhumi.Mudha
                ? "The signal retains rich structure — this may be quiet resting awareness rather than inertia."
            : dissents.Count > 0
                ? "Neuromarkers diverge from the śāstric reading."
                : string.Empty;

        return new Corroboration(axes, concord, indeterminate, caveat);
    }

    /// <summary>Collapse the four complexity metrics into a relative richness in
    /// [0,1] (rough expected ranges — a low/moderate/high reading is all this claims).</summary>
    private static double? Richness(ComplexitySet? c)
    {
        if (c is null) return null;
        var parts = new[]
        {
            Math.Clamp(c.Lziv / 1.0, 0.0, 1.0),
            Math.Clamp((c.HiguchiFd - 1.0) / 1.0, 0.0, 1.0),
            Math.Clamp(c.SampleEntropy / 2.0, 0.0, 1.0),
            Math.Clamp(c.PermEntropy, 0.0, 1.0),
        };
        return parts.Average();
    }

    private static (bool?, string) ComplexityVerdict(ChittaBhumi bhumi, string level) => bhumi switch
    {
        ChittaBhumi.Mudha => level switch
        {
            "low" => (true, "low complexity is consistent with tāmasic dullness"),
            "high" => (false, "rich, structured signal — resembles resting awareness more than inertia"),
            _ => ((bool?)null, "richness is higher than a purely inert state would show"),
        },
        ChittaBhumi.Kshipta => level switch
        {
            "high" => (true, "high, unpredictable complexity fits a scattered mind"),
            "low" => (false, "unusually ordered for a scattered state"),
            _ => ((bool?)null, ""),
        },
        ChittaBhumi.Vikshipta => level == "moderate"
            ? (true, "mid-range complexity fits an oscillating mind")
            : ((bool?)null, ""),
        ChittaBhumi.Ekagra or ChittaBhumi.Niruddha => level is "moderate" or "high"
            ? (true, "retained complexity — genuine stillness, not drowsiness")
            : (false, "low complexity resembles drowsiness (tāmasic Mudha), not absorption"),
        _ => ((bool?)null, ""),
    };

    private static (bool?, string) AperiodicVerdict(ChittaBhumi bhumi, string level) => bhumi switch
    {
        ChittaBhumi.Kshipta => level switch
        {
            "flat" => (true, "flat 1/f (cortical excitation) fits hyperarousal"),
            "steep" => (false, "a quiet cortical background is unexpected for agitation"),
            _ => ((bool?)null, ""),
        },
        ChittaBhumi.Ekagra or ChittaBhumi.Niruddha => level switch
        {
            "steep" => (true, "steep 1/f — a quiet, inhibition-weighted cortex"),
            "flat" => (false, "an excitation-weighted background is unexpected for deep absorption"),
            _ => ((bool?)null, ""),
        },
        ChittaBhumi.Mudha => level == "steep"
            ? (true, "steep 1/f fits low-arousal heaviness")
            : ((bool?)null, ""),
        _ => ((bool?)null, ""),
    };

    private static (bool?, string) VrittiVerdict(ChittaBhumi bhumi, string level) => bhumi switch
    {
        ChittaBhumi.Kshipta => level switch
        {
            "high" => (true, "elevated high-β chatter fits Kṣipta"),
            "low" => (false, "unusually quiet for a scattered state"),
            _ => ((bool?)null, ""),
        },
        ChittaBhumi.Ekagra or ChittaBhumi.Niruddha => level switch
        {
            "low" => (true, "stilled fluctuations — citta-vṛtti-nirodha"),
            "high" => (false, "active chatter is at odds with one-pointedness"),
            _ => ((bool?)null, ""),
        },
        ChittaBhumi.Mudha => level == "low"
            ? (true, "low chatter — though dullness and stillness both read low here")
            : ((bool?)null, ""),
        ChittaBhumi.Vikshipta => level is "moderate" or "high"
            ? (true, "some restlessness fits an oscillating mind")
            : ((bool?)null, ""),
        _ => ((bool?)null, ""),
    };

    private static (bool?, string) AbsorptionVerdict(ChittaBhumi bhumi, bool present)
    {
        if (bhumi != ChittaBhumi.Ekagra) return (null, "");
        return present
            ? (true, "Fm-θ + α synchrony — the focused-attention absorption signature")
            : (false, "the one-pointed absorption signature is absent");
    }

    // Frontal-β suppression = transient hypofrontality: effortless absorption
    // (dhyāna) vs effortful holding (dhāraṇā). Deep states only, and informative
    // rather than contradictory — its absence is NOT a dissent.
    private static (bool?, string) FlowVerdict(bool present) => present
        ? ((bool?)true, "effortless — the flow-like signature of dhyāna, not strained holding")
        : ((bool?)null, "focus appears effortful — dhāraṇā-like holding rather than settled flow");

    // Python's f"{x:.2f}" uses round-half-to-even.
    private static string Fmt2(double v) =>
        Math.Round(v, 2, MidpointRounding.ToEven).ToString("0.00", CultureInfo.InvariantCulture);

    // DO NOT TOUCH — Swara/Nadi. Confirmed by real-world testing to be the one
    // reading that's actually accurate. Leave the thresholds and logic below
    // exactly as they are, including during any Chitta Bhumi / Guna rework.
    private static SwaraReading ClassifySwara(double faa)
    {
        var score = faa;
        var mag = Math.Abs(score);
        var signed = score.ToString("+0.00;-0.00", CultureInfo.InvariantCulture);

        if (score < FaaIdaThreshold)
        {
            var conf = mag > 0.40 ? "High" : mag > 0.20 ? "Moderate" : "Low";
            return new SwaraReading(SwaraNadi.Ida, "Ida (Parasympathetic / Lunar)", conf,
                $"Frontal Alpha Asymmetry = {signed} (threshold < {FaaIdaThreshold.ToString(CultureInfo.InvariantCulture)}). " +
                "Right-hemisphere activation detected. Ida nadi: parasympathetic dominance — " +
                "receptive, creative, and introspective. Ideal for Yoga Nidra, Yin practice, " +
                "deep contemplation, and emotional processing.");
        }
        if (score > FaaPingalaThreshold)
        {
            var conf = mag > 0.40 ? "High" : mag > 0.20 ? "Moderate" : "Low";
            return new SwaraReading(SwaraNadi.Pingala, "Pingala (Sympathetic / Solar)", conf,
                $"Frontal Alpha Asymmetry = {signed} (threshold > +{FaaPingalaThreshold.ToString(CultureInfo.InvariantCulture)}). " +
                "Left-hemisphere activation detected. Pingala nadi: sympathetic dominance — " +
                "analytical, goal-directed, and action-oriented. Ideal for Pranayama, " +
                "dynamic Asana, cognitive work, and verbal/logical tasks.");
        }

        var sconf = mag < 0.05 ? "High" : "Moderate";
        return new SwaraReading(SwaraNadi.Sushumna, "Sushumna (Balanced / Central)", sconf,
            $"Frontal Alpha Asymmetry = {signed} — near equilibrium. " +
            "Both hemispheres balanced. Sushumna nadi: autonomic coherence — " +
            "ideal state for deep meditation, Samadhi approach, and unified awareness. " +
            "The gateway to higher contemplative states.");
    }

    private static IReadOnlyList<string> DetectTattvaFlags(FeatureSet f)
    {
        var br = f.BandRelative;
        var gamma = br.Gamma;
        var theta = br.Theta;
        var delta = br.Delta;
        var alpha = br.Alpha;
        var highBeta = br.HighBeta;
        var faa = f.Faa;
        var plv = f.Plv;

        var flags = new List<string>();

        if (gamma > GammaThreshold)
            flags.Add($"Gamma Surge ({Pct(gamma)}%) — Ajna/Sahasrara activation: " +
                      "multi-sensory binding, peak insight, Spanda (divine pulse)");

        if (theta > ThetaPratyahara && highBeta < HighBetaLow)
            flags.Add($"Pratyahara Window — Fm-θ ({Pct(theta)}%) with suppressed " +
                      $"high-beta ({Pct(highBeta)}%): sensory withdrawal, approach to Ekagra");

        if (delta > DeltaSurge && alpha > 0.15)
            flags.Add($"Turiya Approach — Delta ({Pct(delta)}%) + waking Alpha " +
                      $"({Pct(alpha)}%): deep Yoga Nidra or restorative Delta-Alpha " +
                      "healing blend (Svapna-Jagrat boundary)");

        if (plv > PlvCoherence && Math.Abs(faa) < 0.10)
            flags.Add($"Sushumna Activated — PLV {plv.ToString("0.00", CultureInfo.InvariantCulture)} + balanced FAA " +
                      $"({faa.ToString("+0.00;-0.00", CultureInfo.InvariantCulture)}): " +
                      "interhemispheric coherence, unified awareness, Samadhi approach");

        if (highBeta > 0.30)
            flags.Add($"High-Beta Agitation ({Pct(highBeta)}%) — Kshipta tendency: " +
                      "prefrontal hyperarousal. Nadi Shodhana pranayama recommended.");

        if (delta > 0.40 && alpha < 0.10)
            flags.Add($"Tamasic State — Delta surge ({Pct(delta)}%) + absent Alpha " +
                      $"({Pct(alpha)}%): cognitive heaviness / Mudha bhumi. " +
                      "Stimulating pranayama (Kapalabhati) recommended.");

        return flags;
    }

    // Python's f-string ":.0f" uses round-half-to-even.
    private static string Pct(double v) =>
        Math.Round(v * 100.0, MidpointRounding.ToEven).ToString("0", CultureInfo.InvariantCulture);

    private static string DepthFor(ChittaBhumi chitta) => chitta switch
    {
        ChittaBhumi.Mudha => "Deep Inertia",
        ChittaBhumi.Kshipta => "Surface",
        ChittaBhumi.Vikshipta => "Emerging",
        ChittaBhumi.Ekagra => "Deep",
        ChittaBhumi.Niruddha => "Profound",
        _ => "Surface",
    };
}
