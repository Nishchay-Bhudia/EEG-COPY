using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Infrastructure.Identity;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

public sealed record RegisterInput(string? Email, string? Username, string Password, string DisplayName, string Role);

public sealed record AuthResult(bool Succeeded, string? Token, DateTimeOffset? ExpiresAt,
    Guid? UserId, string? Username, string? DisplayName, string? Role, string? Error)
{
    public static AuthResult Fail(string error) => new(false, null, null, null, null, null, null, error);
    public static AuthResult Ok(string token, DateTimeOffset exp, User user) =>
        new(true, token, exp, user.Id, user.Username, user.DisplayName, user.Role, null);
}

public interface IAuthService
{
    Task<AuthResult> RegisterAsync(RegisterInput input, CancellationToken ct = default);
    Task<AuthResult> LoginAsync(string identifier, string password, CancellationToken ct = default);
    Task<User?> FindAsync(Guid id, CancellationToken ct = default);
}

public sealed class AuthService : IAuthService
{
    private readonly NeuroYogicDbContext _db;
    private readonly IPasswordHasher _hasher;
    private readonly IJwtTokenService _tokens;
    private readonly TimeProvider _clock;

    public AuthService(NeuroYogicDbContext db, IPasswordHasher hasher, IJwtTokenService tokens, TimeProvider clock)
    {
        _db = db;
        _hasher = hasher;
        _tokens = tokens;
        _clock = clock;
    }

    public async Task<AuthResult> RegisterAsync(RegisterInput input, CancellationToken ct = default)
    {
        var email = string.IsNullOrWhiteSpace(input.Email) ? null : input.Email.Trim().ToLowerInvariant();
        var username = string.IsNullOrWhiteSpace(input.Username) ? null : input.Username.Trim();
        if (email is null && username is null)
            return AuthResult.Fail("An email or username is required.");
        if (email is not null && await _db.Users.AnyAsync(u => u.Email == email, ct))
            return AuthResult.Fail("An account with that email already exists.");
        if (username is not null && await _db.Users.AnyAsync(u => u.Username == username, ct))
            return AuthResult.Fail("That username is already taken.");

        var user = new User
        {
            Email = email,
            Username = username,
            DisplayName = string.IsNullOrWhiteSpace(input.DisplayName) ? (username ?? email!) : input.DisplayName.Trim(),
            PasswordHash = _hasher.Hash(input.Password),
            Role = string.IsNullOrWhiteSpace(input.Role) ? "user" : input.Role.Trim(),
            CreatedAt = _clock.GetUtcNow(),
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        var (token, exp) = _tokens.CreateToken(user);
        return AuthResult.Ok(token, exp, user);
    }

    public async Task<AuthResult> LoginAsync(string identifier, string password, CancellationToken ct = default)
    {
        identifier = identifier.Trim();
        var lower = identifier.ToLowerInvariant();
        // Match by exact username (case-sensitive) or lower-cased email.
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == identifier || u.Email == lower, ct);
        if (user is null || !_hasher.Verify(password, user.PasswordHash))
            return AuthResult.Fail("Invalid username or password.");

        var (token, exp) = _tokens.CreateToken(user);
        return AuthResult.Ok(token, exp, user);
    }

    public Task<User?> FindAsync(Guid id, CancellationToken ct = default) =>
        _db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
}
