# Deployment

After the backend consolidation (see `MIGRATION-consolidation.md`), the app is a
**single service**: one Docker image builds the Vue SPA and bakes it into the
.NET app's `wwwroot`, so one container serves the UI and the API from one origin,
backed by one Postgres.

| | |
|---|---|
| Service | `neuro-yogic` — .NET 8 (Docker), serves SPA + `/…` API + `/hubs/eeg` |
| Database | one Postgres (EF-managed; migrates + seeds admin & practices on boot) |
| Image | `eeg-backend/Dockerfile`, **build context = repo root** (bundles `eeg-ui/web`) |

> Legacy note: the old two-service layout (separate Node/Express `eeg-ui` + its
> own DB) is superseded. Retire that Render service and database once this one is
> verified — see the cutover runbook in `MIGRATION-consolidation.md`.

## Pipeline

- **`.github/workflows/ci.yml`** — on push/PR to `main`: builds + tests the .NET solution and builds the Vue SPA. The quality gate.
- **`.github/workflows/deploy.yml`** — after CI passes on `main` (or manual): POSTs to the Render **Deploy Hook**.

### Required GitHub secret

Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `RENDER_DEPLOY_HOOK` | Deploy Hook URL of the `neuro-yogic` service (Render → Service → Settings → Deploy Hook) |

## First-time Render setup

1. **Create from Blueprint.** *New → Blueprint* pointed at this repo. `render.yaml` provisions the service + database; the connection string and `Jwt__SigningKey` are wired automatically.
2. **Set the `sync: false` secrets** on the service:
   - `Admin__SeedPassword` — the initial superadmin password (login `admin`).
   - `Groq__ApiKey` — for AI Baba chat (optional).
3. **Deploy.** On boot the app runs EF migrations and seeds the `admin` account + the default practice vocabulary.
4. **(One-off) import legacy data**, if migrating from the old stack:
   ```
   dotnet NeuroYogic.Api.dll --import-from "Host=…;Database=eeg;Username=…;Password=…"
   ```
   Idempotent; run from the service shell against the old Postgres. Verify the printed counts.
5. **Copy the Deploy Hook** into the `RENDER_DEPLOY_HOOK` GitHub secret.

After that, every green push to `main` deploys.

## Local build (sanity check)

```
# tests
cd eeg-backend && dotnet test NeuroYogic.sln -c Release

# run the consolidated image locally
docker build -f eeg-backend/Dockerfile -t neuro-yogic .
docker run -p 8080:8080 \
  -e Jwt__SigningKey=dev-signing-key-at-least-32-characters-long \
  -e Admin__SeedPassword=admin123 \
  neuro-yogic
# → http://localhost:8080  (SPA + API, SQLite by default)
```
