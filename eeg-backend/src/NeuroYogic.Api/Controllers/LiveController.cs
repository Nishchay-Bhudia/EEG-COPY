using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>
/// Live-streaming registry + instructor watch grants (port of the eeg-ui /live
/// routes). With the consolidated backend the SPA already holds a first-party
/// JWT, so there is no token brokering — a watcher connects to the hub with their
/// own token and the watch_token minted here.
/// </summary>
[ApiController]
[Route("live")]
[Authorize]
public sealed class LiveController : ControllerBase
{
    private readonly ILiveService _live;

    public LiveController(ILiveService live) => _live = live;

    private bool IsAdmin => User.IsInRole("admin");

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] LiveStartRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        if (req.SessionId == Guid.Empty) return BadRequest(new { error = "sessionId required" });
        await _live.StartAsync(userId.Value, req.SessionId, ct);
        return Ok(new { ok = true });
    }

    [HttpPost("stop")]
    public async Task<IActionResult> Stop(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        await _live.StopAsync(userId.Value, ct);
        return Ok(new { ok = true });
    }

    [HttpGet("watchable")]
    [Authorize(Policy = "RequireElevated")]
    public async Task<IActionResult> Watchable(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var items = await _live.WatchableAsync(userId.Value, IsAdmin, ct);
        return Ok(items.Select(i => new
        {
            clientId = i.ClientId,
            name = i.Name,
            username = i.Username,
            netSessionId = i.SessionId,
            startedAt = i.StartedAt,
        }));
    }

    [HttpPost("watch/{clientId:guid}")]
    [Authorize(Policy = "RequireElevated")]
    public async Task<IActionResult> Watch(Guid clientId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var (grant, status, error) = await _live.WatchGrantAsync(userId.Value, IsAdmin, clientId, ct);
        if (grant is null) return StatusCode(status, new { error });
        return Ok(new
        {
            session_id = grant.SessionId,
            watch_token = grant.WatchToken,
            client_name = grant.ClientName,
        });
    }
}

public sealed class LiveStartRequest
{
    [JsonPropertyName("sessionId")] public Guid SessionId { get; set; }
}
