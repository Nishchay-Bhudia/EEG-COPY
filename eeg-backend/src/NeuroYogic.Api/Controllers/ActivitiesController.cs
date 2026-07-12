using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>
/// The admin-managed practice vocabulary that populates the session picker.
/// Port of the eeg-ui <c>/activities</c> routes: everyone reads; only the
/// superadmin (role <c>admin</c>) writes.
/// </summary>
[ApiController]
[Route("activities")]
[Authorize]
public sealed class ActivitiesController : ControllerBase
{
    private readonly IActivityService _activities;

    public ActivitiesController(IActivityService activities) => _activities = activities;

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool all, CancellationToken ct)
    {
        var includeArchived = all && User.IsInRole("admin");
        var items = await _activities.ListAsync(includeArchived, ct);
        return Ok(items.Select(ActivityDto.From));
    }

    [HttpPost]
    [Authorize(Policy = "RequireAdmin")]
    public async Task<IActionResult> Create([FromBody] CreateActivityRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Practice name required" });
        try
        {
            var a = await _activities.CreateAsync(req.Name, req.SortOrder, ct);
            return Created($"/activities/{a.Id}", ActivityDto.From(a));
        }
        catch (DbUpdateException)
        {
            return Conflict(new { error = "That practice already exists" });
        }
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "RequireAdmin")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateActivityRequest req, CancellationToken ct)
    {
        if (req.Name is not null && string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Practice name required" });
        try
        {
            var a = await _activities.UpdateAsync(id, req.Name, req.SortOrder, req.Archived, ct);
            return a is null ? NotFound() : Ok(ActivityDto.From(a));
        }
        catch (DbUpdateException)
        {
            return Conflict(new { error = "That practice already exists" });
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "RequireAdmin")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _activities.DeleteAsync(id, ct);
        return Ok(new { ok = true });
    }
}
