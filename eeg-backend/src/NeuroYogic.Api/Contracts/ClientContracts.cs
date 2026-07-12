using System.Text.Json.Serialization;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Contracts;

/// <summary>Cohort client shape — mirrors the eeg-ui `mapClient`.</summary>
public sealed class ClientDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("ownerId")] public Guid OwnerId { get; set; }
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("age")] public int? Age { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("goal")] public string? Goal { get; set; }
    [JsonPropertyName("protocol")] public string? Protocol { get; set; }
    [JsonPropertyName("notes")] public string Notes { get; set; } = string.Empty;
    [JsonPropertyName("archived")] public bool Archived { get; set; }
    [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    [JsonPropertyName("sessionsCount")] public int SessionsCount { get; set; }
    [JsonPropertyName("lastSessionAt")] public DateTimeOffset? LastSessionAt { get; set; }
    [JsonPropertyName("linkedUserId")] public Guid? LinkedUserId { get; set; }
    [JsonPropertyName("linkedUsername")] public string? LinkedUsername { get; set; }

    public static ClientDto From(Client c, int sessionsCount, DateTimeOffset? lastSessionAt, string? linkedUsername) => new()
    {
        Id = c.Id,
        OwnerId = c.OwnerId,
        Name = c.Name,
        Age = c.Age,
        Email = c.Email,
        Status = c.Status,
        Goal = c.Goal,
        Protocol = c.Protocol,
        Notes = c.Notes,
        Archived = c.Archived,
        CreatedAt = c.CreatedAt,
        SessionsCount = sessionsCount,
        LastSessionAt = lastSessionAt,
        LinkedUserId = c.UserId,
        LinkedUsername = linkedUsername,
    };
}

public sealed class CreateClientRequest
{
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
}

public sealed class UpdateClientRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("age")] public int? Age { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("goal")] public string? Goal { get; set; }
    [JsonPropertyName("protocol")] public string? Protocol { get; set; }
    [JsonPropertyName("notes")] public string? Notes { get; set; }
    [JsonPropertyName("archived")] public bool? Archived { get; set; }
}
