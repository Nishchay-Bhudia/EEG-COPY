using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Persistence;
using NeuroYogic.Infrastructure.Services;
using Xunit;

namespace NeuroYogic.Api.Tests;

/// <summary>
/// Service-level tests for the watch-token consent grant: expiry, session-binding,
/// revocation, and the hash-only storage guarantee. Uses a real (in-memory SQLite)
/// DbContext and a controllable clock so time-based rules are exercised directly.
/// </summary>
public sealed class WatchTokenServiceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly NeuroYogicDbContext _db;
    private readonly MutableClock _clock = new(DateTimeOffset.Parse("2026-07-11T08:00:00Z"));

    public WatchTokenServiceTests()
    {
        _conn = new SqliteConnection("Filename=:memory:");
        _conn.Open();
        _db = new NeuroYogicDbContext(
            new DbContextOptionsBuilder<NeuroYogicDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    private (Guid sessionId, Guid userId) SeedSession()
    {
        var userId = Guid.NewGuid();
        _db.Users.Add(new User
        {
            Id = userId, Email = $"{userId:N}@t.dev", DisplayName = "S", PasswordHash = "x",
        });
        var session = new MeditationSession { UserId = userId, StartedAt = _clock.GetUtcNow() };
        _db.Sessions.Add(session);
        _db.SaveChanges();
        return (session.Id, userId);
    }

    [Fact]
    public async Task Mint_StoresOnlyHash_AndValidatesRawToken()
    {
        var (sessionId, userId) = SeedSession();
        var svc = new WatchTokenService(_db, _clock);

        var minted = await svc.MintAsync(sessionId, userId);
        Assert.NotNull(minted);
        var raw = minted!.Value.rawToken;

        // The raw token is never persisted — only its SHA-256 hash.
        var stored = await _db.WatchTokens.SingleAsync();
        Assert.NotEqual(raw, stored.TokenHash);
        Assert.DoesNotContain(raw, stored.TokenHash);
        Assert.Equal(64, stored.TokenHash.Length); // SHA-256 hex

        Assert.True(await svc.IsValidAsync(sessionId, raw));
    }

    [Fact]
    public async Task Mint_ForeignSession_ReturnsNull()
    {
        var (sessionId, _) = SeedSession();
        var svc = new WatchTokenService(_db, _clock);
        Assert.Null(await svc.MintAsync(sessionId, Guid.NewGuid())); // not the owner
    }

    [Fact]
    public async Task ExpiredToken_IsInvalid()
    {
        var (sessionId, userId) = SeedSession();
        var svc = new WatchTokenService(_db, _clock);
        var raw = (await svc.MintAsync(sessionId, userId))!.Value.rawToken;

        _clock.Advance(TimeSpan.FromMinutes(61)); // past the 60-min TTL
        Assert.False(await svc.IsValidAsync(sessionId, raw));
    }

    [Fact]
    public async Task WrongSessionToken_IsInvalid()
    {
        var (sessionA, userId) = SeedSession();
        var raw = (await new WatchTokenService(_db, _clock).MintAsync(sessionA, userId))!.Value.rawToken;

        var (sessionB, _) = SeedSession();
        // A token minted for session A must not validate against session B.
        Assert.False(await new WatchTokenService(_db, _clock).IsValidAsync(sessionB, raw));
    }

    [Fact]
    public async Task RevokedToken_IsInvalid()
    {
        var (sessionId, userId) = SeedSession();
        var svc = new WatchTokenService(_db, _clock);
        var raw = (await svc.MintAsync(sessionId, userId))!.Value.rawToken;

        Assert.True(await svc.RevokeAsync(sessionId, userId));
        Assert.False(await svc.IsValidAsync(sessionId, raw));
    }

    [Fact]
    public async Task IsValid_WithRedeemer_RecordsAuditOnce()
    {
        var (sessionId, userId) = SeedSession();
        var svc = new WatchTokenService(_db, _clock);
        var raw = (await svc.MintAsync(sessionId, userId))!.Value.rawToken;

        var instructor = Guid.NewGuid();
        Assert.True(await svc.IsValidAsync(sessionId, raw, instructor));
        var tok = await _db.WatchTokens.SingleAsync();
        Assert.Equal(instructor, tok.RedeemedByUserId);
        Assert.NotNull(tok.RedeemedAt);

        // A second redeemer does not overwrite the recorded audit.
        Assert.True(await svc.IsValidAsync(sessionId, raw, Guid.NewGuid()));
        var again = await _db.WatchTokens.SingleAsync();
        Assert.Equal(instructor, again.RedeemedByUserId);
    }

    public void Dispose()
    {
        _db.Dispose();
        _conn.Dispose();
    }

    /// <summary>A TimeProvider whose "now" can be set and advanced within a test.</summary>
    private sealed class MutableClock : TimeProvider
    {
        private DateTimeOffset _now;
        public MutableClock(DateTimeOffset start) => _now = start;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }
}
