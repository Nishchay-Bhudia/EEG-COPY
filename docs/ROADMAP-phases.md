# EEG-UI Control-Hub — Unified Build Roadmap

## Build order (dependency-driven)

```
L0 (independent, quick)      HR/SpO2 driver-aware  ──┐ (parallel, isolated)
                                                     │
L1 (unblocker)               P1  Cohort data model + endpoints
                              │
        ┌──────────┬─────────┼──────────┬────────────┐
L2      P2 Home/    P3       (P5 Replay  P4 Prescribe  │
        Cohort/     Analyze   soft only)  wizard+AI    │
        Client      instruments                        │
```

- **P1 is the hard gate.** P2 and P4 cannot function without its `clients` table, `eeg_sessions.client_id`, and `ownedClient` helper. Build P1 first, alone.
- **P3 and P5 have NO hard dependency on P1** — they run off existing session/epoch/analytics endpoints. They can start immediately, in parallel with P1, in isolated worktrees.
- **The HR/SpO2 loose end is fully independent** and small — land it first or anytime.

---

## Phase summaries

### L0 — HR/SpO2 driver-aware (PPG capability) · Effort: **S**
- **Goal:** Show SpO₂ + HR vitals cards only when the connected headband streams PPG (Muse S); hide on BrainBit, mirroring the conditional battery tile.
- **Files:** `app.js`, `index.html` (`style.css` only if optional contact-quality card added).
- **Deltas:** No schema, no endpoints. Add `hasPPG` flag to `MuseDriver`(true)/`BrainBitDriver`(false); new `updateVitalsVisibility(driver)` helper next to `updateBattery`; call it in `connectBluetooth` (after `activeDriver = driver`), `disconnectBluetooth` (beside `updateBattery(null)`), and once at init; add `style="display:none"` to `#spo2-card`/`#hr-card`.
- **Watch-out:** Plain (non-S) Muse also lacks PPG — static `hasPPG:true` will show empty cards there. Do NOT touch replay-view historical setters (app.js 795-802).

### P1 — Cohort/client data model + endpoints · Effort: **M**
- **Goal:** Owner-scoped `clients` table + nullable `eeg_sessions.client_id`, client CRUD guarded by an `ownedClient` check cloned from `ownedSession`, plus session→client binding. Unblocks P2/P4/P5.
- **Files:** `schema.sql`, `api/server.js`, `app.js`, `index.html`, `style.css`.
- **Schema:** New `clients` table (owner_id FK→users, name, age, status, goal, protocol, dates, notes, archived); `ALTER TABLE eeg_sessions ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`. Both idempotent (`IF NOT EXISTS`). `sessions_count`/`last_session_at` derived via LEFT JOIN aggregate, never stored.
- **Endpoints:** `GET/POST /clients`, `GET/PUT/DELETE /clients/:id`, `GET /clients/:id/sessions`, `PATCH /sessions/:id/client` (double-ownership); extend `POST /sessions/start` with optional `client_id`. Add `mapClient`, `ownedClient`, `VALID_CLIENT_STATUSES`; add `clientId` to `mapSession`.
- **DOM:** Backend-first — only a `<select id="session-client-select">` in the Live Monitor command bar + `loadClientOptions()`. Cohort/client views deliberately left as stubs (P2/P4 own them).
- **Watch-out:** Use `req.session.role` (not the historical `userRole` bug). `ON DELETE SET NULL` is deliberate — never CASCADE (would destroy EEG history). New DDL must be manually run in Supabase before deploy.

### P2 — Home / Cohort / Client views · Effort: **L**
- **Goal:** Turn the `home`, `cohort`, `client` stubs into live mockup-faithful views with tile→profile drill-down.
- **Files:** `app.js`, `index.html`, `style.css`. (No server/schema edits — consumes P1.)
- **Deltas:** No schema. Consumes `GET /clients`, `/clients/:id`, `/clients/:id/sessions`. Replace 3 stub sections in `index.html`; add `onShow` hooks to `VIEWS` map (`home/cohort/client`); `selectedClientId` module var + delegated `[data-client-id]` click handler; ~10 render fns (`onShowCohort`, `renderCohortGrid`, `onShowClient`, client header/stats/dots/sessions/notes/reco, `onShowHome`); port `sparkline()`. CSS: append one block, remapping mockup vars (`--coral/--sage/--paper/--radius`) to app tokens (`--accent/--alpha/--bg-card/--radius-md`).
- **Watch-out:** Hard dep on P1. Don't copy the mockup's own `showView`. Don't fabricate KPIs/session dots — derive from real endpoints, empty-state otherwise. Omit the Muse-impossible radar or mark it "requires ≥8ch". Don't fan out `/analytics` per dot (47-session client = N requests) — use a single depth value or lazy-load.

