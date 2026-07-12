using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NeuroYogic.Domain.Entities;
using NeuroYogic.Domain.Enums;
using NeuroYogic.Infrastructure.Persistence;

namespace NeuroYogic.Infrastructure.Services;

/// <summary>
/// One-off migration of the legacy Express Postgres (schema.sql) into the EF
/// store. Reads the source with raw SQL and writes through the DbContext so EF
/// applies all schema + type conversions. Integer ids map to deterministic Guids
/// (MD5 of "table:id") so cross-table references stay consistent. Idempotent by
/// natural key (username / activity name); re-running skips existing rows.
/// bcrypt password hashes carry over verbatim — both stacks use bcrypt.
/// </summary>
public sealed class DataImporter
{
    private readonly NeuroYogicDbContext _db;

    public DataImporter(NeuroYogicDbContext db) => _db = db;

    private static Guid Det(string table, object id)
    {
        var bytes = MD5.HashData(Encoding.UTF8.GetBytes($"{table}:{id}"));
        return new Guid(bytes);
    }

    private static double ParseNum(object? o)
    {
        if (o is null || o is DBNull) return 0;
        var s = o.ToString()!.Replace("%", "").Trim();
        return double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d : 0;
    }

    private static double? ParseNullable(object? o) =>
        o is null or DBNull ? null : ParseNum(o);

