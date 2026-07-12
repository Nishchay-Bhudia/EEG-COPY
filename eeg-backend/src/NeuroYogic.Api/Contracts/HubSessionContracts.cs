using System.Text.Json.Serialization;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Contracts;

/// <summary>Control-hub session shape — mirrors the eeg-ui `mapSession`.</summary>
public sealed class HubSessionDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("userId")] public Guid UserId { get; set; }
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("clientId")] public Guid? ClientId { get; set; }
    [JsonPropertyName("activity")] public string? Activity { get; set; }
    [JsonPropertyName("startTime")] public DateTimeOffset StartTime { get; set; }
    [JsonPropertyName("endTime")] public DateTimeOffset? EndTime { get; set; }
    [JsonPropertyName("duration")] public int? Duration { get; set; }

    public static HubSessionDto From(MeditationSession s) => new()
    {
        Id = s.Id,
        UserId = s.UserId,
        Name = s.Label,
        ClientId = s.ClientId,
        Activity = s.Activity,
        StartTime = s.StartedAt,
        EndTime = s.EndedAt,
        Duration = s.EndedAt is null ? null : (int)Math.Round((s.EndedAt.Value - s.StartedAt).TotalSeconds),
    };
}

public sealed class StartHubSessionRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("client_id")] public Guid? ClientId { get; set; }
    [JsonPropertyName("activity")] public string? Activity { get; set; }
}

// Band/guna values are read leniently (number | "0.37" | null) so the SPA's
// mixed-shape epoch payloads never trigger an [ApiController] auto-400.
public sealed class BandsDto
{
    [JsonPropertyName("delta")][JsonConverter(typeof(LenientDoubleConverter))] public double? Delta { get; set; }
    [JsonPropertyName("theta")][JsonConverter(typeof(LenientDoubleConverter))] public double? Theta { get; set; }
    [JsonPropertyName("alpha")][JsonConverter(typeof(LenientDoubleConverter))] public double? Alpha { get; set; }
    [JsonPropertyName("beta")][JsonConverter(typeof(LenientDoubleConverter))] public double? Beta { get; set; }
    [JsonPropertyName("gamma")][JsonConverter(typeof(LenientDoubleConverter))] public double? Gamma { get; set; }
}

public sealed class EpochGunasDto
{
    [JsonPropertyName("sattva")][JsonConverter(typeof(LenientDoubleConverter))] public double? Sattva { get; set; }
    [JsonPropertyName("rajas")][JsonConverter(typeof(LenientDoubleConverter))] public double? Rajas { get; set; }
    [JsonPropertyName("tamas")][JsonConverter(typeof(LenientDoubleConverter))] public double? Tamas { get; set; }
    [JsonPropertyName("label")] public string? Label { get; set; }
}

/// <summary>An epoch pushed by the Monitor SPA (already analysed client-side).</summary>
public sealed class StoreEpochRequest
{
    [JsonPropertyName("epochNum")] public int EpochNum { get; set; }
    [JsonPropertyName("elapsedSeconds")][JsonConverter(typeof(LenientDoubleConverter))] public double? ElapsedSeconds { get; set; }
    [JsonPropertyName("chittaBhumi")] public string? ChittaBhumi { get; set; }
    [JsonPropertyName("chittaConfidence")][JsonConverter(typeof(LenientDoubleConverter))] public double? ChittaConfidence { get; set; }
    [JsonPropertyName("contemplativeDepth")] public string? ContemplativeDepth { get; set; }
    [JsonPropertyName("swara")] public string? Swara { get; set; }
    [JsonPropertyName("bands")] public BandsDto? Bands { get; set; }
    [JsonPropertyName("gunas")] public EpochGunasDto? Gunas { get; set; }
    [JsonPropertyName("bloodOxygen")][JsonConverter(typeof(LenientDoubleConverter))] public double? BloodOxygen { get; set; }
    [JsonPropertyName("heartRate")][JsonConverter(typeof(LenientDoubleConverter))] public double? HeartRate { get; set; }
}

/// <summary>Read shape for a stored epoch (Replay playback).</summary>
public sealed class EpochDto
{
    [JsonPropertyName("epochNum")] public int EpochNum { get; set; }
    [JsonPropertyName("elapsedSeconds")] public double? ElapsedSeconds { get; set; }
    [JsonPropertyName("recordedAt")] public DateTimeOffset RecordedAt { get; set; }
    [JsonPropertyName("chittaBhumi")] public string ChittaBhumi { get; set; } = string.Empty;
    [JsonPropertyName("chittaConfidence")] public double ChittaConfidence { get; set; }
    [JsonPropertyName("contemplativeDepth")] public string ContemplativeDepth { get; set; } = string.Empty;
    [JsonPropertyName("swara")] public string Swara { get; set; } = string.Empty;
    [JsonPropertyName("bands")] public BandsDto Bands { get; set; } = new();
    [JsonPropertyName("gunas")] public EpochGunasDto Gunas { get; set; } = new();
    [JsonPropertyName("bloodOxygen")] public double? BloodOxygen { get; set; }
    [JsonPropertyName("heartRate")] public double? HeartRate { get; set; }

    public static EpochDto From(AnalysisRecord r) => new()
    {
        EpochNum = r.EpochNum,
        ElapsedSeconds = r.ElapsedSeconds,
        RecordedAt = r.Timestamp,
        ChittaBhumi = r.ChittaBhumi.ToString(),
        ChittaConfidence = r.ChittaConfidence,
        ContemplativeDepth = r.ContemplativeDepth,
        Swara = r.Swara.ToString(),
        Bands = new BandsDto
        {
            Delta = r.DeltaRelative, Theta = r.ThetaRelative, Alpha = r.AlphaRelative,
            Beta = r.BetaRelative, Gamma = r.GammaRelative,
        },
        Gunas = new EpochGunasDto { Sattva = r.Sattva, Rajas = r.Rajas, Tamas = r.Tamas, Label = r.GunaLabel },
        BloodOxygen = r.BloodOxygen,
        HeartRate = r.HeartRate,
    };
}

public sealed class NotesRequest
{
    [JsonPropertyName("content")] public string Content { get; set; } = string.Empty;
}

public sealed class NotesDto
{
    [JsonPropertyName("content")] public string Content { get; set; } = string.Empty;
}

public sealed class RebindClientRequest
{
    [JsonPropertyName("client_id")] public Guid? ClientId { get; set; }
}
