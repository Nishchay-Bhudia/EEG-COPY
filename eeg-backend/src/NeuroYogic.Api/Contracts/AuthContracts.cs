using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace NeuroYogic.Api.Contracts;

public sealed class RegisterRequest
{
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }

    [Required, MinLength(8)]
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;

    [JsonPropertyName("display_name")] public string DisplayName { get; set; } = string.Empty;
}

public sealed class LoginRequest
{
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }

    [Required]
    [JsonPropertyName("password")] public string Password { get; set; } = string.Empty;
}

public sealed class AuthResponse
{
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
    [JsonPropertyName("expires_at")] public DateTimeOffset ExpiresAt { get; set; }
    [JsonPropertyName("user_id")] public Guid UserId { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }
    [JsonPropertyName("display_name")] public string DisplayName { get; set; } = string.Empty;
    [JsonPropertyName("role")] public string Role { get; set; } = "user";
}

/// <summary>Current-user shape for GET /auth/me — mirrors the eeg-ui `/auth/me`.</summary>
public sealed class MeResponse
{
    [JsonPropertyName("id")] public Guid Id { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("display_name")] public string DisplayName { get; set; } = string.Empty;
    [JsonPropertyName("role")] public string Role { get; set; } = "user";
}
