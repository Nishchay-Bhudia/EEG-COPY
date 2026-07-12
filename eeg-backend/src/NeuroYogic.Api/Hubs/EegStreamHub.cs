using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using NeuroYogic.Analysis;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Hubs;

/// <summary>
/// Real-time EEG streaming. A headband client invokes <see cref="StreamEpoch"/> /
/// <see cref="StreamBands"/> per epoch and receives an "analysis" event back.
/// When a session is bound, results are persisted and also broadcast to the
/// session group so dashboards can observe live.
/// </summary>
[Authorize]
public sealed class EegStreamHub : Hub
{
    private readonly IEegAnalysisService _analysis;
    private readonly ISessionService _sessions;
    private readonly IWatchTokenService _watchTokens;

    public EegStreamHub(IEegAnalysisService analysis, ISessionService sessions, IWatchTokenService watchTokens)
    {
        _analysis = analysis;
        _sessions = sessions;
        _watchTokens = watchTokens;
    }

    /// <summary>Per-connection set of sessions this connection watches as a NON-owner.</summary>
    private const string WatchedSessionsKey = "watched-sessions";

    /// <summary>
    /// Subscribe a viewer to a session's live stream. The caller must either own the
    /// session (the student subscribing to their own group, e.g. for watcher
    /// notifications) or present a valid <paramref name="watchToken"/> (instructor).
    /// Unauthorized callers get an "error" event and no group join — the session's
    /// existence is never leaked (mirrors <see cref="StreamEpoch"/>).
    /// A non-owner join announces "watcher_joined" to the group so the publisher can
    /// show a "being watched" indicator — consent by transparency.
    /// </summary>
    public async Task WatchSession(Guid sessionId, string? watchToken = null)
    {
        var userId = Context.User?.GetUserId();
        var owns = userId is { } uid && await _sessions.OwnsAsync(sessionId, uid);
        var authorized = owns ||
            (watchToken is not null && await _watchTokens.IsValidAsync(sessionId, watchToken, userId));
        if (!authorized)
        {
            await Clients.Caller.SendAsync("error", new { error = "Not authorized to watch this session." });
            return;
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(sessionId));

        if (!owns)
        {
            WatchedSessions().Add(sessionId);
            await Clients.Group(GroupName(sessionId))
                .SendAsync("watcher_joined", new { session_id = sessionId, name = WatcherName() });
        }
    }

    public async Task UnwatchSession(Guid sessionId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(sessionId));
        if (WatchedSessions().Remove(sessionId))
            await Clients.Group(GroupName(sessionId))
                .SendAsync("watcher_left", new { session_id = sessionId, name = WatcherName() });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // A watcher that drops (tab closed, network loss) must not leave a stale
        // "being watched" indicator on the student's screen.
        foreach (var sid in WatchedSessions())
            await Clients.Group(GroupName(sid))
                .SendAsync("watcher_left", new { session_id = sid, name = WatcherName() });
        await base.OnDisconnectedAsync(exception);
    }

    private HashSet<Guid> WatchedSessions()
    {
        if (Context.Items[WatchedSessionsKey] is not HashSet<Guid> set)
            Context.Items[WatchedSessionsKey] = set = new HashSet<Guid>();
        return set;
    }

    private string WatcherName() =>
        Context.User?.Identity?.Name is { Length: > 0 } n ? n : "an instructor";

    public async Task StreamEpoch(AnalyzeRequest request)
    {
        if (request.EegData is null || request.EegData.Length == 0 || request.EegData[0].Length < 2)
        {
            await Clients.Caller.SendAsync("error", new { error = "Invalid eeg_data." });
            return;
        }

        var result = _analysis.AnalyzeRaw(new RawEegInput(request.EegData, request.SampleRate)
        {
            BloodOxygen = request.BloodOxygen,
            HeartRate = request.HeartRate,
        });
        await Dispatch(result, request.SessionId);
    }

    public async Task StreamBands(AnalyzeBandsRequest request)
    {
        if (request.Delta is null || request.Theta is null || request.Alpha is null ||
            request.Beta is null || request.Gamma is null)
        {
            await Clients.Caller.SendAsync("error", new { error = "Missing band fields." });
            return;
        }

        var input = new BandInput(request.Delta.Value, request.Theta.Value, request.Alpha.Value,
            request.Beta.Value, request.Gamma.Value)
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
        await Dispatch(result, request.SessionId);
    }

    private async Task Dispatch(Domain.Analysis.AnalysisResult result, Guid? sessionId)
    {
        Guid? recordId = null;
        var userId = Context.User?.GetUserId();
        var response = AnalysisResponse.From(result, recordId);

        if (sessionId is { } sid && userId is { } uid)
        {
            var session = await _sessions.GetAsync(sid, uid, includeRecords: false);
            if (session is not null)
            {
                var record = await _sessions.AppendRecordAsync(sid, result);
                response = AnalysisResponse.From(result, record.Id);
                // GAP 3 fix: only a verified owner (the writer) may broadcast into the watched group.
                await Clients.Group(GroupName(sid)).SendAsync("analysis", response);
            }
        }

        // The caller always receives their own result, session-bound or not.
        await Clients.Caller.SendAsync("analysis", response);
    }

    private static string GroupName(Guid sessionId) => $"session:{sessionId}";
}
