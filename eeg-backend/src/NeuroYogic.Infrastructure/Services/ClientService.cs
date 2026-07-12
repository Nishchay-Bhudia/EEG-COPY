using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

/// <summary>A client with its computed session tallies and linked-login name.</summary>
public sealed record ClientView(Client Client, int SessionsCount, DateTimeOffset? LastSessionAt, string? LinkedUsername);

public sealed record ClientUpdate(
    string? Name, int? Age, string? Email, string? Status, string? Goal,
    string? Protocol, string? Notes, bool? Archived);

public interface IClientService
{
    Task<IReadOnlyList<ClientView>> ListAsync(Guid ownerId, bool isAdmin, bool includeArchived, CancellationToken ct);
    Task<IReadOnlyDictionary<string, List<int>>> DepthSummaryAsync(Guid ownerId, bool isAdmin, CancellationToken ct);
    Task<ClientView?> GetAsync(Guid id, Guid ownerId, bool isAdmin, CancellationToken ct);
    Task<Client> CreateAsync(Guid ownerId, string name, CancellationToken ct);
    Task<ClientView?> UpdateAsync(Guid id, Guid ownerId, bool isAdmin, ClientUpdate update, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, Guid ownerId, bool isAdmin, CancellationToken ct);
}

public sealed class ClientService : IClientService
{
    private readonly NeuroYogicDbContext _db;
    private readonly TimeProvider _clock;

    public ClientService(NeuroYogicDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    private IQueryable<Client> Scoped(Guid ownerId, bool isAdmin) =>
        isAdmin ? _db.Clients : _db.Clients.Where(c => c.OwnerId == ownerId);

    public async Task<IReadOnlyList<ClientView>> ListAsync(Guid ownerId, bool isAdmin, bool includeArchived, CancellationToken ct)
    {
        var clients = await Scoped(ownerId, isAdmin)
            .Where(c => includeArchived || !c.Archived)
            .OrderBy(c => c.Name)
            .ToListAsync(ct);

        return await AttachTallies(clients, ct);
    }

    public async Task<ClientView?> GetAsync(Guid id, Guid ownerId, bool isAdmin, CancellationToken ct)
    {
        var client = await Scoped(ownerId, isAdmin).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return null;
        return (await AttachTallies(new List<Client> { client }, ct))[0];
    }

    // Session tallies + linked-login name, resolved in two set-based queries.
    private async Task<List<ClientView>> AttachTallies(List<Client> clients, CancellationToken ct)
    {
        var ids = clients.Select(c => c.Id).ToList();

        var tallies = await _db.Sessions
            .Where(s => s.ClientId != null && ids.Contains(s.ClientId.Value))
            .GroupBy(s => s.ClientId!.Value)
            .Select(g => new { ClientId = g.Key, Count = g.Count(), Last = g.Max(s => (DateTimeOffset?)s.StartedAt) })
            .ToListAsync(ct);
        var byClient = tallies.ToDictionary(t => t.ClientId);

        var linkedIds = clients.Where(c => c.UserId != null).Select(c => c.UserId!.Value).ToList();
        var usernames = await _db.Users
            .Where(u => linkedIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Username })
            .ToListAsync(ct);
        var byUser = usernames.ToDictionary(u => u.Id, u => u.Username);

        return clients.Select(c =>
        {
            byClient.TryGetValue(c.Id, out var t);
            string? linked = c.UserId != null && byUser.TryGetValue(c.UserId.Value, out var n) ? n : null;
            return new ClientView(c, t?.Count ?? 0, t?.Last, linked);
        }).ToList();
    }

    public async Task<IReadOnlyDictionary<string, List<int>>> DepthSummaryAsync(Guid ownerId, bool isAdmin, CancellationToken ct)
    {
        var clientIds = await Scoped(ownerId, isAdmin)
            .Where(c => !c.Archived)
            .Select(c => c.Id)
            .ToListAsync(ct);

        // Per client: each recent session's mean depth (0..1) → 0..100 score, oldest-first, last 8.
        var rows = await _db.Sessions
            .Where(s => s.ClientId != null && clientIds.Contains(s.ClientId.Value) && s.EpochCount > 0)
            .OrderBy(s => s.StartedAt)
            .Select(s => new { ClientId = s.ClientId!.Value, s.MeanDepthScore })
            .ToListAsync(ct);

        var result = new Dictionary<string, List<int>>();
        foreach (var r in rows)
        {
            var key = r.ClientId.ToString();
            if (!result.TryGetValue(key, out var list)) result[key] = list = new List<int>();
            list.Add((int)Math.Round(Math.Clamp(r.MeanDepthScore, 0, 1) * 100));
        }
        foreach (var key in result.Keys.ToList())
            if (result[key].Count > 8) result[key] = result[key].TakeLast(8).ToList();
        return result;
    }

    public async Task<Client> CreateAsync(Guid ownerId, string name, CancellationToken ct)
    {
        var now = _clock.GetUtcNow();
        var client = new Client
        {
            OwnerId = ownerId,
            Name = name.Trim(),
            Status = "new",
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Clients.Add(client);
        await _db.SaveChangesAsync(ct);
        return client;
    }

    public async Task<ClientView?> UpdateAsync(Guid id, Guid ownerId, bool isAdmin, ClientUpdate u, CancellationToken ct)
    {
        var client = await Scoped(ownerId, isAdmin).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return null;

        if (u.Name is not null) client.Name = u.Name.Trim();
        if (u.Age is not null) client.Age = u.Age;
        if (u.Email is not null) client.Email = u.Email;
        if (u.Status is not null) client.Status = u.Status;
        if (u.Goal is not null) client.Goal = u.Goal;
        if (u.Protocol is not null) client.Protocol = u.Protocol;
        if (u.Notes is not null) client.Notes = u.Notes;
        if (u.Archived is not null) client.Archived = u.Archived.Value;
        client.UpdatedAt = _clock.GetUtcNow();

        await _db.SaveChangesAsync(ct);
        return (await AttachTallies(new List<Client> { client }, ct))[0];
    }

    public async Task<bool> DeleteAsync(Guid id, Guid ownerId, bool isAdmin, CancellationToken ct)
    {
        var client = await Scoped(ownerId, isAdmin).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (client is null) return false;
        // Detach any sessions from the client rather than deleting recorded data.
        var bound = await _db.Sessions.Where(s => s.ClientId == id).ToListAsync(ct);
        foreach (var s in bound) s.ClientId = null;
        _db.Clients.Remove(client);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