### P3 — Analyze view SVG instruments · Effort: **L**
- **Goal:** Replace `analyze` stub with 6 inline-SVG instruments (band radar, guna triangle, chitta-bhumi ring, swara gauge, depth meter, honest 4-sensor schematic) driven by existing analytics/epochs.
- **Files:** `index.html`, `app.js`, `style.css`, `api/server.js` (ONLY if optional `summary.depthCounts` added).
- **Deltas:** No schema. No new endpoints (reuses `/sessions/:id/analytics`, `/epochs`, `/sessions/mine`). Add `analyze:` line to `VIEWS`; `onShowAnalyze`, `loadAnalyzeSession`, 6 `draw*` fns. CSS `.analyze*`/`.an-*` grid + instrument classes.
- **Watch-out:** Do NOT port the mockup's per-channel `renderTopos`/`bandProfiles` — that data doesn't exist (4ch, whole-head averages only); use symmetric schematic + disclaimer. Coerce null bands/gunas→0. Radar maps value→radius directly (bands don't sum to 1). Normalize barycentric guna weights. Re-tokenize every mockup CSS color var.

### P4 — Prescribe wizard + AI · Effort: **L**
- **Goal:** 3-step AI-assisted prescription (family→technique→personalize/schedule) from a session, persisted in a new `prescriptions` table via existing GROQ integration.
- **Files:** `schema.sql`, `api/server.js`, `index.html`, `app.js`, `style.css`.
- **Schema:** New `prescriptions` table (client_id FK, source_session_id, created_by, family/technique ids+names, schedule fields, `priming` JSONB, `ai_rationale`, `ai_expected_signature`, `prescription_status` enum). Catalog stays as JS constants, not tables.
- **Endpoints:** `POST /ai/prescribe` (Groq JSON-mode, parse-fail fallback, 503 guard like `/ai/start`, `ownedSession`+`ownedClient`); `POST /prescriptions`; `GET /clients/:id/prescriptions`; `PATCH /prescriptions/:id`. Add `mapPrescription`, `ownedPrescription`.
- **DOM:** Replace `prescribe` stub with wizard (stepper, family grid, technique list, plan chips, summary). `onShowPrescribe` in `VIEWS`; port catalogs + render/step/wiring fns; `savePrescription(status)`.
- **Watch-out:** Hard dep on P1 (`ownedClient`, clients table). Persist family/technique **names** so catalog edits don't orphan rows. Escape all AI/teacher text via `escHtml`. Wizard must still open (fallback catalog) when Groq is unconfigured.

### P5 — Replay view · Effort: **M**
- **Goal:** Promote the existing epoch-replay player out of the admin analytics overlay into a first-class `replay` sidebar view with session picker + transport + speed + phase-colored scrubber.
- **Files:** `app.js`, `index.html`, `style.css`. (`api/server.js` untouched.)
- **Deltas:** No schema. No new endpoints (reuses `/sessions/:id/epochs`, `/sessions/mine`, `/analytics`). **MOVE** (not copy) the player markup from `#a-replay-section` into the replay view — global IDs. Add `onShowReplay` to `VIEWS`, `#replay-session-select`, `#replay-speed`, `.scrubber`. Generalize `loadReplayData()` to read picker; speed-scale `startReplay()` interval; add `renderReplayScrubber`; keyboard shortcuts. In the overlay leave an "Open in Replay ↗" button.
- **Watch-out:** #1 pitfall — duplicate IDs if markup copied not moved. `applyReading` is dashboard-ID-bound (updates hidden DOM); the visible instrument is `replay-state-display`. Call `stopReplay()` on view-switch (timer leak). Guard null/single-epoch scrubber math. Don't fabricate coherence/σ metrics — 4ch only.

---

## Conflict map (shared-file contention)

| File | L0 | P1 | P2 | P3 | P4 | P5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `schema.sql` | — | ✎ | — | — | ✎ | — | P1 (clients + client_id), P4 (prescriptions). Different tail sections → low collision, but **P4 depends on P1's schema**. |
| `api/server.js` | — | ✎ | r/o | ~ | ✎ | — | **P1 + P4 both edit** (shared mapper/helper region ~line 140/337; shared `ownedClient`). P3 only if optional `depthCounts`. Sequence P1→P4. |
| `app.js` | ✎ | ✎ | ✎ | ✎ | ✎ | ✎ | **Everyone edits.** The `VIEWS` map (~line 169-178) is the single hottest line — P2/P3/P4/P5 each add one `onShow`. L0/P5 also touch the driver/replay engine regions. |
| `index.html` | ✎ | ✎ | ✎ | ✎ | ✎ | ✎ | Each phase owns a **different `<section data-view>`** stub (P2: home/cohort/client; P3: analyze; P4: prescribe; P5: replay + moves `#a-replay-section`). P1/L0 touch the command bar + vitals cards. Section-isolated → low real collision except the shared file header. |
| `style.css` | (~) | ✎ | ✎ | ✎ | ✎ | ✎ | All **append** blocks → low collision, EXCEPT shared `:root` token additions (P4 may add vars) and the shared `.scrubber`/phase-color + `.card` rules (P2/P3/P5). |

**Must build sequentially (shared write-heavy regions):**
- **P1 → P4** — share `api/server.js` helper/mapper region and the `ownedClient` helper; P4's schema needs P1's `clients`.
- **P1 → P2** — P2's entire UI consumes P1 endpoints.
- The **`VIEWS` map line** and **`index.html` file** are touched by P2/P3/P4/P5 — coordinate as single-line/single-section diffs; merge in a defined order rather than truly parallel.

**Safe to parallelize in isolated worktrees:**
- **L0** — touches only driver objects + vitals cards; collides with nobody.
- **P3** and **P5** — no P1 dependency, read-only against existing endpoints, each owns its own `<section>`. Can run concurrently with P1 and each other, provided the shared `VIEWS` line and shared `.scrubber`/CHITTA-color CSS (P3↔P5) are reconciled at merge.

**Integration choke points to watch at merge:** (1) the `VIEWS` object in `app.js`; (2) the `ownedClient` helper — P1 owns it, P4 consumes it (stub if P4 lands first); (3) shared CSS tokens/`.card`/`.scrubber`.

---

## Recommended next 3 steps

1. **Ship L0 (HR/SpO2 driver-aware) now** — smallest, zero-dependency, real correctness win. Add `hasPPG` to both drivers, `updateVitalsVisibility()`, wire the 3 call sites, hide the two cards by default. One commit, done.

2. **Build P1 end-to-end as the unblocker** — append `clients` + `client_id` DDL to `schema.sql` (idempotent) and apply to local Docker `:5433`; add `VALID_CLIENT_STATUSES`, `mapClient`, `ownedClient` (clone of `ownedSession`, using `req.session.role`), the 7 client routes, and the `POST /sessions/start` `client_id` extension. Manually verify: create client → start session with it → `GET /clients/:id/sessions` returns it → delete client → session survives with `clientId:null`. This gates P2 and P4.

3. **In parallel, spin up P3 and P5 in isolated worktrees** (neither needs P1). Start each by adding its one `onShow` line to the `VIEWS` map and replacing its own `data-view` stub — P5 must **move** (not copy) `#a-replay-section` to avoid duplicate global IDs; P3 must drive instruments only from real `avgBands`/`avgGunas`/`stateCounts` with the honest 4-sensor schematic. Hold P2 and P4 until P1 merges, then sequence **P1 → P4** on `api/server.js`.

### Critical files for the whole roadmap
- /home/vsswami/projects/EEG-UI/api/server.js
- /home/vsswami/projects/EEG-UI/app.js
- /home/vsswami/projects/EEG-UI/index.html
- /home/vsswami/projects/EEG-UI/schema.sql
- /home/vsswami/projects/EEG-UI/style.css