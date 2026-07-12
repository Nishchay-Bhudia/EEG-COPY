using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

public sealed record WatchableItem(Guid ClientId, string Name, string? Username, Guid SessionId, DateTimeOffset StartedAt);
public sealed record WatchGrant(Guid SessionId, string WatchToken, string ClientName);

public interface ILiveService
{
    Task StartAsync(Guid userId, Guid sessionId, CancellationToken ct = default);
    Task StopAsync(Guid userId, CancellationToken ct = default);
    Task<IReadOnlyList<WatchableItem>> WatchableAsync(Guid ownerId, bool isAdmin, CancellationToken ct = default);
    Task<(WatchGrant? grant, int status, string? error)> WatchGrantAsync(Guid ownerId, bool isAdmin, Guid clientId, CancellationToken ct = default);
}

/// <summary>
/// The live-streaming registry + instructor watch-grant flow (port of the eeg-ui
/// /live routes). Replaces the Express BFF: authorization is done here against the
/// EF store, and grants are minted directly (no cross-service token brokering).
/// </summary>
public sealed class LiveService : ILiveService
{
    private readonly NeuroYogicDbContext _db;
    private readonly IWatchTokenService _watchTokens;
    private readonly TimeProvider _clock;

    public LiveService(NeuroYogicDbContext db, IWatchTokenService watchTokens, TimeProvider clock)
    {
        _db = db;
        _watchTokens = watchTokens;
        _clock = clock;
    }

    public async Task StartAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
    {
        var existing = await _db.LiveStreams.FirstOrDefaultAsync(l => l.UserId == userId, ct);
        if (existing is null)
            _db.LiveStreams.Add(new LiveStream { UserId = userId, SessionId = sessionId, StartedAt = _clock.GetUtcNow() });
        else
        {
            existing.SessionId = sessionId;
            existing.StartedAt = _clock.GetUtcNow();
        }
        await _db.SaveChangesAsync(ct);
    }

    public async Task StopAsync(Guid userId, CancellationToken ct = default)
    {
        var existing = await _db.LiveStreams.FirstOrDefaultAsync(l => l.UserId == userId, ct);
        if (existing is not null)
        {
            _db.LiveStreams.Remove(existing);
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task<IReadOnlyList<WatchableItem>> WatchableAsync(Guid ownerId, bool isAdmin, CancellationToken ct = default)
    {
        // Clients owned by the instructor, linked to a login that is live right now.
        var q =
            from c in _db.Clients
            where (isAdmin || c.OwnerId == ownerId) && c.UserId != null
            join l in _db.LiveStreams on c.UserId!.Value equals l.UserId
            join u in _db.Users on c.UserId!.Value equals u.Id into uj
            from u in uj.DefaultIfEmpty()
            select new WatchableItem(c.Id, c.Name, u != null ? u.Username : null, l.SessionId, l.StartedAt);
        return await q.ToListAsync(ct);
    }

    public async Task<(WatchGrant? grant, int status, string? error)> WatchGrantAsync(Guid ownerId, bool isAdmin, Guid clientId, CancellationToken ct = default)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == clientId && (isAdmin || c.OwnerId == ownerId), ct);
        if (client is null) return (null, 403, "Forbidden");
        if (client.UserId is null) return (null, 400, "This client is not linked to a login account");

        var live = await _db.LiveStreams.FirstOrDefaultAsync(l => l.UserId == client.UserId.Value, ct);
        if (live is null) return (null, 404, "This student is not live right now");

        var minted = await _watchTokens.MintForSessionAsync(live.SessionId, ct);
        if (minted is null) return (null, 404, "Live session not found");

        return (new WatchGrant(live.SessionId, minted.Value.rawToken, client.Name), 200, null);
    }
}
