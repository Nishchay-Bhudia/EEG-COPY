using Microsoft.EntityFrameworkCore;
using NeuroYogic.Domain.Analysis;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Domain.Enums;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

/// <summary>Persists meditation sessions and per-epoch analysis records per user.</summary>
public interface ISessionService
{
    Task<MeditationSession> StartAsync(Guid userId, string? label, CancellationToken ct = default);

    /// <summary>Append one analysed epoch and update the session's rolling aggregates.</summary>
    Task<AnalysisRecord> AppendRecordAsync(Guid sessionId, AnalysisResult result, CancellationToken ct = default);

    Task<MeditationSession?> EndAsync(Guid sessionId, Guid userId, CancellationToken ct = default);

    Task<IReadOnlyList<MeditationSession>> ListForUserAsync(Guid userId, int take = 50, CancellationToken ct = default);

    Task<MeditationSession?> GetAsync(Guid sessionId, Guid userId, bool includeRecords, CancellationToken ct = default);

    /// <summary>True if the session exists and belongs to the user (the IDOR guard, reusable by the hub).</summary>
    Task<bool> OwnsAsync(Guid sessionId, Guid userId, CancellationToken ct = default);

    /// <summary>Record a self-reported depth label. Returns null if the session isn't the user's.</summary>
    Task<DepthProbe?> AddProbeAsync(Guid sessionId, Guid userId, int depthRating, int confidence, ProbeKind kind, CancellationToken ct = default);

    /// <summary>List a session's depth probes. Returns null if the session isn't the user's.</summary>
    Task<IReadOnlyList<DepthProbe>?> GetProbesAsync(Guid sessionId, Guid userId, CancellationToken ct = default);

    // ── Control-hub session lifecycle (port of the eeg-ui /sessions routes) ──
    Task<MeditationSession> StartHubAsync(Guid userId, string? name, Guid? clientId, string? activity, CancellationToken ct = default);
    Task<AnalysisRecord?> StoreEpochAsync(Guid sessionId, Guid userId, EpochInput epoch, CancellationToken ct = default);
    Task<IReadOnlyList<AnalysisRecord>?> GetEpochsAsync(Guid sessionId, Guid userId, CancellationToken ct = default);
    Task<string?> GetNotesAsync(Guid sessionId, Guid userId, CancellationToken ct = default);
    Task<bool> SetNotesAsync(Guid sessionId, Guid userId, string content, CancellationToken ct = default);
    Task<MeditationSession?> RebindClientAsync(Guid sessionId, Guid userId, Guid? clientId, CancellationToken ct = default);
}

/// <summary>An epoch already analysed client-side (the Monitor SPA), for storage.</summary>
public sealed record EpochInput(
    int EpochNum, double? ElapsedSeconds, string? ChittaBhumi, double? ChittaConfidence,
    string? ContemplativeDepth, string? Swara,
    double Delta, double Theta, double Alpha, double Beta, double Gamma,
    double Sattva, double Rajas, double Tamas, string? GunaLabel,
    double? BloodOxygen, double? HeartRate);

public sealed class SessionService : ISessionService
{
    private readonly NeuroYogicDbContext _db;
    private readonly TimeProvider _clock;

    public SessionService(NeuroYogicDbContext db, TimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<MeditationSession> StartAsync(Guid userId, string? label, CancellationToken ct = default)
    {
        var session = new MeditationSession
        {
            UserId = userId,
            Label = label,
            StartedAt = _clock.GetUtcNow(),
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync(ct);
        return session;
    }

    public async Task<AnalysisRecord> AppendRecordAsync(Guid sessionId, AnalysisResult result, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct)
                      ?? throw new InvalidOperationException($"Session {sessionId} not found.");

        var g = result.Vedantic.Gunas;
        var br = result.Features.BandRelative;

        var record = new AnalysisRecord
        {
            SessionId = sessionId,
            Timestamp = _clock.GetUtcNow(),
            ChittaBhumi = result.Chitta.State,
            ChittaConfidence = result.Chitta.Confidence,
            ContemplativeDepth = result.Vedantic.ContemplativeDepth,
            Swara = result.Vedantic.Swara.Nadi,
            Sattva = g.Sattva,
            Rajas = g.Rajas,
            Tamas = g.Tamas,
            VrittiIndex = result.Vedantic.VrittiIndex,
            ContemplativeDepthScore = result.Vedantic.ContemplativeDepthScore,
            Faa = result.Features.Faa,
            Plv = result.Features.Plv,
            AlphaRelative = br.Alpha,
            HighBetaRelative = br.HighBeta,
            GammaRelative = br.Gamma,
            BloodOxygen = result.BloodOxygen,
            HeartRate = result.HeartRate,
        };
        _db.Records.Add(record);

        // Update rolling means incrementally.
        var n = session.EpochCount;
        session.MeanSattva = (session.MeanSattva * n + g.Sattva) / (n + 1);
        session.MeanRajas = (session.MeanRajas * n + g.Rajas) / (n + 1);
        session.MeanTamas = (session.MeanTamas * n + g.Tamas) / (n + 1);
        session.MeanDepthScore = (session.MeanDepthScore * n + result.Vedantic.ContemplativeDepthScore) / (n + 1);
        session.EpochCount = n + 1;

        await _db.SaveChangesAsync(ct);
        return record;
    }

    public async Task<MeditationSession?> EndAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (session is null) return null;
        session.EndedAt = _clock.GetUtcNow();
        await _db.SaveChangesAsync(ct);
        return session;
    }

