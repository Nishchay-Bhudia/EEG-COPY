# Consolidation: one backend, thin client

**Goal.** Collapse the two backends into one. The Vue SPA becomes a thin static client that talks only to the **.NET** backend; everything the Node/Express BFF does today (auth, users, clients/cohort, sessions, epochs, notes, analytics, practice vocabulary, AI chat) moves into .NET. End state: **one deployable API + static SPA + one database.**

Why .NET is the host (not Node): it already owns the expensive, tested pieces — the EEG analyzer (golden-tested C# DSP) and the SignalR streaming hub — plus EF, JWT auth, and a `User`/`Session` model. The Express tier is a CRUD-and-auth shell. Porting the shell into .NET is far less risky than porting the DSP into JS.

## Current vs target

| | Today | Target |
|---|---|---|
| Analyzer (`/analyze`) | .NET | .NET (unchanged) |
| Live streaming hub | .NET SignalR | .NET SignalR (unchanged) |
| Auth | Express cookie sessions **and** .NET JWT | .NET JWT only |
| Users / roles | Express `users` (username, `admin`/`co-admin`/`user`) | .NET `User` (extended) |
| Clients / cohort | Express `clients` | .NET `Client` (new) |
| Sessions / epochs | Express `eeg_sessions` / `eeg_epochs` | .NET `MeditationSession` / probes (reconciled) |
| Practice vocabulary | Express `activity_types` | .NET `ActivityType` (new) |
| AI chat | Express (`groq-sdk`) | .NET (`HttpClient` → Groq) |
| SPA → backend | `fetch('/api')` cookie, via Node | `fetch(API_BASE)` bearer, direct to .NET |
| Databases | 2 (Postgres schema.sql + EF) | 1 (EF) |

## The hard part: identity reconciliation

The two `User` models diverge and must be merged first, because every endpoint is role-gated.

| | Express | .NET today |
|---|---|---|
| Key | serial int | `Guid` |
| Login | `username` | `Email` |
| Roles | `admin` / `co-admin` / `user` | free string, defaults `"User"` |
| Auth transport | httpOnly cookie (`express-session` + PG store) | JWT bearer |

**Decisions:**
1. **Roles:** adopt the Express vocabulary (`admin`/`co-admin`/`user`) as the canonical set; add `[Authorize(Roles=…)]` policies (`RequireAdmin`, `RequireElevated`) mirroring the Express middleware. The JWT already emits a `role` claim.
2. **Login identifier:** add `Username` to `User` (unique), keep `Email` optional. `AuthService` authenticates by username.
3. **Transport:** switch the SPA to **JWT bearer**. `lib/api.js` sends `Authorization: Bearer <token>`; `lib/auth.js` stores the token (memory + `localStorage`) instead of relying on the cookie. `AuthController` drops the bridge-key gate for first-party login and issues the token to the SPA directly.

## Endpoint map (Express → .NET)

| Express route | .NET controller | Auth |
|---|---|---|
| `POST /auth/login`, `/auth/me`, logout | `AuthController` (extend) | anon / `[Authorize]` |
| `GET/POST/PUT/DELETE /users*` | `UsersController` (new) | `RequireAdmin` |
| `GET/POST/PUT/DELETE /clients*`, `/clients/summary`, `create-login` | `ClientsController` (new) | `RequireElevated` |
| `POST /sessions/start`, `/:id/end`, `/:id/epoch`, `GET /sessions/mine`, `/:id/epochs`, `/:id/analytics`, notes | `SessionsController` (extend) | `[Authorize]` |
| `PATCH /sessions/:id/client` | `SessionsController` | `RequireElevated` |
| `GET/POST/PUT/DELETE /activities*` | `ActivitiesController` (new) | read `[Authorize]`, write `RequireAdmin` |
| `POST /ai/*` | `AiController` (new) | `[Authorize]` |
| `POST /eeg-token`, `/live/*`, watch tokens | already in `SessionsController`/hub | `[Authorize]` |

New EF entities: `Client`, `ActivityType`, session `Note`, and epoch storage reconciled onto `AnalysisRecord`/`DepthProbe` (or a new `Epoch`). New services mirror the existing `ISessionService` pattern.

## Data migration

One-off: copy the Express Postgres (`schema.sql`) into the EF database.
- `users` → `Users` (map int id → deterministic Guid; carry `username`, `role`, `password_hash` — both use bcrypt, so hashes port as-is).
- `clients` → `Clients` (map `owner_id`/`user_id` via the id→Guid map).
- `eeg_sessions` → `Sessions`; `eeg_epochs` → records/probes; notes; `activity_types` → `ActivityType`.
A script (`eeg-backend` console tool or a one-shot EF seeder reading the old DB) performs the copy. Verify counts match, then cut over.

## Staged slices (each independently shippable)

- **S0 — groundwork:** authorization policies (`RequireAdmin`/`RequireElevated`), `API_BASE` in the SPA, keep Express running. *(no data change)*
- **S1 — ActivityType:** new entity + migration + `ActivitiesController`. Proves the vertical pattern end to end. ✅ done + tested.
- **S2 — identity:** ✅ done + tested. `Username` on `User`, login-by-username, `/auth/me`, admin seeding, auth policies. (Server-side; the SPA still uses Express until S6.)
- **S3 — users & clients:** ✅ done + tested. `ClientsController` (owner-scoped list with session tallies + `/clients/summary` depth rollup, CRUD), `UsersController` (create student → linked cohort client, role/password/delete), `Client` entity + session→client link.
- **S4 — sessions & epochs:** ✅ done + tested. Control-hub routes on `SessionsController` (start with client+activity, `/sessions/mine`, epoch store/read, notes, client rebind), `AnalysisRecord` extended to hold a full epoch, `MeditationSession.Notes`. Deferred: `/sessions/:id/analytics` aggregation (Replay metrics strip) → folds into S5.
- **S5 — AI chat + analytics:** ✅ done + tested. `GroqChatService` (HttpClient → Groq), `AiController` (`/ai/health`, `/ai/sessions`, `/ai/start`, `/ai/chat` with LLM-free off-topic guard + not-configured 503), and `GET /sessions/:id/analytics` aggregation.
- **S6 — data migration + cutover:** 🔧 code done + verified; final ops steps pending. SPA `lib/api.js`/`lib/auth.js` are now **dual-mode** (bearer against `VITE_API_BASE` when a token is stored, else legacy cookie/Express) so cutover is a config flip. Backend verified end-to-end (login→token→clients/sessions/activities). Default practice vocabulary now seeds on boot. `DataImporter` (`--import-from "<pg-conn>"`) copies the legacy Postgres through the DbContext — verified against the live eeg-ui DB (counts match, idempotent, bcrypt hashes carry over). **Remaining (ops):** provision the single Render service + EF DB, run the import, set `VITE_API_BASE` + rebuild the SPA, verify in-browser, then delete Express (`api/`, `dev-server.js`, `schema.sql`) and the second Render service/db.
- **S7 — live-streaming bridge:** ✅ done + tested. `LiveStream` entity + `AddLiveStreams` migration; `LiveService`/`LiveController` port `/live/start|stop|watchable|watch`; instructor-authorized watch-token minting (`WatchTokenService.MintForSessionAsync`). SPA dropped the `/eeg-token` broker (uses its own login JWT for the hub) and collapsed the two-session live flow to one. Also fixed epoch-store 400s: a `LenientDoubleConverter` accepts the SPA's mixed number/string/null band + confidence values. **This removes the last functional dependency on Express** — once the live flow is browser-verified, Express can be deleted.

## Cutover runbook (S6 ops)

1. **Provision** one Render service from `eeg-backend/Dockerfile` + one Postgres (`Database__Provider=Postgres`, `ConnectionStrings__Default` from the DB, `Jwt__SigningKey`, `Admin__SeedPassword`, `Groq__ApiKey`). The .NET app migrates + seeds (admin + practices) on boot.
2. **Import** legacy data once: `dotnet NeuroYogic.Api.dll --import-from "Host=…;Database=eeg;Username=…;Password=…"`. Idempotent; verify the printed counts.
3. **Point the SPA at .NET**: build with `VITE_API_BASE=https://<the .NET service>` and deploy the static `dist/` (Render static site, or served by the .NET app). Login now stores a bearer token and all calls go to .NET.
4. **Verify in-browser**: sign in as `admin`, exercise cohort / sessions / practices / a live sitting.
5. **Retire Express** only after step 4 passes: delete `eeg-ui/api/`, `dev-server.js`, `schema.sql`, and the old Render web service + its database.

> Live streaming is fully ported (S7): the SPA connects to the SignalR hub with its own login JWT and the `/live/*` registry + watch grants run in .NET. Express has no remaining functional role — step 5 can proceed once the live flow is browser-verified.

## Acceptance per slice

Build green (`dotnet build -c Release`), existing tests pass, new controller has an integration test, and the ported endpoint returns byte-compatible JSON to what the SPA expects (same field names). Nothing is deleted until S6.

## Deployment payoff

Collapses the `render.yaml` from two web services + two DBs to **one web service (.NET, serving the static SPA) + one DB**, and removes the Node tier, the bridge secrets, and the `db:setup` step (EF migrates on boot).
