namespace NeuroYogic.Domain.Entities;

/// <summary>
/// A meditation session — a bounded window of time during which a user streams
/// EEG epochs. Aggregates the per-epoch <see cref="AnalysisRecord"/>s.
/// </summary>
public sealed class MeditationSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User? User { get; set; }

    /// <summary>The cohort client this sitting is bound to, if any (instructor view).</summary>
    public Guid? ClientId { get; set; }

    /// <summary>The contemplative practice performed (free text; from the picker).</summary>
    public string? Activity { get; set; }

    public string? Label { get; set; }

    /// <summary>Free-text instructor/self notes for the sitting (one blob per session).</summary>
    public string Notes { get; set; } = string.Empty;

    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>Number of epochs analysed in this session.</summary>
    public int EpochCount { get; set; }

    /// <summary>Rolling mean sattva/rajas/tamas across the session (0..1).</summary>
    public double MeanSattva { get; set; }
    public double MeanRajas { get; set; }
    public double MeanTamas { get; set; }

    /// <summary>Rolling mean continuous contemplative-depth score across the session (0..1).</summary>
    public double MeanDepthScore { get; set; }

    public ICollection<AnalysisRecord> Records { get; set; } = new List<AnalysisRecord>();

    /// <summary>Self-reported depth labels captured during this session (Phase 4a).</summary>
    public ICollection<DepthProbe> Probes { get; set; } = new List<DepthProbe>();

    /// <summary>Live-watch grants minted for this session (instructor live-streaming).</summary>
    public ICollection<SessionWatchToken> WatchTokens { get; set; } = new List<SessionWatchToken>();
}
