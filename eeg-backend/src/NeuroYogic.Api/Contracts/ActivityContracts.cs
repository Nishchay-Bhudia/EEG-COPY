using System.Text.Json.Serialization;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Contracts;

/// <summary>Wire shape for a practice type — mirrors the eeg-ui `mapActivity`.</summary>
public sealed class ActivityDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("sortOrder")] public int SortOrder { get; set; }
    [JsonPropertyName("archived")] public bool Archived { get; set; }

    public static ActivityDto From(ActivityType a) => new()
    {
        Id = a.Id,
        Name = a.Name,
        SortOrder = a.SortOrder,
        Archived = a.Archived,
    };
}

public sealed class CreateActivityRequest
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("sortOrder")] public int? SortOrder { get; set; }
}

public sealed class UpdateActivityRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("sortOrder")] public int? SortOrder { get; set; }
    [JsonPropertyName("archived")] public bool? Archived { get; set; }
}
