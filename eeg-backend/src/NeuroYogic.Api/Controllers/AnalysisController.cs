using Microsoft.AspNetCore.Mvc;
using NeuroYogic.Analysis;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Domain.Analysis;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

[ApiController]
[Route("analyze")]
public sealed class AnalysisController : ControllerBase
{
    private readonly IEegAnalysisService _analysis;
    private readonly ISessionService _sessions;

    public AnalysisController(IEegAnalysisService analysis, ISessionService sessions)
    {
        _analysis = analysis;
        _sessions = sessions;
    }

    /// <summary>Analyze one epoch of raw EEG data.</summary>
    [HttpPost]
    public async Task<IActionResult> Analyze([FromBody] AnalyzeRequest request, CancellationToken ct)
    {
        if (request.EegData is null)
            return BadRequest(new { error = "Missing 'eeg_data' field." });
        if (request.EegData.Length < 1 || request.EegData[0].Length < 2)
            return BadRequest(new { error = "eeg_data must be 2-D (n_channels × n_samples) with ≥2 samples." });

        var cols = request.EegData[0].Length;
        if (request.EegData.Any(ch => ch.Length != cols))
            return BadRequest(new { error = "All EEG channels must have the same number of samples." });

        if (request.EegData.All(ch => ch.All(v => v == 0.0)))
            return UnprocessableEntity(new { error = "All-zero signal — check electrode contact and headband connection." });

        AnalysisResult result;
        try
        {
            result = _analysis.AnalyzeRaw(new RawEegInput(request.EegData, request.SampleRate)
            {
                BloodOxygen = request.BloodOxygen,
                HeartRate = request.HeartRate,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = $"Feature extraction failed: {ex.Message}" });
        }

        return Ok(await PersistIfRequested(result, request.SessionId, ct));
    }

    /// <summary>Analyze pre-computed band powers (lightweight client-side path).</summary>
    [HttpPost("bands")]
    public async Task<IActionResult> AnalyzeBands([FromBody] AnalyzeBandsRequest request, CancellationToken ct)
    {
        var required = new (string Name, double? Value)[]
        {
            ("delta", request.Delta), ("theta", request.Theta), ("alpha", request.Alpha),
            ("beta", request.Beta), ("gamma", request.Gamma),
        };
        var missing = required.Where(r => r.Value is null).Select(r => r.Name).ToArray();
        if (missing.Length > 0)
            return BadRequest(new { error = $"Missing fields: [{string.Join(", ", missing)}]" });

        var input = new BandInput(request.Delta!.Value, request.Theta!.Value, request.Alpha!.Value,
            request.Beta!.Value, request.Gamma!.Value)
        {
            HighBeta = request.HighBeta,
            LowBeta = request.LowBeta,
            AlphaLeft = request.AlphaLeft,
            AlphaRight = request.AlphaRight,
            Faa = request.Faa,
            Plv = request.Plv,
            BloodOxygen = request.BloodOxygen,
            HeartRate = request.HeartRate,
        };

        var result = _analysis.AnalyzeBands(input);
        return Ok(await PersistIfRequested(result, request.SessionId, ct));
    }

    private async Task<AnalysisResponse> PersistIfRequested(AnalysisResult result, Guid? sessionId, CancellationToken ct)
    {
        Guid? recordId = null;
        var userId = User.GetUserId();
        if (sessionId is { } sid && userId is { } uid)
        {
            // Only persist if the session belongs to the authenticated caller.
            var session = await _sessions.GetAsync(sid, uid, includeRecords: false, ct);
            if (session is not null)
            {
                var record = await _sessions.AppendRecordAsync(sid, result, ct);
                recordId = record.Id;
            }
        }
        return AnalysisResponse.From(result, recordId);
    }
}
