using System.Text;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Services;

/// <summary>The AI Baba system prompt, off-topic guard, and session-context
/// builder — ported from the eeg-ui AI endpoints.</summary>
public static class AiPrompts
{
    public const int MaxEpochLines = 400;

    public const string OffTopicReply =
        "I'm AI Baba, and I can only help you understand your EEG session data. I'm not able to answer questions on other topics — ask me something about your brainwaves or meditation session!";

    public const string SystemPrompt = """
You are AI Baba, a wise and compassionate guide specialising in EEG brainwave analysis and yogic science. You help users understand their meditation and mindfulness sessions recorded via an EEG headband.

Your role:
- Analyse the EEG session data provided and explain it in simple, accessible language
- Help users understand their mental states, concentration levels, and energy during their session
- Answer questions about focus, relaxation, brainwave bands, and yogic states

Key concepts:
- Chitta Bhumi: Kshipta (scattered), Vikshipta (oscillating), Ekagra (focused), Niruddha (deeply absorbed)
- Contemplative depth: Surface, Emerging, Deep, Profound
- Swara Nadi: Ida (lunar/parasympathetic), Pingala (solar/sympathetic), Sushumna (balanced)
- Trigunas: Sattva (clarity), Rajas (activity), Tamas (inertia)
- EEG bands: Delta, Theta, Alpha (relaxed), Beta (active), Gamma (peak focus)

Ekagra and Niruddha = concentrated; Kshipta and Vikshipta = not. Higher Alpha = more relaxed. For time-based questions use elapsed_seconds (300s = 5 minutes).

ABSOLUTE RULE: If the question is NOT related to EEG, brainwaves, meditation, mindfulness, yogic states, or the session data, reply with exactly this sentence and nothing else:
"I'm AI Baba, and I can only help you understand your EEG session data. I'm not able to answer questions on other topics — ask me something about your brainwaves or meditation session!"
""";

    private static readonly string[] Keywords =
    {
        "eeg", "brainwave", "alpha", "beta", "theta", "delta", "gamma", "chitta", "kshipta",
        "vikshipta", "ekagra", "niruddha", "concentration", "focus", "meditation", "mindfulness",
        "swara", "ida", "pingala", "sushumna", "sattva", "rajas", "tamas", "guna", "epoch",
        "session", "relaxed", "relaxation", "contemplative", "depth", "profound", "yogic",
        "tattva", "band", "spectral", "neural", "mental", "state", "power", "signal", "frequency",
    };

    public static bool IsEegRelated(string text)
    {
        var lower = text.ToLowerInvariant().Trim();
        if (lower.Length < 20) return true; // short follow-ups inherit context
        return Keywords.Any(k => lower.Contains(k));
    }

    public static string BuildContext(MeditationSession session, IReadOnlyList<AnalysisRecord> epochs)
    {
        var sb = new StringBuilder();
        sb.AppendLine("SESSION DATA:");
        sb.AppendLine($"Name: {session.Label ?? "—"} | Practice: {session.Activity ?? "—"} | Epochs: {epochs.Count}");
        if (epochs.Count > 0)
        {
            sb.AppendLine($"Mean guna — sattva {session.MeanSattva:F2}, rajas {session.MeanRajas:F2}, tamas {session.MeanTamas:F2}");
            sb.AppendLine($"Mean depth score: {session.MeanDepthScore:F2}");
            sb.AppendLine();
            sb.AppendLine("EPOCH LOG (epoch | elapsed_s | bhumi | depth | swara | a/θ):");

            var step = epochs.Count <= MaxEpochLines ? 1 : (int)Math.Ceiling(epochs.Count / (double)MaxEpochLines);
            for (var i = 0; i < epochs.Count; i += step)
            {
                var e = epochs[i];
                var elapsed = e.ElapsedSeconds?.ToString("F0") ?? "?";
                sb.AppendLine($"  {e.EpochNum} | {elapsed}s | {e.ChittaBhumi} | {e.ContemplativeDepth} | {e.Swara} | α{e.AlphaRelative:F2} θ{e.ThetaRelative:F2}");
            }
            if (step > 1) sb.AppendLine($"  (sampled every {step} epochs)");
        }
        return sb.ToString();
    }
}