    public async Task<string> ImportAsync(string sourceConn, CancellationToken ct = default)
    {
        await using var src = new NpgsqlConnection(sourceConn);
        await src.OpenAsync(ct);
        var log = new StringBuilder();

        // ── activity_types ──
        int acts = 0;
        var existingActs = _db.ActivityTypes.Select(a => a.Name).ToHashSet();
        await foreach (var r in Query(src, "SELECT name, sort_order, archived, created_at FROM activity_types", ct))
        {
            var name = (string)r["name"];
            if (!existingActs.Add(name)) continue;
            _db.ActivityTypes.Add(new ActivityType
            {
                Name = name,
                SortOrder = Convert.ToInt32(r["sort_order"]),
                Archived = (bool)r["archived"],
                CreatedAt = AsOffset(r["created_at"]),
            });
            acts++;
        }
        await _db.SaveChangesAsync(ct);
        log.AppendLine($"activity_types: +{acts}");

        // ── users ──
        int users = 0;
        var existingUsernames = _db.Users.Where(u => u.Username != null).Select(u => u.Username!).ToHashSet();
        await foreach (var r in Query(src, "SELECT id, username, role, password_hash, created_at FROM users", ct))
        {
            var username = r["username"] as string;
            if (username is null || !existingUsernames.Add(username)) continue;
            _db.Users.Add(new User
            {
                Id = Det("users", r["id"]),
                Username = username,
                DisplayName = username,
                Role = (r["role"] as string) ?? "user",
                PasswordHash = (string)r["password_hash"],
                CreatedAt = AsOffset(r["created_at"]),
            });
            users++;
        }
        await _db.SaveChangesAsync(ct);
        log.AppendLine($"users: +{users}");

        // ── clients ──
        int clients = 0;
        var existingClientIds = _db.Clients.Select(c => c.Id).ToHashSet();
        await foreach (var r in Query(src, "SELECT id, owner_id, user_id, name, age, email, status, goal, protocol, notes, archived, created_at, updated_at FROM clients", ct))
        {
            var id = Det("clients", r["id"]);
            if (!existingClientIds.Add(id)) continue;
            _db.Clients.Add(new Client
            {
                Id = id,
                OwnerId = Det("users", r["owner_id"]),
                UserId = r["user_id"] is DBNull ? null : Det("users", r["user_id"]),
                Name = (string)r["name"],
                Age = r["age"] is DBNull ? null : Convert.ToInt32(r["age"]),
                Email = r["email"] as string,
                Status = r["status"] as string,
                Goal = r["goal"] as string,
                Protocol = r["protocol"] as string,
                Notes = (r["notes"] as string) ?? "",
                Archived = (bool)r["archived"],
                CreatedAt = AsOffset(r["created_at"]),
                UpdatedAt = AsOffset(r["updated_at"]),
            });
            clients++;
        }
        await _db.SaveChangesAsync(ct);
        log.AppendLine($"clients: +{clients}");

        // ── eeg_sessions (+ notes) ──
        int sessions = 0;
        var notes = new Dictionary<Guid, string>();
        await foreach (var r in Query(src, "SELECT session_id, content FROM session_notes", ct))
            notes[Det("eeg_sessions", r["session_id"])] = (r["content"] as string) ?? "";

        var existingSessionIds = _db.Sessions.Select(s => s.Id).ToHashSet();
        await foreach (var r in Query(src, "SELECT id, user_id, client_id, name, activity, start_time, end_time FROM eeg_sessions", ct))
        {
            var id = Det("eeg_sessions", r["id"]);
            if (!existingSessionIds.Add(id)) continue;
            _db.Sessions.Add(new MeditationSession
            {
                Id = id,
                UserId = Det("users", r["user_id"]),
                ClientId = r["client_id"] is DBNull ? null : Det("clients", r["client_id"]),
                Label = r["name"] as string,
                Activity = r["activity"] as string,
                Notes = notes.TryGetValue(id, out var n) ? n : "",
                StartedAt = AsOffset(r["start_time"]),
                EndedAt = r["end_time"] is DBNull ? null : AsOffset(r["end_time"]),
            });
            sessions++;
        }
        await _db.SaveChangesAsync(ct);
        log.AppendLine($"sessions: +{sessions}");

        // ── eeg_epochs (recompute session aggregates after) ──
        int epochs = 0;
        var existingEpochIds = _db.Records.Select(e => e.Id).ToHashSet();
        await foreach (var r in Query(src,
            "SELECT id, session_id, epoch_num, elapsed_seconds, chitta_bhumi, chitta_confidence, contemplative_depth, swara, delta_power, theta_power, alpha_power, beta_power, gamma_power, sattva, rajas, tamas, guna_label, blood_oxygen, heart_rate, recorded_at FROM eeg_epochs", ct))
        {
            var id = Det("eeg_epochs", r["id"]);
            if (!existingEpochIds.Add(id)) continue;
            var bhumi = Enum.TryParse<ChittaBhumi>(r["chitta_bhumi"] as string, true, out var b) ? b : ChittaBhumi.Mudha;
            var swara = Enum.TryParse<SwaraNadi>(r["swara"] as string, true, out var sw) ? sw : SwaraNadi.Sushumna;
            _db.Records.Add(new AnalysisRecord
            {
                Id = id,
                SessionId = Det("eeg_sessions", r["session_id"]),
                EpochNum = r["epoch_num"] is DBNull ? 0 : Convert.ToInt32(r["epoch_num"]),
                ElapsedSeconds = ParseNullable(r["elapsed_seconds"]),
                Timestamp = AsOffset(r["recorded_at"]),
                ChittaBhumi = bhumi,
                ChittaConfidence = ParseNum(r["chitta_confidence"]),
                ContemplativeDepth = (r["contemplative_depth"] as string) ?? "",
                Swara = swara,
                DeltaRelative = ParseNum(r["delta_power"]),
                ThetaRelative = ParseNum(r["theta_power"]),
                AlphaRelative = ParseNum(r["alpha_power"]),
                BetaRelative = ParseNum(r["beta_power"]),
                HighBetaRelative = ParseNum(r["beta_power"]),
                GammaRelative = ParseNum(r["gamma_power"]),
                Sattva = ParseNum(r["sattva"]),
                Rajas = ParseNum(r["rajas"]),
                Tamas = ParseNum(r["tamas"]),
                GunaLabel = r["guna_label"] as string,
                BloodOxygen = ParseNullable(r["blood_oxygen"]),
                HeartRate = ParseNullable(r["heart_rate"]),
            });
            epochs++;
        }
        await _db.SaveChangesAsync(ct);
        log.AppendLine($"epochs: +{epochs}");

        return log.ToString();
    }

    private static DateTimeOffset AsOffset(object o) =>
        o is DateTimeOffset dto ? dto
        : o is DateTime dt ? new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc))
        : DateTimeOffset.UtcNow;

    private static async IAsyncEnumerable<NpgsqlDataReader> Query(
        NpgsqlConnection conn, string sql, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            yield return reader;
    }
}
