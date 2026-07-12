namespace NeuroYogic.Domain.Entities;

/// <summary>
/// A practitioner in an instructor's cohort. Owned by an instructor
/// (<see cref="OwnerId"/>); optionally linked to a login account
/// (<see cref="UserId"/>) for remote students. Port of the eeg-ui `clients` row.
/// </summary>
public sealed class Client
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The instructor (User) who owns this client record.</summary>
    public Guid OwnerId { get; set; }

    /// <summary>The linked login account (student), if any.</summary>
    public Guid? UserId { get; set; }

    public string Name { get; set; } = string.Empty;
    public int? Age { get; set; }
    public string? Email { get; set; }
    public string? Status { get; set; }          // new | progress | plateau | issue
    public string? Goal { get; set; }
    public string? Protocol { get; set; }
    public DateTimeOffset? ProtocolSince { get; set; }
    public DateTimeOffset? PracticingSince { get; set; }
    public string Notes { get; set; } = string.Empty;
    public bool Archived { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
