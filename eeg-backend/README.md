# Neuro-Yogic EEG Analyser (.NET 8)

An enterprise-grade backend that analyses consumer-EEG (Muse 2 / Muse S) brainwave
data in real time and interprets it through classical Yogic / Vedantic frameworks:
the five **Chitta Bhumis** of Patanjali's Yoga Sutras, the three **Gunas**
(Sattva / Rajas / Tamas), and **Swara/Nadi** (Ida / Pingala / Sushumna).

This is a C#/ASP.NET Core port of the original Python/Flask prototype. The DSP and
classification logic are **validated byte-for-behaviour against the Python/scipy
reference** (see [Validation](#validation)).

> The reference paper is *"Electroencephalographic Mapping of Yogic Physiology:
> An Integrated Neuroscientific Framework for Real-Time Biofeedback Calibration."*

---

## Architecture

A clean, layered solution. Dependencies point inward (Domain has none).

```
src/
  NeuroYogic.Domain            Entities, enums, analysis records — no dependencies
  NeuroYogic.SignalProcessing  DSP: Butterworth SOS, IIR notch, sosfiltfilt,
                               Welch PSD, Hilbert/PLV  (MathNet.Numerics FFT)
  NeuroYogic.Analysis          Chitta / Guna classifiers, Vedantic logic,
                               EegAnalysisService (orchestration)
  NeuroYogic.Infrastructure    EF Core (SQLite/Postgres), JWT auth, BCrypt,
                               Auth & Session services
  NeuroYogic.Api               Controllers, SignalR hub, Program/DI, Swagger
tests/
  NeuroYogic.SignalProcessing.Tests  Golden DSP tests vs. Python
  NeuroYogic.Analysis.Tests          Golden classifier tests vs. Python
  NeuroYogic.Api.Tests               End-to-end HTTP + auth + persistence
```

### Signal pipeline (per epoch)

```
raw EEG ─▶ band-pass 0.5–50 Hz ─▶ 50 Hz notch ─▶ Welch PSD ─▶ 6 band powers
                                                          ├─▶ ln-ratio FAA
                                                          └─▶ alpha-band PLV
        ─▶ Chitta Bhumi classifier ─▶ Vedantic analyser (Swara, Tattva, Gunas)
```

---

## Running

### Local (SQLite, zero config)

```bash
dotnet run --project src/NeuroYogic.Api
# Swagger UI at http://localhost:5xxx/swagger (Development only)
```

A `neuroyogic.db` SQLite file is created automatically.

### Docker Compose (API + Postgres)

```bash
docker compose up --build
# API on http://localhost:8080
```

### Tests

```bash
dotnet test NeuroYogic.sln
```

---

## API

| Method | Route                 | Auth | Description                                    |
|--------|-----------------------|------|------------------------------------------------|
| GET    | `/status`             | —    | Health + classifier-ready flag                 |
| GET    | `/health`             | —    | Liveness probe                                 |
| POST   | `/analyze`            | opt. | Analyse one raw EEG epoch                      |
| POST   | `/analyze/bands`      | opt. | Analyse pre-computed band powers               |
| POST   | `/auth/register`      | —    | Create account → JWT                           |
| POST   | `/auth/login`         | —    | Log in → JWT                                    |
| POST   | `/sessions`           | ✔    | Start a meditation session                     |
| GET    | `/sessions`           | ✔    | List the caller's sessions                     |
| GET    | `/sessions/{id}`      | ✔    | Session detail + per-epoch records             |
| POST   | `/sessions/{id}/end`  | ✔    | End a session                                  |
| WS     | `/hubs/eeg`           | opt. | SignalR: `StreamEpoch` / `StreamBands` → `analysis` |

Pass `session_id` on an analyse call (with a `Bearer` token) to **persist** that
epoch under a session and track meditation progress over time.

The `/analyze*` response shape is **kept identical to the original Python API**, so
existing frontends work unchanged.

### Real-time streaming

Connect a SignalR client to `/hubs/eeg?access_token=<JWT>`, invoke `StreamEpoch`
(raw) or `StreamBands` (band powers) per epoch, and handle the `analysis` event.
Dashboards can `WatchSession(sessionId)` to observe another user's live stream.

---

## Configuration

`appsettings.json` / environment variables (double-underscore syntax):

| Key                          | Default            | Notes                              |
|------------------------------|--------------------|------------------------------------|
| `Database__Provider`         | `Sqlite`           | `Sqlite` or `Postgres`             |
| `ConnectionStrings__Default` | `Data Source=…`    | Provider connection string         |
| `Jwt__SigningKey`            | dev placeholder    | **Override in prod (≥32 chars)**   |
| `Jwt__ExpiryMinutes`         | `120`              | Token lifetime                     |
| `Cors__Origins__0`, `…__1`   | (open)             | Restrict allowed origins in prod   |

### Database migrations (Postgres)

Dev/SQLite uses `EnsureCreated()`. For Postgres in production, generate and apply
EF Core migrations:

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add Initial \
  --project src/NeuroYogic.Infrastructure --startup-project src/NeuroYogic.Api
```

The app runs pending migrations automatically on startup when they exist.

---

## Validation

The DSP and classifier layers are covered by **golden tests**: the original
Python/scipy pipeline produces reference outputs (`scripts/generate_golden*.py`),
and the C# implementation must reproduce them within tolerance.

- Relative band powers match to 3 decimal places.
- FAA / PLV match to 2 decimal places.
- Chitta Bhumi, Swara, Guna proportions and probabilities match the Python output.

Regenerate the fixtures (requires Python + numpy + scipy):

```bash
python3 scripts/generate_golden.py
python3 scripts/generate_golden_classify.py
```

The original Python implementation is retained under `neuro_yogic/` as the
reference oracle.

---

## Gunas: per-epoch blend + session trend

The three Gunas are **trigunātmaka** — always a blend, never pure. The engine
reports the full Sattva/Rajas/Tamas triad for every epoch and labels it as one of
10 canonical combos (3 pure + 6 predominant→secondary blends + 1 equilibrium),
e.g. `Sattvic-predominant, Rajasic-secondary` or `Balanced (all three)`. Labelling
lives in `GunaBlend` (C#) / `describe_gunas` (Python); thresholds: a secondary guna
is named when it's ≥ half the predominant, and *triguṇa-sāmya* when top − bottom
< 0.12.

**Per-epoch guna is read purely from the epoch's features** (bands + FAA + PLV) —
the Chitta Bhumi *label* deliberately does **not** override the blend. A state
like Vikshipta oscillates (an alpha burst is sāttvic, a high-beta desync is
rājasic), so forcing one guna onto every epoch would erase legitimate mixed
states. A bhumi's classical guna character is a **temporal average** and surfaces
at the session level via `SessionSummaryDto.GunaTrend` (the blend of the mean
S/R/T across the session).

## Vikshipta is modelled as bimodal (oscillating)

Per the paper, Vikshipta "oscillates between Alpha synchronization and High-Beta
desynchronization." Its synthetic profile in `data_generator.py` is therefore
**bimodal**: absorption bursts (Sāttvic alpha) alternate with more frequent
high-beta desync (Rājasic), tuned (`scripts/tune_vikshipta.py`) so single epochs
still classify as Vikshipta (recall ≈ 0.91) rather than leaking into Kshipta.

The result across the five states forms a coherent guna progression:

| Bhumi | classifies | per-epoch guna | session trend |
|-------|-----------|----------------|---------------|
| Mudha | Mudha | Tamasic | Tamasic |
| Kshipta | Kshipta | Rajasic | Rajasic |
| **Vikshipta** | **Vikshipta** | **oscillates: ~⅔ Sāttvic bursts, ~⅓ Rājasic desyncs** | **Sattvic-predominant, Rajasic-secondary** |
| Ekagra | Ekagra | Sattvic | Sattvic |
| Niruddha | Niruddha | Sattvic | Sattvic |

Vikshipta's *"Sattva emerging"* nature shows up exactly as the trigunātmaka blend
**Sattvic-predominant, Rajasic-secondary** — the transitional turning point
between rajasic Kshipta and pure-sattvic Ekagra. Regenerate/inspect with
`scripts/eval_gunas.py` and `scripts/eval_classifier.py`.
```
