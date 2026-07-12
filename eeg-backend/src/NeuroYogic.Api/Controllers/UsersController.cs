using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>
/// Account provisioning (superadmin only). Port of the eeg-ui /users routes.
/// Creating a student also creates a linked cohort client owned by the creator.
/// </summary>
[ApiController]
[Route("users")]
[Authorize(Policy = "RequireAdmin")]
public sealed class UsersController : ControllerBase
{
    private static readonly HashSet<string> ValidRoles = new() { "admin", "co-admin", "user" };

    private readonly IUserService _users;

    public UsersController(IUserService users) => _users = users;

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var users = await _users.ListAsync(ct);
        return Ok(users.Select(UserDto.From));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { error = "Username required" });
        if (req.Password is null || req.Password.Length < 6)
            return BadRequest(new { error = "Password must be at least 6 characters" });
        if (!ValidRoles.Contains(req.Role))
            return BadRequest(new { error = "Invalid role" });

        var creatorId = User.GetUserId();
        if (creatorId is null) return Unauthorized();

        var result = await _users.CreateAsync(creatorId.Value, req.Username, req.Password, req.Role, ct);
        if (!result.Succeeded)
            return Conflict(new { error = result.Error });
        return StatusCode(StatusCodes.Status201Created, UserDto.From(result.User!));
    }

    [HttpPut("{id:guid}/role")]
    public async Task<IActionResult> ChangeRole(Guid id, [FromBody] ChangeRoleRequest req, CancellationToken ct)
    {
        if (!ValidRoles.Contains(req.Role))
            return BadRequest(new { error = "Invalid role" });
        if (id == User.GetUserId())
            return BadRequest(new { error = "You cannot change your own role" });
        return await _users.ChangeRoleAsync(id, req.Role, ct) ? NoContent() : NotFound();
    }

    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> ChangePassword(Guid id, [FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        if (req.Password is null || req.Password.Length < 6)
            return BadRequest(new { error = "Password must be at least 6 characters" });
        return await _users.ChangePasswordAsync(id, req.Password, ct) ? NoContent() : NotFound();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (id == User.GetUserId())
            return BadRequest(new { error = "You cannot delete your own account" });
        return await _users.DeleteAsync(id, ct) ? Ok(new { ok = true }) : NotFound();
    }
}
