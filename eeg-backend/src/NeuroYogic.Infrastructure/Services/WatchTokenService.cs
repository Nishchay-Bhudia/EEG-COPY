using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

/// <summary>
/// Mints, revokes and validates per-session watch tokens — the consent grant that
/// lets an instructor observe a student's live stream. The raw token is returned
/// once at mint time; only its SHA-256 hash is persisted, so a DB leak yields no
/// usable grants. Each token is bound to a single session (no cross-session replay).
/// </summary>
public interface IWatchTokenService
{
    /// <summary>Mint a fresh token for the session. Returns null if the caller doesn't own it.</summary>
    Task<(string rawToken, DateTimeOffset expiresAt)?> MintAsync(Guid sessionId, Guid userId, CancellationToken ct = default);

    /// <summary>
    /// Mint for a session WITHOUT an owner check — the caller has already
    /// authorized (e.g. an instructor granted access to a linked student's live
    /// sitting). Returns null if the session doesn't exist.
    /// </summary>
    Task<(string rawToken, DateTimeOffset expiresAt)?> MintForSessionAsync(Guid sessionId, CancellationToken ct = default);

    /// <summary>Revoke all live tokens for the session. Returns false if the caller doesn't own it.</summary>
    Task<bool> RevokeAsync(Guid sessionId, Guid userId, CancellationToken ct = default);

    /// <summary>
    /// True if <paramref name="rawToken"/> is a live grant for <paramref name="sessionId"/>.
    /// When <paramref name="redeemerId"/> is supplied, records it as the redeeming instructor
    /// (audit) on first successful redemption.
    /// </summary>
    Task<bool> IsValidAsync(Guid sessionId, string rawToken, Guid? redeemerId = null, CancellationToken ct = default);
}

public sealed class WatchTokenService : IWatchTokenService
{
    /// <summary>Grant lifetime. A student may re-mint (a fresh mint issues a new token).</summary>
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(60);

    private readonly NeuroYogicDbContext _db;
    private readonly TimeProvider _clock;

    public WatchTokenService(NeuroYogicDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<(string rawToken, DateTimeOffset expiresAt)?> MintAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        // Ownership check — never trust the session id alone (avoids IDOR).
        var owns = await _db.Sessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (!owns) return null;

        var raw = Base64Url(RandomNumberGenerator.GetBytes(32));
        var now = _clock.GetUtcNow();
        var expiresAt = now.Add(Ttl);
        _db.WatchTokens.Add(new SessionWatchToken
        {
            SessionId = sessionId,
            TokenHash = Sha256Hex(raw),
            CreatedAt = now,
            ExpiresAt = expiresAt,
            CreatedByUserId = userId,
        });
        await _db.SaveChangesAsync(ct);
        return (raw, expiresAt); // raw returned ONCE; DB stores only the hash
    }

    public async Task<(string rawToken, DateTimeOffset expiresAt)?> MintForSessionAsync(Guid sessionId, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null) return null;

        var raw = Base64Url(RandomNumberGenerator.GetBytes(32));
        var now = _clock.GetUtcNow();
        var expiresAt = now.Add(Ttl);
        _db.WatchTokens.Add(new SessionWatchToken
        {
            SessionId = sessionId,
            TokenHash = Sha256Hex(raw),
            CreatedAt = now,
            ExpiresAt = expiresAt,
            CreatedByUserId = session.UserId,   // the student who owns the sitting
        });
        await _db.SaveChangesAsync(ct);
        return (raw, expiresAt);
    }

    public async Task<bool> RevokeAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        var owns = await _db.Sessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (!owns) return false;

        var now = _clock.GetUtcNow();
        var live = await _db.WatchTokens
            .Where(t => t.SessionId == sessionId && t.RevokedAt == null && t.ExpiresAt > now)
            .ToListAsync(ct);
        foreach (var t in live)
            t.RevokedAt = now;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> IsValidAsync(Guid sessionId, string rawToken, Guid? redeemerId = null, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(rawToken)) return false;

        var hash = Sha256Hex(rawToken);
        var now = _clock.GetUtcNow();
        // Bound to THIS session, hash-matched, not revoked, not expired.
        var tok = await _db.WatchTokens.FirstOrDefaultAsync(t =>
            t.SessionId == sessionId && t.TokenHash == hash && t.RevokedAt == null && t.ExpiresAt > now, ct);
        if (tok is null) return false;

        if (redeemerId is { } r && tok.RedeemedByUserId is null)
        {
            tok.RedeemedByUserId = r;
            tok.RedeemedAt = now;
            await _db.SaveChangesAsync(ct);
        }
        return true;
    }

    private static string Sha256Hex(string value) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
