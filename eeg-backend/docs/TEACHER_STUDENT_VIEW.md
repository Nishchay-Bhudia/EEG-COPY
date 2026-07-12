# Teacher / Student View — Instructor Live-Streaming Implementation Plan

> Approach A: per-session opaque watch token.
> Winner per architect verdict: **per-session, self-expiring, revocable watch token**. Privacy-first, least new surface (one child entity mirroring `DepthProbe`), reuses the existing `AnyAsync` IDOR guard verbatim. Everything below is grounded in the files cited.

---

## Phase 0 — Open decisions for the product owner (resolve before coding)

- **Consent model** — v1 is *per-session, explicit, ~15 min TTL, revocable*. Confirm the TTL default and whether the student may extend/re-mint. (B/C standing-enrollment models are explicitly deferred.)
- **Token delivery UX** — raw token is shown once; student conveys it out-of-band (copyable code / QR). Confirm this is acceptable vs. a future invite→accept flow.
- **Audit requirement** — graft from B: because the hub becomes `[Authorize]`, the redeeming instructor's `userId` is known at `WatchSession` time. Decide whether to persist `RedeemedByUserId`/`RedeemedAt` (recommended for a trust-based org). Plan includes it as optional.
- **Frontend transport** — EEG-UI has **no SignalR client today**, uses cookie-session not JWT, and calls the .NET backend only anonymously via `POST /analyze`. Confirm who builds the hub client + JWT plumbing (dominates effort; constant across all approaches).
- **Migration cutover** — repo has **no `Migrations/` folder**; runs on `EnsureCreated()`. Confirm drop-and-recreate of dev `neuroyogic.db` vs. baseline (see Phase 2).

---

## Phase 1 — Close the three security gaps FIRST (independent of the token feature)

These are mandatory and must not be deferred. Do them as a standalone, reviewable commit.

**File: `src/NeuroYogic.Api/Program.cs`**
- Line **107**: `app.MapHub<EegStreamHub>("/hubs/eeg")` → append `.RequireAuthorization();`
- The `access_token`-from-query wiring already exists (**Program.cs:54–63**) and validation params (**66–81**) match `JwtTokenService`; no other auth change needed. Middleware order (**102–104**) is already correct.

**File: `src/NeuroYogic.Api/Hubs/EegStreamHub.cs`**
- Line **15**: add `[Microsoft.AspNetCore.Authorization.Authorize]` to the class (belt-and-suspenders with `RequireAuthorization`). Closes **GAP 1** (anonymous streaming).
- **GAP 2 (WatchSession IDOR/eavesdrop)** — lines **27–28**: `WatchSession` currently joins any group with zero checks. Replace with the authorized version in **Phase 4**.
- **GAP 3 (Dispatch broadcast spoofing/injection)** — lines **90–91**: the group broadcast fires on the *raw* caller-supplied `sessionId` even when `GetAsync` returned null (not owner). **Move the group send INSIDE the `if (session is not null)` ownership branch** (lines 81–86) so only a verified owner (the WRITER) can push `"analysis"` events into a watched group:

```csharp
private async Task Dispatch(Domain.Analysis.AnalysisResult result, Guid? sessionId)
{
    Guid? recordId = null;
    var userId = Context.User?.GetUserId();
    var response = AnalysisResponse.From(result, recordId);

    if (sessionId is { } sid && userId is { } uid)
    {
        var session = await _sessions.GetAsync(sid, uid, includeRecords: false); // owner-gated
        if (session is not null)
        {
            var record = await _sessions.AppendRecordAsync(sid, result);
            response = AnalysisResponse.From(result, record.Id);
            // GAP 3 fix: broadcast ONLY when caller owns the session
            await Clients.Group(GroupName(sid)).SendAsync("analysis", response);
        }
    }

    await Clients.Caller.SendAsync("analysis", response); // caller always gets their own result
}
```
- Note the caller-response (formerly line 88–89) must still always fire; recompute `response` with the real `recordId` when persisted (above).

> After Phase 1, streaming is authenticated, WatchSession is still to be hardened (Phase 4), and forged broadcasts are impossible. This is shippable on its own.

