namespace NeuroYogic.Domain.Entities;

/// <summary>
/// A per-session, self-expiring, revocable grant that lets an instructor watch a
/// student's live EEG stream. The student mints one; the raw token is shown once
/// and conveyed out-of-band. Only the SHA-256 hash is ever stored, so a DB leak
/// yields no usable grants. The token is bound to a single <see cref="SessionId"/>,
/// preventing cross-session replay.
/// </summary>
public sealed class SessionWatchToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public MeditationSession? Session { get; set; }

    /// <summary>SHA-256 hex of the raw token. The raw token is never persisted.</summary>
    public string TokenHash { get; set; } = default!;

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>= session.UserId at mint time (the student who granted access). Audit only.</summary>
    public Guid CreatedByUserId { get; set; }

    /// <summary>The authenticated instructor who first redeemed this token (audit trail).</summary>
    public Guid? RedeemedByUserId { get; set; }
    public DateTimeOffset? RedeemedAt { get; set; }
}
