using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>
/// The instructor's cohort. Port of the eeg-ui /clients routes: owner-scoped for
/// instructors, all-visible for the superadmin. Read/write require an elevated
/// (instructor or admin) role.
/// </summary>
[ApiController]
[Route("clients")]
[Authorize(Policy = "RequireElevated")]
public sealed class ClientsController : ControllerBase
{
    private static readonly HashSet<string> ValidStatuses = new() { "plateau", "progress", "issue", "new" };

    private readonly IClientService _clients;

    public ClientsController(IClientService clients) => _clients = clients;

    private bool IsAdmin => User.IsInRole("admin");

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool archived, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        var views = await _clients.ListAsync(ownerId.Value, IsAdmin, archived, ct);
        return Ok(views.Select(v => ClientDto.From(v.Client, v.SessionsCount, v.LastSessionAt, v.LinkedUsername)));
    }

    // Registered before {id:guid} so "summary" is not captured as an id.
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        return Ok(await _clients.DepthSummaryAsync(ownerId.Value, IsAdmin, ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        var v = await _clients.GetAsync(id, ownerId.Value, IsAdmin, ct);
        return v is null
            ? NotFound()
            : Ok(ClientDto.From(v.Client, v.SessionsCount, v.LastSessionAt, v.LinkedUsername));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateClientRequest req, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required" });
        var client = await _clients.CreateAsync(ownerId.Value, req.Name, ct);
        return Created($"/clients/{client.Id}", ClientDto.From(client, 0, null, null));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateClientRequest req, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        if (req.Name is not null && string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name cannot be empty" });
        if (!string.IsNullOrEmpty(req.Status) && !ValidStatuses.Contains(req.Status))
            return BadRequest(new { error = "Invalid status" });

        var update = new ClientUpdate(req.Name, req.Age, req.Email, req.Status, req.Goal, req.Protocol, req.Notes, req.Archived);
        var v = await _clients.UpdateAsync(id, ownerId.Value, IsAdmin, update, ct);
        return v is null
            ? NotFound()
            : Ok(ClientDto.From(v.Client, v.SessionsCount, v.LastSessionAt, v.LinkedUsername));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var ownerId = User.GetUserId();
        if (ownerId is null) return Unauthorized();
        var ok = await _clients.DeleteAsync(id, ownerId.Value, IsAdmin, ct);
        return ok ? Ok(new { ok = true }) : NotFound();
    }
}