---

## Phase 2 — Domain entity + DbContext + first migration

**New file: `src/NeuroYogic.Domain/Entities/SessionWatchToken.cs`** (sealed POCO, EF-free, mirrors `DepthProbe.cs`)
```csharp
namespace NeuroYogic.Domain.Entities;

public sealed class SessionWatchToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public MeditationSession? Session { get; set; }

    public string TokenHash { get; set; } = default!;   // SHA-256 hex, never the raw token
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Guid CreatedByUserId { get; set; }           // = session.UserId, audit only

    // Optional (graft from B — audit "who watched"):
    public Guid? RedeemedByUserId { get; set; }
    public DateTimeOffset? RedeemedAt { get; set; }
}
```

**File: `src/NeuroYogic.Domain/Entities/MeditationSession.cs`** — add collection nav after line 31 (mirrors `Records`/`Probes`):
```csharp
public ICollection<SessionWatchToken> WatchTokens { get; set; } = new List<SessionWatchToken>();
```

**File: `src/NeuroYogic.Infrastructure/Persistence/NeuroYogicDbContext.cs`**
- After line **14**: `public DbSet<SessionWatchToken> WatchTokens => Set<SessionWatchToken>();`
- After the `DepthProbe` block (line **55**), add a block mirroring it:
```csharp
b.Entity<SessionWatchToken>(e =>
{
    e.HasKey(x => x.Id);
    e.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
    e.HasIndex(x => x.TokenHash).IsUnique();
    e.HasIndex(x => new { x.SessionId, x.ExpiresAt });
    e.HasOne(x => x.Session).WithMany(s => s.WatchTokens)
        .HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Cascade);
});
```
- The two/four `DateTimeOffset` properties are auto-covered by the global SQLite converter (**lines 59–66**) — no per-entity converter code.