    public async Task<IReadOnlyList<MeditationSession>> ListForUserAsync(Guid userId, int take = 50, CancellationToken ct = default) =>
        await _db.Sessions
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.StartedAt)
            .Take(Math.Clamp(take, 1, 500))
            .ToListAsync(ct);

    public async Task<MeditationSession?> GetAsync(Guid sessionId, Guid userId, bool includeRecords, CancellationToken ct = default)
    {
        var query = _db.Sessions.Where(s => s.Id == sessionId && s.UserId == userId);
        if (includeRecords)
            query = query.Include(s => s.Records.OrderBy(r => r.Timestamp));
        return await query.FirstOrDefaultAsync(ct);
    }

    public Task<bool> OwnsAsync(Guid sessionId, Guid userId, CancellationToken ct = default) =>
        _db.Sessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, ct);

    public async Task<DepthProbe?> AddProbeAsync(Guid sessionId, Guid userId, int depthRating, int confidence, ProbeKind kind, CancellationToken ct = default)
    {
        // Ownership check — never trust the session id alone (avoids IDOR).
        if (!await OwnsAsync(sessionId, userId, ct)) return null;

        var probe = new DepthProbe
        {
            SessionId = sessionId,
            Timestamp = _clock.GetUtcNow(),
            DepthRating = Math.Clamp(depthRating, 1, 5),
            Confidence = Math.Clamp(confidence, 1, 5),
            Kind = kind,
        };
        _db.Probes.Add(probe);
        await _db.SaveChangesAsync(ct);
        return probe;
    }

    public async Task<IReadOnlyList<DepthProbe>?> GetProbesAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        if (!await OwnsAsync(sessionId, userId, ct)) return null;
        return await _db.Probes
            .Where(p => p.SessionId == sessionId)
            .OrderBy(p => p.Timestamp)
            .ToListAsync(ct);
    }

    // ── Control-hub session lifecycle ──────────────────────────────────────────

    // Bhūmi → 0..1 depth score (the DEPTH_PCT scale / 100), so stored epochs feed
    // the session mean depth and the cohort depth summary.
    private static double DepthOf(ChittaBhumi b) => b switch
    {
        ChittaBhumi.Mudha => 0.03,
        ChittaBhumi.Kshipta => 0.12,
        ChittaBhumi.Vikshipta => 0.37,
        ChittaBhumi.Ekagra => 0.62,
        ChittaBhumi.Niruddha => 0.94,
        _ => 0.0,
    };

    public async Task<MeditationSession> StartHubAsync(Guid userId, string? name, Guid? clientId, string? activity, CancellationToken ct = default)
    {
        var session = new MeditationSession
        {
            UserId = userId,
            Label = string.IsNullOrWhiteSpace(name) ? "New Session" : name.Trim(),
            ClientId = clientId,
            Activity = string.IsNullOrWhiteSpace(activity) ? null : activity.Trim(),
            StartedAt = _clock.GetUtcNow(),
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync(ct);
        return session;
    }

    public async Task<AnalysisRecord?> StoreEpochAsync(Guid sessionId, Guid userId, EpochInput e, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (session is null) return null;

        var bhumi = Enum.TryParse<ChittaBhumi>(e.ChittaBhumi, ignoreCase: true, out var b) ? b : ChittaBhumi.Mudha;
        var swara = Enum.TryParse<SwaraNadi>(e.Swara, ignoreCase: true, out var sw) ? sw : SwaraNadi.Sushumna;
        var depthScore = DepthOf(bhumi);

        var record = new AnalysisRecord
        {
            SessionId = sessionId,
            Timestamp = _clock.GetUtcNow(),
            EpochNum = e.EpochNum,
            ElapsedSeconds = e.ElapsedSeconds,
            ChittaBhumi = bhumi,
            ChittaConfidence = e.ChittaConfidence ?? 0,
            ContemplativeDepth = e.ContemplativeDepth ?? string.Empty,
            Swara = swara,
            Sattva = e.Sattva,
            Rajas = e.Rajas,
            Tamas = e.Tamas,
            GunaLabel = e.GunaLabel,
            ContemplativeDepthScore = depthScore,
            DeltaRelative = e.Delta,
            ThetaRelative = e.Theta,
            AlphaRelative = e.Alpha,
            BetaRelative = e.Beta,
            HighBetaRelative = e.Beta,
            GammaRelative = e.Gamma,
            BloodOxygen = e.BloodOxygen,
            HeartRate = e.HeartRate,
        };
        _db.Records.Add(record);

        var n = session.EpochCount;
        session.MeanSattva = (session.MeanSattva * n + e.Sattva) / (n + 1);
        session.MeanRajas = (session.MeanRajas * n + e.Rajas) / (n + 1);
        session.MeanTamas = (session.MeanTamas * n + e.Tamas) / (n + 1);
        session.MeanDepthScore = (session.MeanDepthScore * n + depthScore) / (n + 1);
        session.EpochCount = n + 1;

        await _db.SaveChangesAsync(ct);
        return record;
    }

    public async Task<IReadOnlyList<AnalysisRecord>?> GetEpochsAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        if (!await OwnsAsync(sessionId, userId, ct)) return null;
        return await _db.Records
            .Where(r => r.SessionId == sessionId)
            .OrderBy(r => r.EpochNum).ThenBy(r => r.Timestamp)
            .ToListAsync(ct);
    }

    public async Task<string?> GetNotesAsync(Guid sessionId, Guid userId, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        return session?.Notes;
    }

    public async Task<bool> SetNotesAsync(Guid sessionId, Guid userId, string content, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (session is null) return false;
        session.Notes = content ?? string.Empty;
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<MeditationSession?> RebindClientAsync(Guid sessionId, Guid userId, Guid? clientId, CancellationToken ct = default)
    {
        var session = await _db.Sessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, ct);
        if (session is null) return null;
        session.ClientId = clientId;
        await _db.SaveChangesAsync(ct);
        return session;
    }
}
