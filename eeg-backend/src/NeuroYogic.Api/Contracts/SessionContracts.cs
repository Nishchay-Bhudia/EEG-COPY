using System.Text.Json.Serialization;
using NeuroYogic.Analysis.Classification;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Contracts;

public sealed class StartSessionRequest
{
    [JsonPropertyName("label")] public string? Label { get; set; }
}

public sealed class AddProbeRequest
{
    [JsonPropertyName("depth_rating")] public int DepthRating { get; set; }
    [JsonPropertyName("confidence")] public int? Confidence { get; set; }
    /// <summary>"probe" (prompted) or "emerge" (spontaneous). Defaults to probe.</summary>
    [JsonPropertyName("kind")] public string? Kind { get; set; }
}

public sealed class ProbeDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("timestamp")] public DateTimeOffset Timestamp { get; set; }
    [JsonPropertyName("depth_rating")] public int DepthRating { get; set; }
    [JsonPropertyName("confidence")] public int Confidence { get; set; }
    [JsonPropertyName("kind")] public string Kind { get; set; } = "probe";

    public static ProbeDto From(DepthProbe p) => new()
    {
        Id = p.Id,
        Timestamp = p.Timestamp,
        DepthRating = p.DepthRating,
        Confidence = p.Confidence,
        Kind = p.Kind.ToString().ToLowerInvariant(),
    };
}

public sealed class SessionSummaryDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("label")] public string? Label { get; set; }
    [JsonPropertyName("started_at")] public DateTimeOffset StartedAt { get; set; }
    [JsonPropertyName("ended_at")] public DateTimeOffset? EndedAt { get; set; }
    [JsonPropertyName("epoch_count")] public int EpochCount { get; set; }
    [JsonPropertyName("mean_sattva")] public double MeanSattva { get; set; }
    [JsonPropertyName("mean_rajas")] public double MeanRajas { get; set; }
    [JsonPropertyName("mean_tamas")] public double MeanTamas { get; set; }
    [JsonPropertyName("mean_depth_score")] public double MeanDepthScore { get; set; }

    /// <summary>
    /// The session's characteristic guna — the blend of the mean S/R/T across all
    /// epochs. This is where a bhumi's classical guna trend legitimately emerges
    /// (the temporal average over the oscillation), rather than per epoch.
    /// </summary>
    [JsonPropertyName("guna_trend")] public string GunaTrend { get; set; } = string.Empty;

    public static SessionSummaryDto From(MeditationSession s)
    {
        var trend = s.EpochCount > 0
            ? GunaBlend.Describe(s.MeanSattva, s.MeanRajas, s.MeanTamas).Label
            : "—";
        return new SessionSummaryDto
        {
            Id = s.Id,
            Label = s.Label,
            StartedAt = s.StartedAt,
            EndedAt = s.EndedAt,
            EpochCount = s.EpochCount,
            MeanSattva = s.MeanSattva,
            MeanRajas = s.MeanRajas,
            MeanTamas = s.MeanTamas,
            MeanDepthScore = s.MeanDepthScore,
            GunaTrend = trend,
        };
    }
}

public sealed class WatchTokenDto
{
    /// <summary>The raw watch token — shown ONCE, conveyed out-of-band to the instructor.</summary>
    [JsonPropertyName("watch_token")] public string WatchToken { get; set; } = string.Empty;
    [JsonPropertyName("expires_at")] public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class SessionDetailDto
{
    [JsonPropertyName("session")] public SessionSummaryDto Session { get; set; } = new();
    [JsonPropertyName("records")] public IReadOnlyList<RecordDto> Records { get; set; } = Array.Empty<RecordDto>();
}

public sealed class RecordDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("timestamp")] public DateTimeOffset Timestamp { get; set; }
    [JsonPropertyName("chitta_bhumi")] public string ChittaBhumi { get; set; } = string.Empty;
    [JsonPropertyName("chitta_confidence")] public double ChittaConfidence { get; set; }
    [JsonPropertyName("depth")] public string Depth { get; set; } = string.Empty;
    [JsonPropertyName("swara")] public string Swara { get; set; } = string.Empty;
    [JsonPropertyName("sattva")] public double Sattva { get; set; }
    [JsonPropertyName("rajas")] public double Rajas { get; set; }
    [JsonPropertyName("tamas")] public double Tamas { get; set; }
    [JsonPropertyName("vritti_index")] public double VrittiIndex { get; set; }
    [JsonPropertyName("contemplative_depth_score")] public double ContemplativeDepthScore { get; set; }
    [JsonPropertyName("faa")] public double Faa { get; set; }
    [JsonPropertyName("plv")] public double Plv { get; set; }

    public static RecordDto From(AnalysisRecord r) => new()
    {
        Id = r.Id,
        Timestamp = r.Timestamp,
        ChittaBhumi = r.ChittaBhumi.ToString(),
        ChittaConfidence = r.ChittaConfidence,
        Depth = r.ContemplativeDepth,
        Swara = r.Swara.ToString(),
        Sattva = r.Sattva,
        Rajas = r.Rajas,
        Tamas = r.Tamas,
        VrittiIndex = r.VrittiIndex,
        ContemplativeDepthScore = r.ContemplativeDepthScore,
        Faa = r.Faa,
        Plv = r.Plv,
    };
}
