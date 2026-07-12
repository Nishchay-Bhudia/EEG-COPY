using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Domain.Enums;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

[ApiController]
[Route("sessions")]
[Authorize]
public sealed class SessionsController : ControllerBase
{
    private readonly ISessionService _sessions;
    private readonly IWatchTokenService _watchTokens;

    public SessionsController(ISessionService sessions, IWatchTokenService watchTokens)
    {
        _sessions = sessions;
        _watchTokens = watchTokens;
    }

    [HttpPost]
    public async Task<IActionResult> Start([FromBody] StartSessionRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var session = await _sessions.StartAsync(userId.Value, request.Label, ct);
        return CreatedAtAction(nameof(Get), new { id = session.Id }, SessionSummaryDto.From(session));
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int take = 50, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var sessions = await _sessions.ListForUserAsync(userId.Value, take, ct);
        return Ok(sessions.Select(SessionSummaryDto.From));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, [FromQuery] bool includeRecords = true, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var session = await _sessions.GetAsync(id, userId.Value, includeRecords, ct);
        if (session is null) return NotFound();

        return Ok(new SessionDetailDto
        {
            Session = SessionSummaryDto.From(session),
            Records = session.Records.Select(RecordDto.From).ToList(),
        });
    }

    [HttpPost("{id:guid}/end")]
    public async Task<IActionResult> End(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var session = await _sessions.EndAsync(id, userId.Value, ct);
        if (session is null) return NotFound();
        return Ok(SessionSummaryDto.From(session));
    }

    [HttpPost("{id:guid}/probe")]
    public async Task<IActionResult> AddProbe(Guid id, [FromBody] AddProbeRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        if (request.DepthRating is < 1 or > 5)
            return BadRequest(new { error = "depth_rating must be between 1 and 5" });

        var kind = string.Equals(request.Kind, "emerge", StringComparison.OrdinalIgnoreCase)
            ? ProbeKind.Emerge : ProbeKind.Probe;
        var probe = await _sessions.AddProbeAsync(id, userId.Value, request.DepthRating, request.Confidence ?? 3, kind, ct);
        if (probe is null) return NotFound();
        return CreatedAtAction(nameof(GetProbes), new { id }, ProbeDto.From(probe));
    }

    /// <summary>
    /// Mint a per-session watch token so an instructor can observe this session live.
    /// The raw token is returned once; the student conveys it out-of-band. 404 (never 403)
    /// when the session isn't the caller's — not-found and not-owned are indistinguishable.
    /// </summary>
    [HttpPost("{id:guid}/watch-token")]
    public async Task<IActionResult> MintWatchToken(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var minted = await _watchTokens.MintAsync(id, userId.Value, ct);
        if (minted is null) return NotFound();
        return Ok(new WatchTokenDto { WatchToken = minted.Value.rawToken, ExpiresAt = minted.Value.expiresAt });
    }

    /// <summary>Revoke every live watch token for this session ("stop sharing").</summary>
    [HttpPost("{id:guid}/watch-token/revoke")]
    public async Task<IActionResult> RevokeWatchTokens(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var ok = await _watchTokens.RevokeAsync(id, userId.Value, ct);
        return ok ? NoContent() : NotFound();
    }

    [HttpGet("{id:guid}/probes")]
    public async Task<IActionResult> GetProbes(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var probes = await _sessions.GetProbesAsync(id, userId.Value, ct);
        if (probes is null) return NotFound();
        return Ok(probes.Select(ProbeDto.From));
    }

    // ── Control-hub session routes (port of the eeg-ui /sessions API) ──────────

