using System.Text.Json.Serialization;
using NeuroYogic.Domain.Entities;

namespace NeuroYogic.Api.Contracts;

/// <summary>Account shape for the admin Users view — mirrors the eeg-ui `mapUser`.</summary>
public sealed class UserDto
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }
    [JsonPropertyName("role")] public string Role { get; set; } = "user";
    [JsonPropertyName("createdAt")] public DateTimeOffset CreatedAt { get; set; }

    public static UserDto From(User u) => new()
    {
        Id = u.Id,
        Username = u.Username,
        Role = u.Role,
        CreatedAt = u.CreatedAt,
    };
}

public sealed class CreateUserRequest
{
    [JsonPropertyName("username")] public string Username { get; set; } = string.Empty;
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
    [JsonPropertyName("role")] public string Role { get; set; } = "user";
}

public sealed class ChangeRoleRequest
{
    [JsonPropertyName("role")] public string Role { get; set; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
}
