using NeuroYogic.Domain.Enums;

namespace NeuroYogic.Domain.Entities;

/// <summary>
/// A self-reported meditative-depth label captured during a session (the "emerge"
/// experience-sampling protocol, PMC11629179). These are the ground truth that
/// turns the unvalidated depth mappings into a fittable model (Phase 4b): only
/// high-confidence ratings are used for training.
/// </summary>
public sealed class DepthProbe
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public MeditationSession? Session { get; set; }

    public DateTimeOffset Timestamp { get; set; }

    /// <summary>Reported depth, 1 (shallow / foundational) → 5 (deepest / culminative).</summary>
    public int DepthRating { get; set; }

    /// <summary>Rater confidence, 1 → 5. Only &gt;3 is used for training.</summary>
    public int Confidence { get; set; }

    public ProbeKind Kind { get; set; }
}
