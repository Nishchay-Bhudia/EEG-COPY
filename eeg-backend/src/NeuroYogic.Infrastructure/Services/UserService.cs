using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Identity;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

public sealed record UserCreateResult(bool Succeeded, User? User, string? Error);

public interface IUserService
{
    Task<IReadOnlyList<User>> ListAsync(CancellationToken ct);
    Task<UserCreateResult> CreateAsync(Guid creatorId, string username, string password, string role, CancellationToken ct);
    Task<bool> ChangeRoleAsync(Guid id, string role, CancellationToken ct);
    Task<bool> ChangePasswordAsync(Guid id, string password, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}

/// <summary>
/// Account management (admin). Creating a student (<c>user</c>) also creates a
/// linked cohort client owned by the creating instructor — a port of the eeg-ui
/// /users flow, kept atomic so an account never lands without its cohort record.
/// </summary>
public sealed class UserService : IUserService
{
    private readonly NeuroYogicDbContext _db;
    private readonly IPasswordHasher _hasher;
    private readonly TimeProvider _clock;

    public UserService(NeuroYogicDbContext db, IPasswordHasher hasher, TimeProvider clock)
    {
        _db = db;
        _hasher = hasher;
        _clock = clock;
    }

    public async Task<IReadOnlyList<User>> ListAsync(CancellationToken ct) =>
        await _db.Users.OrderBy(u => u.Username).ToListAsync(ct);

    public async Task<UserCreateResult> CreateAsync(Guid creatorId, string username, string password, string role, CancellationToken ct)
    {
        username = username.Trim();
        if (await _db.Users.AnyAsync(u => u.Username == username, ct))
            return new UserCreateResult(false, null, "Username already taken");

        var now = _clock.GetUtcNow();
        var user = new User
        {
            Username = username,
            DisplayName = username,
            Role = role,
            PasswordHash = _hasher.Hash(password),
            CreatedAt = now,
        };
        _db.Users.Add(user);

        if (role == "user")
        {
            _db.Clients.Add(new Client
            {
                OwnerId = creatorId,
                UserId = user.Id,
                Name = username,
                Status = "new",
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        await _db.SaveChangesAsync(ct);
        return new UserCreateResult(true, user, null);
    }

    public async Task<bool> ChangeRoleAsync(Guid id, string role, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object?[] { id }, ct);
        if (user is null) return false;
        user.Role = role;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> ChangePasswordAsync(Guid id, string password, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object?[] { id }, ct);
        if (user is null) return false;
        user.PasswordHash = _hasher.Hash(password);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var user = await _db.Users.FindAsync(new object?[] { id }, ct);
        if (user is null) return false;
        _db.Users.Remove(user);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}