**Migration (the repo's FIRST — hazard):**
- `EnsureCreated()`/`Migrate()` are mutually exclusive (**Program.cs:90–93**). Adding the first migration silently disables `EnsureCreated` for fresh DBs.
```
dotnet ef migrations add AddSessionWatchToken \
  --project src/NeuroYogic.Infrastructure \
  --startup-project src/NeuroYogic.Api
```
- This creates `src/NeuroYogic.Infrastructure/Migrations/` and captures the **entire current schema** as the baseline. `Microsoft.EntityFrameworkCore.Design` is already referenced.
- **Dev-DB cutover (product-owner decision):** existing `neuroyogic.db` was built by `EnsureCreated` and has no `__EFMigrationsHistory` → either (a) delete the dev DB and let `Migrate()` recreate it (simplest), or (b) baseline it. Startup (**Program.cs:90–91**) already applies pending migrations — no bootstrap code change needed.

---

## Phase 3 — REST endpoints (mint / revoke), mirroring the AddProbe IDOR shape

**New file: `src/NeuroYogic.Infrastructure/Services/WatchTokenService.cs`**
```csharp
public interface IWatchTokenService
{
    // null => caller does not own the session (controller maps to 404)
    Task<(string rawToken, DateTimeOffset expiresAt)?> MintAsync(Guid sessionId, Guid userId, CancellationToken ct = default);
    Task<bool> RevokeAsync(Guid sessionId, Guid userId, CancellationToken ct = default);
    Task<bool> IsValidAsync(Guid sessionId, string rawToken, Guid? redeemerId = null, CancellationToken ct = default);
}
```
- Inject `NeuroYogicDbContext` + `TimeProvider` (same as `SessionService`).
- `MintAsync` — ownership pre-check identical to **SessionService.cs:124–125**:
```csharp
var owns = await _db.Sessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, ct);
if (!owns) return null;
var raw = Base64Url(RandomNumberGenerator.GetBytes(32));
var now = _clock.GetUtcNow();
_db.WatchTokens.Add(new SessionWatchToken {
    SessionId = sessionId, TokenHash = Sha256Hex(raw),
    CreatedAt = now, ExpiresAt = now.AddMinutes(15), CreatedByUserId = userId });
await _db.SaveChangesAsync(ct);
return (raw, now.AddMinutes(15));   // raw returned ONCE; DB stores only the hash
```
- `RevokeAsync` — same ownership pre-check, then set `RevokedAt = now` on all live tokens for the session; return `false` if `!owns`.
- `IsValidAsync` — token bound to the SAME sessionId, hash-matched, live:
```csharp
var hash = Sha256Hex(rawToken);
var now = _clock.GetUtcNow();
var tok = await _db.WatchTokens.FirstOrDefaultAsync(t =>
    t.SessionId == sessionId && t.TokenHash == hash && t.RevokedAt == null && t.ExpiresAt > now, ct);
if (tok is null) return false;
if (redeemerId is { } r && tok.RedeemedByUserId is null) { tok.RedeemedByUserId = r; tok.RedeemedAt = now; await _db.SaveChangesAsync(ct); }
return true;
```

**File: `src/NeuroYogic.Infrastructure/DependencyInjection.cs`** — after line **35**:
```csharp
services.AddScoped<IWatchTokenService, WatchTokenService>();
```

**Add `OwnsAsync` to `ISessionService`** (`src/NeuroYogic.Infrastructure/Services/SessionService.cs`) — extract the predicate already inlined at **124** / **142** so the hub can reuse it:
```csharp
Task<bool> OwnsAsync(Guid sessionId, Guid userId, CancellationToken ct = default);
// impl: _db.Sessions.AnyAsync(s => s.Id == sessionId && s.UserId == userId, ct)
```
(Optionally refactor `AddProbeAsync`/`GetProbesAsync` to call it — cosmetic.)

**File: `src/NeuroYogic.Api/Controllers/SessionsController.cs`** — add two actions mirroring `AddProbe` (**62–75**), inject `IWatchTokenService`. Not-found and not-owned are indistinguishable (404, never 403), matching the class convention:
```csharp
[HttpPost("{id:guid}/watch-token")]
public async Task<IActionResult> MintWatchToken(Guid id, CancellationToken ct)
{
    var userId = User.GetUserId();
    if (userId is null) return Unauthorized();
    var minted = await _watchTokens.MintAsync(id, userId.Value, ct);
    if (minted is null) return NotFound();
    return Ok(new { watch_token = minted.Value.rawToken, expires_at = minted.Value.expiresAt });
}

[HttpPost("{id:guid}/watch-token/revoke")]
public async Task<IActionResult> RevokeWatchTokens(Guid id, CancellationToken ct)
{
    var userId = User.GetUserId();
    if (userId is null) return Unauthorized();
    var ok = await _watchTokens.RevokeAsync(id, userId.Value, ct);
    return ok ? NoContent() : NotFound();
}
```
- New DTO fields go in `src/NeuroYogic.Api/Contracts/` (follow existing `snake_case` JSON convention seen in tests). Class-level `[Authorize]` (**line 12**) already protects both.

---

## Phase 4 — The exact `WatchSession` authorization check

**File: `src/NeuroYogic.Api/Hubs/EegStreamHub.cs`**
- Inject `IWatchTokenService` into the ctor (**20–24**) alongside `_analysis`/`_sessions`.
- Replace `WatchSession` (**27–28**). Emit the existing `"error"` event (never throw, never leak existence — mirrors `StreamEpoch` at **37**):
```csharp
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
}
```
- `UnwatchSession` (**30–31**) stays as-is (leaving a group needs no auth).
- Roles: `WatchSession` authorizes the **reader**; the Phase 1 Dispatch ownership gate authorizes the **writer**. Both required.
- Hub-level `RequireAuthorization` was added in Phase 1 (Program.cs:107); the `access_token` query wiring is already present.

---

## Phase 5 — Frontend (EEG-UI) touch points

> The transport is net-new: **no `@microsoft/signalr`** in `package.json`, cookie-session not JWT, .NET called anonymously. This is the dominant effort. Invoke the `eeg-ui` skill before implementing to confirm exact field names.

- **Add a SignalR client** — `@microsoft/signalr` (no such dep today). Build `HubConnection` to `${backendUrl}/hubs/eeg` (backendUrl at `EEG-UI/app.js:57`) with `accessTokenFactory` supplying a JWT.
- **JWT gap (blocker)** — UI auth is same-origin Express cookie-session; it sends no token to the cross-origin `.NET` backend. Resolve one of:
  - BFF mints a short-lived JWT (matching `JwtOptions` Issuer/Audience/SigningKey) and hands it to the browser for `accessTokenFactory`; or
  - move the realtime layer into the same-origin Express BFF. **Product-owner decision.**
- **Student (publisher) side** — currently `storeEpochToSession()` (`app.js:1000–1036`) only writes to Postgres. Add: connect the hub, invoke `StreamEpoch`/`StreamBands` per epoch with `sessionId`, and a UI to call `POST /sessions/{id}/watch-token` and surface the raw token (copyable code / QR) + a "stop sharing" button → `POST /sessions/{id}/watch-token/revoke`.
- **Instructor (viewer) side** — new read-only "Watch" view (a Live Monitor variant with BLE/device controls removed):
  - enter the shared token → `connection.invoke("WatchSession", sessionId, watchToken)`;
  - `connection.on("analysis", r => applyReading(smoothReading(r)))` — reuse the existing render pipeline (`app.js:1552`); the `"analysis"` payload IS the render contract (`AnalysisResponse`).
  - handle the `"error"` event (unauthorized/expired) → prompt for a fresh token.
  - gate the view behind existing elevated-role check (`isElevatedRole`, `app.js:187`).
- The in-progress Vue rewrite (`EEG-UI/web/MIGRATION.md`) has no realtime plan — extend legacy `app.js` for v1.

---

## Phase 6 — Tests + security/consent note

**File: `tests/NeuroYogic.Api.Tests/EndpointTests.cs`** — mirror `DepthProbe_RoundTripsUnderSession` (**114–152**), especially the IDOR assertion (**149–151**):
- `WatchToken_MintedByOwner_ReturnsRawTokenOnce` — register (`POST /auth/register`), start (`POST /sessions`), `POST /sessions/{id}/watch-token` → 200 with `watch_token` + `expires_at`.
- `WatchToken_ForeignSession_ReturnsNotFound` — `POST /sessions/{Guid.NewGuid()}/watch-token` → **404** (IDOR; never 403).
- `WatchToken_Unauthenticated_ReturnsUnauthorized` — no Bearer → 401 (mirror `Sessions_RequireAuth`).
- `WatchToken_Revoke_ThenInvalid` — mint, revoke, assert `IsValidAsync` path denies (service-level or via hub integration).
- **Service unit tests** (`WatchTokenService`): expired token invalid; wrong-session token invalid (bound to `SessionId`); hash-only stored (raw never persisted); revoked token invalid.
- **Hub tests** (if a hub test harness exists; else document manual verification): unauthenticated connect rejected (Phase 1); `WatchSession` with no token + non-owner → `"error"`, no group join; forged `StreamEpoch` on a non-owned `sessionId` produces **no** group broadcast (Phase 1 GAP 3).

**Security/consent note (include in PR description):**
- Consent is per-session, explicit, self-expiring (~15 min), and revocable mid-sitting — the correct posture for streaming a person's live inner state. No standing "teacher can always see me" grant.
- Tokens stored only as SHA-256 hash (like `User.PasswordHash`); a DB leak yields no usable grants. Token bound to one `SessionId` → no cross-session replay.
- Bearer semantics: anyone the raw token is forwarded to can watch until expiry/revoke. `RedeemedByUserId`/`RedeemedAt` (optional) records the authenticated instructor who redeemed it — the audit trail.
- Not-found and not-owned are deliberately indistinguishable (404 / silent `"error"`), matching `SessionsController`.

---

## Redesign (2026-07-11, product decision): assignment replaces the code hand-off

The user reframed the model: students are **clients** of the instructor. Primary flow is in-person (instructor's machine, quick-added client, no tokens at all). For the **remote** student, the per-sitting code hand-off was replaced by **assignment-scoped access**:

- `clients.user_id` links a client record to the student's login account. **The link is the standing, visible grant** — set by the instructor in the Client view ("Link account"), removable anytime.
- The student clicks **Go Live** (no code shown): the app registers presence in `live_streams` (`POST /api/live/start`), and joins its own hub group to hear watcher events.
- The instructor's **Watch** view lists *their own linked clients who are live now* (`GET /api/live/watchable`) — assignment-scoped, `ownedClient` semantics (elevated see all).
- Clicking Watch calls `POST /api/live/watch/:clientId`: the BFF verifies ownership + link + liveness, then **mints the .NET watch token server-side acting as the student** (the BFF is the identity bridge) and returns it with the instructor's JWT. The .NET `SessionWatchToken` machinery is unchanged underneath — it is now an internal enforcement primitive rather than a user-visible code. Audit (`RedeemedByUserId`) still records the actual instructor.
- **Consent by transparency:** the hub announces `watcher_joined` / `watcher_left` (with the watcher's real username from JWT claims) to the session group; the student's Monitor shows **"● being watched by <name>"** live, and clears it on leave/disconnect (`OnDisconnectedAsync` tracked via `Context.Items`). An owner joining their own group fires no event.
- Gotcha fixed en route: SignalR JSON invocations do NOT apply C# default parameters — clients must pass `WatchSession(sessionId, null)` explicitly for the owner join.

E2E-verified through the real BFF (Node signalR harness): create+link student → go live → stranger `POST /live/watch` → **403** → instructor discovers via watchable → grant → watches → receives `analysis` → student sees `watcher_joined`/`watcher_left` **by name** → stop live. 16/16 .NET API tests still pass.

## Unified student model (2026-07-11, follow-up): one clear data path

The session plumbing was still confusing (student accounts created separately then linked; a remote student's recorded sessions didn't land under the instructor's client). Unified:

- **`POST /api/clients/:id/create-login`** (elevated): the instructor creates the student's login **and** the client link in one step, right from the Client page ("Create login"). "Link account" remains for pre-existing accounts.
- **Auto-bind**: `POST /api/sessions/start` with no `client_id` now binds the session to the caller's linked client automatically — a student never picks anything; their sittings land under the instructor's client record.
- **Access follows the client**: `ownedSession` now also grants the owner of the bound client (recorder ∨ client-owner ∨ elevated). A plain-role instructor can read their students' sessions/epochs/analytics via ownership, not role.
- **Go Live always records**: if no session is active, Monitor auto-starts one ("Live sitting <date>") before streaming, so a live sitting is never lost.

E2E (12 checks, all green): create-login → student signs in → session auto-binds → epoch stored → live watchable/watch/analysis/watcher-indicator → session listed under the client → instructor reads epochs → plain-role instructor reads via client ownership → stranger still denied.

## Implementation status (2026-07-11) — Phases 1–6 built & verified

All phases are implemented. Product-owner decisions taken: TTL **60 min re-mintable**; **audit persisted** (`RedeemedByUserId`/`RedeemedAt`); dev-DB cutover **delete & recreate**; frontend transport **BFF mints JWT**; frontend built in the **Vue `web/` app** (the active codebase, not legacy `app.js`).

**Backend (`eeg-backend/`)** — Phase 1 security fixes, Phase 2 `SessionWatchToken` + first EF migration `AddSessionWatchToken`, Phase 3 `WatchTokenService` + `ISessionService.OwnsAsync` + REST mint/revoke, Phase 4 `WatchSession` token gate, Phase 6 tests (16/16 API tests pass). Two extra hardening changes surfaced during end-to-end verification and were applied to `Program.cs`:
- `MaximumReceiveMessageSize = 2 MB` on `AddSignalR` — raw multichannel EEG epochs (256 Hz × 4 s × 4 ch ≈ 80 KB) exceed SignalR's 32 KB default and would silently close the connection.
- `EnableDetailedErrors` in Development only.
- Bootstrap now gates on `GetMigrations().Any()` (not `GetPendingMigrations`) so `Migrate()` stays idempotent across WebApplicationFactory's repeated host resolution.

**Frontend (`eeg-ui/`)**:
- **BFF token broker** — `POST /api/eeg-token` (`api/server.js`): maps each Express user to a deterministic *shadow* .NET account (login, provisioning via register on first use) and returns the .NET-issued JWT + `backend_url`. Express never holds the .NET signing key; .NET stays the identity authority for its own sessions/tokens.
- `web/src/lib/live.js` — `getEegAccess()` (broker), `buildHub()` (`@microsoft/signalr` + `accessTokenFactory`), `netFetch()` (JWT REST to .NET).
- `web/src/components/ReadingPanel.vue` — the read-only reading display, extracted from `Monitor.vue` and **shared** by student + instructor. Driven purely by the `mapAnalyzeResponse` shape, which is exactly the hub's `"analysis"` payload.
- **Student** — `Monitor.vue` gained a "Share Live" flow: broker JWT → start a .NET streaming session → mint a watch token → show a copyable `sessionId:token` code; each epoch is relayed via `StreamEpoch` (raw) / `StreamBands` (demo); "Stop Sharing" revokes + ends.
- **Instructor** — new `Watch.vue` (`/watch` route + nav): paste the code → broker JWT → `WatchSession(sessionId, token)` → `on("analysis")` → `mapAnalyzeResponse` → the same `ReadingPanel`; handles the `"error"` event (expired/unauthorized).

**End-to-end verification (Node `@microsoft/signalr` harness against the local backend):** two shadow users; student mints token; instructor `WatchSession` authorizes; a **wrong token is refused with an `"error"` event and no group join**; student `StreamEpoch` is analyzed server-side and **broadcast to the instructor** (`chitta_bhumi.state` received); broker login/register fallback confirmed. Full browser 2-window run (with a real BLE device or Demo mode + Postgres) is the remaining manual check.

**Deploy note:** the live path only works once the **updated .NET backend is redeployed** (Render currently runs the pre-Phase-1 build with an anonymous hub). Set `NET_BACKEND_URL` + `NET_SHADOW_SECRET` on the Express host and align it with the browser's `controlhub_url`.

### Security / consent note (for the PR)
- Consent is per-session, explicit, self-expiring (60 min), and revocable mid-sitting — the correct posture for streaming a person's live inner state. No standing "teacher can always see me" grant.
- Tokens are stored only as SHA-256 hash (like `User.PasswordHash`); a DB leak yields no usable grants. Each token is bound to one `SessionId` → no cross-session replay.
- Bearer semantics: anyone the raw code is forwarded to can watch until expiry/revoke. `RedeemedByUserId`/`RedeemedAt` records the authenticated instructor who redeemed it (verified populated in the round-trip test).
- Not-found and not-owned are deliberately indistinguishable (404 / silent `"error"`), matching `SessionsController`.
- The shadow-account bridge means each EEG-UI user maps to a stable .NET identity; the shadow password is an HMAC over the user id with a server secret and is never stored on the Express side.

## Recommended build order

1. **Phase 1** (security gaps) — ship standalone; no schema, no frontend. Highest-value, closes GAP 1/2*/3 (*WatchSession hardened fully in Phase 4).
2. **Phase 2** (entity + DbContext + first migration) — pay the `EnsureCreated→Migrate` cutover cost once.
3. **Phase 3** (service + REST mint/revoke + `OwnsAsync`).
4. **Phase 4** (WatchSession token gate).
5. **Phase 6 backend tests** alongside 3–4.
6. **Phase 5** (frontend) — gated on the JWT-for-hub decision; largest and riskiest; can lag the backend.

## Defer (v2+ per architect verdict)

- Presence / "who is live right now" roster + heartbeat endpoint.
- Durable invite→accept **Enrollment** roster (Approach B) — the natural v2 that can auto-mint/refresh watch tokens on top of A.
- Cohort/class group-teaching + `WatchClass(classId)` fan-out (Approach C) — v3.
- Expired-token sweep (housekeeping only; `IsValidAsync` already filters on `ExpiresAt`, so not needed for correctness).
