# meditation-analyser

An EEG meditation-analysis platform: a teacher **control hub** that streams live brain activity from a consumer EEG headband, classifies contemplative state through a **Neuro-Yogic** model (Chitta Bhūmi · Guṇa · Svara · band power), and tracks a cohort of practitioners over time.

## Repository layout

| Path | Project | Stack |
|------|---------|-------|
| [`eeg-ui/`](./eeg-ui) | Teacher control-hub UI + live Muse/BrainBit monitor | Express + static HTML/JS · Supabase Postgres · Vercel |
| [`eeg-backend/`](./eeg-backend) | "Neuro-Yogic" EEG classifier / analyser | .NET 8 · SQLite |

`eeg-ui` is a client of `eeg-backend`'s `/analyze` API. Each subproject keeps its own README and build instructions.

---

## Architecture — end to end

![End-to-end architecture](docs/architecture.svg)

<details>
<summary>Same diagram as editable Mermaid source</summary>

```mermaid
flowchart LR
  HB(["🧠 EEG headband<br/>Muse S · BrainBit<br/>4 channels · 250–256 Hz"]):::device

  subgraph BROWSER["🖥️ Browser — eeg-ui frontend (static)"]
    direction TB
    BLE["Web Bluetooth<br/>driver layer<br/>Muse · BrainBit adapters"]:::ui
    COL["Epoch collector<br/>~4 s window → µV"]:::ui
    VIEWS["Control-hub views<br/>Monitor · Cohort · Client<br/>Analyze · Replay · Prescribe"]:::ui
    BLE --> COL
    COL --> VIEWS
  end

  subgraph UISRV["☁️ eeg-ui backend (Vercel)"]
    direction TB
    EXP["Express API · /api<br/>auth · sessions · epochs<br/>clients · ai"]:::srv
    PG[("Supabase Postgres<br/>users · clients<br/>eeg_sessions · eeg_epochs")]:::db
    EXP --> PG
  end

  subgraph NET["⚙️ eeg-backend — Neuro-Yogic (.NET 8)"]
    direction TB
    API["ASP.NET Core API<br/>POST /analyze · /analyze/bands<br/>SignalR /hubs/eeg · JWT auth"]:::net
    SP["SignalProcessing<br/>FFT · band power"]:::net
    AN["Analysis<br/>Chitta Bhūmi · Guṇa · Svara"]:::net
    SQL[("SQLite<br/>neuroyogic.db")]:::db
    API --> SP --> AN
    API --> SQL
  end

  GROQ(["🤖 GROQ LLM<br/>AI Baba · Prescribe"]):::ext

  HB -- "BLE (Web Bluetooth)" --> BLE
  COL -- "POST /analyze<br/>4-ch epoch + sample_rate" --> API
  AN -- "Chitta Bhūmi · Guṇa · Svara · bands" --> COL
  COL -- "POST /api/sessions/:id/epoch" --> EXP
  VIEWS -- "REST /api/*" --> EXP
  EXP -- "/ai/* (prescribe · chat)" --> GROQ
  COL -. "local FFT fallback if analyser unreachable" .-> VIEWS

  classDef device fill:#EEF2FF,stroke:#6366F1,stroke-width:1.5px,color:#1E1B4B;
  classDef ui fill:#FFF6F1,stroke:#D97757,stroke-width:1.5px,color:#3A1D12;
  classDef srv fill:#F0FAF4,stroke:#56A67A,stroke-width:1.5px,color:#0F2E1E;
  classDef net fill:#F4F1FA,stroke:#7C68A8,stroke-width:1.5px,color:#241640;
  classDef db fill:#FBF6EC,stroke:#C9A84C,stroke-width:1.5px,color:#3A2E0E;
  classDef ext fill:#FDF0F0,stroke:#C75C5C,stroke-width:1.5px,color:#3A1212;
```
</details>

**Two backends, one source of truth.** `eeg-ui`'s Express + Postgres owns all persisted state (users, cohort, sessions, epochs). The .NET analyser is a **stateless classifier** — it turns a window of raw EEG into a contemplative-state reading and returns it; it is never dual-written to. The browser is the orchestrator: it acquires the signal over Web Bluetooth, sends each epoch to the analyser, then persists the result through the Express API.

---

## The per-epoch loop

Every few seconds the browser turns a window of raw EEG into a stored, classified epoch:

```mermaid
sequenceDiagram
  autonumber
  participant H as 🧠 Headband
  participant B as 🖥️ Browser (eeg-ui)
  participant N as ⚙️ .NET analyser
  participant E as ☁️ Express API
  participant P as 🗄️ Postgres

  H->>B: EEG samples over BLE (Web Bluetooth)
  Note over B: driver decodes → µV<br/>buffer ~4 s → 4-channel epoch
  B->>N: POST /analyze { eeg_data, sample_rate }
  N-->>B: { chitta_bhumi, guna, svara, band_power }
  Note over B: render instruments live
  B->>E: POST /api/sessions/:id/epoch
  E->>P: INSERT eeg_epochs
  Note over B: if /analyze unreachable →<br/>local FFT fallback, still persists
```

---

## What each side does

### `eeg-ui` — teacher control hub
- **Live monitor** — connect a Muse or BrainBit over Web Bluetooth (generic driver layer; any BLE EEG headband can be added), watch the raw waveform, battery, and per-epoch state readout.
- **Cohort / Client** — manage practitioners, bind sessions to clients, track status and history.
- **Analyze** — inline-SVG instruments (band radar, guṇa triangle, chitta-bhūmi ring, svara gauge, depth meter) over a recorded session.
- **Replay** — step through a recorded session epoch by epoch with a phase-colored scrubber.
- **Prescribe** — turn a session into an AI-assisted practice recommendation.
- Express API at `/api` persists to Supabase Postgres; AI features call GROQ.

### `eeg-backend` — Neuro-Yogic analyser (.NET 8)
| Project | Responsibility |
|---------|----------------|
| `NeuroYogic.Api` | ASP.NET Core endpoints (`/analyze`, `/analyze/bands`, `/sessions`, `/auth`), SignalR hub `/hubs/eeg`, JWT auth |
| `NeuroYogic.SignalProcessing` | FFT, band-power extraction |
| `NeuroYogic.Analysis` | Chitta Bhūmi / Guṇa / Svara classification |
| `NeuroYogic.Domain` | Core entities |
| `NeuroYogic.Infrastructure` | Persistence (EF Core · SQLite) |

Runs zero-config on SQLite: `dotnet run --project eeg-backend/src/NeuroYogic.Api`.

---

## Getting started

```bash
# Analyser (.NET 8, SQLite — no setup)
dotnet run --project eeg-backend/src/NeuroYogic.Api

# Control hub (Node) — see eeg-ui/README for env + DB setup
cd eeg-ui && npm install && npm run dev   # → http://localhost:3000
```

Open the hub in **Chrome or Edge on desktop** (Web Bluetooth is required to connect a headband), or use **Demo** mode for synthetic EEG.
