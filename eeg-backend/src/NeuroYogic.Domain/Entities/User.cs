namespace NeuroYogic.Domain.Entities;

/// <summary>
/// An application account. Identified by <see cref="Username"/> (control-hub
/// logins) or <see cref="Email"/> (self-registered meditators) — at least one is
/// present. Roles use the control-hub vocabulary: admin | co-admin | user.
/// </summary>
public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string? Email { get; set; }
    public string? Username { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "user";
    public DateTimeOffset CreatedAt { get; set; }

    public ICollection<MeditationSession> Sessions { get; set; } = new List<MeditationSession>();
}