    [HttpPost("start")]
    public async Task<IActionResult> StartHub([FromBody] StartHubSessionRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var session = await _sessions.StartHubAsync(userId.Value, req.Name, req.ClientId, req.Activity, ct);
        return StatusCode(StatusCodes.Status201Created, HubSessionDto.From(session));
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine([FromQuery] int take = 100, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var sessions = await _sessions.ListForUserAsync(userId.Value, take, ct);
        return Ok(sessions.Select(HubSessionDto.From));
    }

    [HttpPost("{id:guid}/epoch")]
    public async Task<IActionResult> StoreEpoch(Guid id, [FromBody] StoreEpochRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var b = req.Bands ?? new BandsDto();
        var g = req.Gunas ?? new EpochGunasDto();
        var input = new EpochInput(
            req.EpochNum, req.ElapsedSeconds, req.ChittaBhumi, req.ChittaConfidence,
            req.ContemplativeDepth, req.Swara,
            b.Delta ?? 0, b.Theta ?? 0, b.Alpha ?? 0, b.Beta ?? 0, b.Gamma ?? 0,
            g.Sattva ?? 0, g.Rajas ?? 0, g.Tamas ?? 0, g.Label,
            req.BloodOxygen, req.HeartRate);
        var record = await _sessions.StoreEpochAsync(id, userId.Value, input, ct);
        return record is null ? NotFound() : StatusCode(StatusCodes.Status201Created, new { ok = true });
    }

    [HttpGet("{id:guid}/epochs")]
    public async Task<IActionResult> GetEpochs(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var epochs = await _sessions.GetEpochsAsync(id, userId.Value, ct);
        return epochs is null ? NotFound() : Ok(epochs.Select(EpochDto.From));
    }

    [HttpGet("{id:guid}/notes")]
    public async Task<IActionResult> GetNotes(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var notes = await _sessions.GetNotesAsync(id, userId.Value, ct);
        return notes is null ? NotFound() : Ok(new NotesDto { Content = notes });
    }

    [HttpPut("{id:guid}/notes")]
    public async Task<IActionResult> SetNotes(Guid id, [FromBody] NotesRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var ok = await _sessions.SetNotesAsync(id, userId.Value, req.Content, ct);
        return ok ? Ok(new NotesDto { Content = req.Content }) : NotFound();
    }

    [HttpPatch("{id:guid}/client")]
    [Authorize(Policy = "RequireElevated")]
    public async Task<IActionResult> RebindClient(Guid id, [FromBody] RebindClientRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var session = await _sessions.RebindClientAsync(id, userId.Value, req.ClientId, ct);
        return session is null ? NotFound() : Ok(HubSessionDto.From(session));
    }

    [HttpGet("{id:guid}/analytics")]
    public async Task<IActionResult> Analytics(Guid id, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var epochs = await _sessions.GetEpochsAsync(id, userId.Value, ct);
        if (epochs is null) return NotFound();
        if (epochs.Count == 0) return Ok(new { summary = new { totalEpochs = 0 } });

        var stateCounts = epochs.GroupBy(e => e.ChittaBhumi.ToString())
            .ToDictionary(g => g.Key, g => g.Count());
        var swaraCounts = epochs.GroupBy(e => e.Swara.ToString())
            .ToDictionary(g => g.Key, g => g.Count());
        var last = epochs[^1];

        return Ok(new
        {
            summary = new
            {
                totalEpochs = epochs.Count,
                durationSeconds = last.ElapsedSeconds is null ? (int?)null : (int)Math.Ceiling(last.ElapsedSeconds.Value),
                stateCounts,
                swaraCounts,
                meanDepthScore = epochs.Average(e => e.ContemplativeDepthScore),
                meanSattva = epochs.Average(e => e.Sattva),
                meanRajas = epochs.Average(e => e.Rajas),
                meanTamas = epochs.Average(e => e.Tamas),
                meanAlpha = epochs.Average(e => e.AlphaRelative),
                meanTheta = epochs.Average(e => e.ThetaRelative),
                meanBloodOxygen = epochs.Where(e => e.BloodOxygen != null).Select(e => e.BloodOxygen!.Value).DefaultIfEmpty().Average(),
                meanHeartRate = epochs.Where(e => e.HeartRate != null).Select(e => e.HeartRate!.Value).DefaultIfEmpty().Average(),
            },
        });
    }
}
