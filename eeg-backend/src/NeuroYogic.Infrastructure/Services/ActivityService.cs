using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

public interface IActivityService
{
    Task<IReadOnlyList<ActivityType>> ListAsync(bool includeArchived, CancellationToken ct);
    Task<ActivityType> CreateAsync(string name, int? sortOrder, CancellationToken ct);
    Task<ActivityType?> UpdateAsync(Guid id, string? name, int? sortOrder, bool? archived, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}

/// <summary>CRUD over the admin-managed practice vocabulary (port of the eeg-ui
/// <c>/activities</c> endpoints). New items sort after the current max.</summary>
public sealed class ActivityService : IActivityService
{
    private readonly NeuroYogicDbContext _db;
    private readonly TimeProvider _clock;

    public ActivityService(NeuroYogicDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<IReadOnlyList<ActivityType>> ListAsync(bool includeArchived, CancellationToken ct) =>
        await _db.ActivityTypes
            .Where(a => includeArchived || !a.Archived)
            .OrderBy(a => a.SortOrder).ThenBy(a => a.Name)
            .ToListAsync(ct);

    public async Task<ActivityType> CreateAsync(string name, int? sortOrder, CancellationToken ct)
    {
        var order = sortOrder ?? ((await _db.ActivityTypes.MaxAsync(a => (int?)a.SortOrder, ct) ?? 0) + 10);
        var entity = new ActivityType
        {
            Name = name.Trim(),
            SortOrder = order,
            CreatedAt = _clock.GetUtcNow(),
        };
        _db.ActivityTypes.Add(entity);
        await _db.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<ActivityType?> UpdateAsync(Guid id, string? name, int? sortOrder, bool? archived, CancellationToken ct)
    {
        var a = await _db.ActivityTypes.FindAsync(new object?[] { id }, ct);
        if (a is null) return null;
        if (name is not null) a.Name = name.Trim();
        if (sortOrder is not null) a.SortOrder = sortOrder.Value;
        if (archived is not null) a.Archived = archived.Value;
        await _db.SaveChangesAsync(ct);
        return a;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var a = await _db.ActivityTypes.FindAsync(new object?[] { id }, ct);
        if (a is null) return false;
        _db.ActivityTypes.Remove(a);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
