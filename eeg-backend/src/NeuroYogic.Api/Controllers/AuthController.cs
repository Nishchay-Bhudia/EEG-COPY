using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>
/// Registration and login endpoints. Opt-in bridge key: when <c>Auth:BridgeKey</c>
/// (env <c>Auth__BridgeKey</c>) is configured, both endpoints require a matching
/// <c>X-Bridge-Key</c> header — restricting them to the Express BFF. When unset,
/// behaviour is unchanged (open, for local dev).
/// </summary>
[ApiController]
[Route("auth")]
public sealed class AuthController : ControllerBase
{
    private const string BridgeKeyHeader = "X-Bridge-Key";

    private readonly IAuthService _auth;
    private readonly string? _bridgeKey;

    public AuthController(IAuthService auth, IConfiguration configuration)
    {
        _auth = auth;
        _bridgeKey = configuration["Auth:BridgeKey"];
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        if (!BridgeKeyValid())
            return Unauthorized(new { error = "Missing or invalid bridge key." });
        // Public registration is always a plain user; elevated roles (instructor,
        // superadmin) are provisioned via the admin /users endpoint.
        var input = new RegisterInput(request.Email, request.Username, request.Password, request.DisplayName, "user");
        var result = await _auth.RegisterAsync(input, ct);
        if (!result.Succeeded)
            return Conflict(new { error = result.Error });
        return Ok(ToResponse(result));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        if (!BridgeKeyValid())
            return Unauthorized(new { error = "Missing or invalid bridge key." });
        var identifier = request.Username ?? request.Email;
        if (string.IsNullOrWhiteSpace(identifier))
            return BadRequest(new { error = "A username or email is required." });
        var result = await _auth.LoginAsync(identifier, request.Password, ct);
        if (!result.Succeeded)
            return Unauthorized(new { error = result.Error });
        return Ok(ToResponse(result));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var id = User.GetUserId();
        if (id is null) return Unauthorized();
        var user = await _auth.FindAsync(id.Value, ct);
        if (user is null) return Unauthorized();
        return Ok(new MeResponse
        {
            Id = user.Id,
            Username = user.Username,
            Email = user.Email,
            DisplayName = user.DisplayName,
            Role = user.Role,
        });
    }

    /// <summary>
    /// True when no bridge key is configured (open dev mode), or when the
    /// <c>X-Bridge-Key</c> request header matches the configured key.
    /// </summary>
    private bool BridgeKeyValid()
    {
        if (string.IsNullOrEmpty(_bridgeKey))
            return true;
        if (!Request.Headers.TryGetValue(BridgeKeyHeader, out var provided))
            return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(provided.ToString()),
            Encoding.UTF8.GetBytes(_bridgeKey));
    }

    private static AuthResponse ToResponse(AuthResult r) => new()
    {
        Token = r.Token!,
        ExpiresAt = r.ExpiresAt!.Value,
        UserId = r.UserId!.Value,
        Username = r.Username,
        DisplayName = r.DisplayName!,
        Role = r.Role!,
    };
}
