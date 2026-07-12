# Neuro-Yogic EEG — Deep Implementation Plan

**Research-driven feature layer for the .NET backend.**
Date: 2026-07-10 · Target: `NeuroYogic.*` (.NET 8) · Oracle: `neuro_yogic/` (numpy/scipy)

---

## 0. Strategic spine (why this plan exists)

The convergent finding across the advanced-meditation EEG literature is that **the deepest states — Ekāgra and Niruddha, the ones this tradition most cares about — are non-oscillatory.** They are distinguished by aperiodic (1/f) and complexity/information-theoretic dynamics, *not* by band powers or phase synchrony.

The current engine is **100% band-power + alpha-PLV** (`FeatureExtractor` → `BandPowers`, `Faa`, `Plv`). That toolset is fine for gross states (Mūḍha/Kṣipta) but is the literature's **weakest** discriminator for the deep end. Two consequences drive every phase below:

1. **Add the missing feature families** — aperiodic decomposition, neural complexity, nonlinear/directional connectivity — aimed at the deep end of the bhūmi scale.
2. **Add a validated ground-truth mechanism** — experience-sampling depth probes ("emerge" protocol) — because none of the mappings are currently validated against anything but synthetic data, and for a trust-based product that gap *is* the risk.

Key papers: Decoding Depth of Meditation (PMC11629179, continuous depth, θ/α/γ + effective connectivity, source-localized, AUC ~0.80); Jhāna nonlinear connectivity (PMC11642738, WSMI > WPLI in 4/5 bands, non-oscillatory wins); complexity reviews (PMC9826422; Frontiers 2021 skilled-meditator entropy).

---

## 1. Guardrails (non-negotiable)

| Guardrail | Detail |
|---|---|
| **Additive contract only** | `/analyze` + `/analyze/bands` return `AnalysisResponse` (`src/NeuroYogic.Api/Contracts/AnalysisResponse.cs`), consumed by **EEG-UI**. Never rename/restructure existing fields. New outputs = new `JsonPropertyName` only. EEG-UI **silently falls back to a local FFT classifier** on any failure, so a broken contract degrades invisibly — worse than an error. |
| **Golden-oracle discipline** | Every new scalar is implemented first in the **numpy/scipy** oracle (`neuro_yogic/feature_extractor.py`), emitted by `scripts/generate_golden.py`, then ported to C# and asserted in `GoldenDspTests.cs`. **No `fooof`/`antropy` dependency** — hand-roll in numpy so the algorithm is transparent and bit-portable. |
| **Tolerances** | Follow existing convention: bounded/normalized quantities **3 dp**; noisier derived metrics (fit exponents) **2 dp**. |
| **Stateless analysis** | `EegAnalysisService` + all classifiers are singletons, stateless per-epoch. The only per-session stateful point is `SessionService.AppendRecordAsync` (`src/NeuroYogic.Infrastructure/Services/`). Any cross-epoch smoothing lives there, not in the classifiers. |

### The canonical 6-touch path for a new feature

Every new DSP scalar follows exactly this path:

1. **Oracle** — implement in numpy/scipy in `neuro_yogic/feature_extractor.py`.
2. **Fixture** — emit in the `expected` block of `scripts/generate_golden.py`; regenerate `tests/NeuroYogic.SignalProcessing.Tests/golden.json`.
3. **Domain** — add `init` property to `FeatureSet` (`src/NeuroYogic.Domain/Analysis/FeatureSet.cs`); new record for vectors/matrices.
4. **DSP** — new helper in `src/NeuroYogic.SignalProcessing/Dsp/`, wired into `FeatureExtractor.Extract` at the **hook point** (immediately after Welch: `freqs` + `psd[c]` are available before the band-power collapse, ~`FeatureExtractor.cs:61-68`).
5. **Test** — add fields to `GoldenExpected` in `GoldenDspTests.cs` + `Assert.Equal(expected, actual, precision)`.
6. **Surface** (only if user-facing) — additive field in `AnalysisResponse.From` with new `JsonPropertyName`; if persisted, add column to `AnalysisRecord` + populate in `SessionService.AppendRecordAsync` + expose in `RecordDto`.

---

## 2. Phasing overview

```
Phase 0  Baseline hygiene .......... commit port; settle guna tuning        (0.5 d)
Phase 1  Robustness infra .......... artifact rejection, IAF                 (2–3 d)   ─┐ parallel:
Phase 2  Deep-state features ....... aperiodic, complexity, connectivity     (5–8 d)   ─┘ DSP-only, no classifier collision
Phase 3  Interpretive outputs ...... vṛtti index, continuous depth, smoothing (4–6 d)  ← needs Ph2 + settled tuning
Phase 4  Validation loop ........... depth-probe labeling, feature selection  (ongoing) ← the payoff; needs UI cooperation
```

**Dependency logic:** Phases 1–2 touch only `feature_extractor.py` / `FeatureExtractor` / `FeatureSet` — orthogonal to the in-flight guna/chitta tuning, so they can start now. Phase 3 wires features into the classifiers and therefore must wait for the guna tuning (open Vikshipta Rajas-predominant decision) to settle and `golden_classify.json` to be regenerated.

---

## Phase 0 — Baseline hygiene (0.5 d)

- [ ] **Commit the untracked .NET port** (`src/`, `tests/`, `NeuroYogic.sln`, `Directory.Build.props`, Docker files) as a baseline on a feature branch. Nothing below is safe to iterate on top of an uncommitted tree.
- [ ] **Settle the classifier tuning**: finalize the open Vikshipta guna decision (Rajas-predominant option C vs D), commit the four modified `neuro_yogic/*.py`, regenerate `golden_classify.json`, confirm `GoldenClassifyTests` + `ClassifierRecallTests` pass. This unblocks Phase 3 only; Phases 1–2 do not depend on it.

---

## Phase 1 — Robustness infrastructure (2–3 d)

These fix real correctness gaps that the research assumes are already handled. No interpretive change; they protect every downstream feature.

### 1a. Artifact / blink rejection  ★ real gap
**Why:** Every study does ICA ocular-artifact removal. Muse's four electrodes are all frontal (TP9/AF7/AF8/TP10) — the worst location for blink/EOG contamination — and the current pipeline has **only bandpass + notch, no artifact handling**. A single blink can dominate FAA and the α/β powers the whole classification rides on.

**Approach (feasible on 4 ch, no true ICA):** amplitude + variance-based epoch/segment rejection; optional linear regression of a derived frontal-EOG proxy (AF7/AF8 difference) out of each channel.

| Touch | File | Change |
|---|---|---|
| Oracle | `neuro_yogic/feature_extractor.py` | `_artifact_flags(raw)` → per-channel bad flag + overall `artifact_flagged` |
| DSP | `src/NeuroYogic.SignalProcessing/Dsp/ArtifactGuard.cs` (new) | `static (bool[] perChannel, bool any) Screen(double[][] raw, int sampleRate)` |
| Wire | `FeatureExtractor.Extract` | call before filtering; drop/flag bad channels for FAA/PLV hemisphere selection |
| Domain | `FeatureSet` | `bool ArtifactFlagged`, `double SignalQuality` (0–1) |
| Response | `AnalysisResponse.From` | additive `signal_quality: double`, `artifact_flagged: bool` |
| Golden | `generate_golden.py` + `GoldenDspTests` | add a deliberately blink-contaminated fixture |

### 1b. Individual Alpha Frequency (IAF) anchoring
**Why:** the multi-session study found generalized bands *measurably hurt* accuracy; individualized bands are needed. Compute each user's peak alpha from the Welch PSD and define α (and neighbor) bands as IAF ± 2 Hz.

- Phase 1 computes the **IAF scalar** only (`double Iaf` on `FeatureSet`; peak of PSD in 7–13 Hz). Hook point: right after Welch, `freqs`/`psd[c]` available.
- **Per-user personalization** (storing a rolling IAF on `User`/`MeditationSession` and re-centering bands) is deferred to Phase 4 calibration — it needs a stateful home and changes classifier inputs.
- Golden: add `iaf` to fixtures; 2 dp.

---

## Phase 2 — Deep-state feature families (5–8 d)  ★ core of the plan

All three are computed **per-channel then averaged** (matching the existing band-power convention), hand-rolled in numpy, ported to C#, golden-tested. None touch the classifiers yet — they only populate new `FeatureSet` fields and additive response fields, so they ship safely alongside the guna tuning.

### 2a. Aperiodic (1/f) decomposition — FOOOF-style
**Research:** deep absorption shows decreased broadband power and non-oscillatory dominance; the aperiodic exponent tracks E/I balance and arousal — a deep-state axis the band *ratios* currently conflate away.

**Algorithm (hand-rolled, no fooof):** on `log10(freqs)` vs `log10(psd[c])` over 2–40 Hz, robust linear fit → **exponent** (slope) + **offset** (intercept); iteratively down-weight oscillatory peaks (fit → subtract Gaussian bumps → refit) for a 2-pass robust estimate. Start with the simple single-pass `np.polyfit` slope; upgrade to peak-masked if golden variance demands.

| Touch | File | Detail |
|---|---|---|
| Oracle | `feature_extractor.py` | `_aperiodic(freqs, psd)` → `(exponent, offset)` via `np.polyfit` on log-log |
| DSP | `Dsp/Aperiodic.cs` (new) | `static (double Exponent, double Offset) Fit(double[] freqs, double[] psd, double lo=2, double hi=40)` — least-squares on log-log (MathNet `Fit.Line` or hand-rolled) |
| Wire | `FeatureExtractor.Extract` | per channel on `psd[c]`, average |
| Domain | `FeatureSet` | `double AperiodicExponent`, `double AperiodicOffset` |
| Response | `AnalysisResponse.From` | additive `aperiodic: { exponent, offset }` |
| Golden | fixtures | 2 dp (fit exponent is the noisier class) |

### 2b. Neural complexity — Lempel-Ziv, Higuchi FD, sample & permutation entropy
**Research:** repeatedly higher in focused-attention/emptiness vs rest; captures structure band-powers miss. `antropy` is the reference to mirror, **not** depend on.

Operate on the **time-domain filtered signal** `filtered[c]` (already computed in the pipeline), per channel then averaged.

| Metric | Oracle fn (numpy) | C# helper | Notes |
|---|---|---|---|
| Lempel-Ziv complexity | median-binarize → LZ76 parse | `Dsp/Complexity.LempelZiv(double[])` | deterministic; 3 dp |
| Higuchi fractal dim | curve-length over k=1..kmax | `Dsp/Complexity.HiguchiFd(double[], int kmax=10)` | 3 dp |
| Sample entropy | template match m=2, r=0.2σ | `Dsp/Complexity.SampleEntropy(double[])` | O(N²) — keep epoch ≤ a few s |
| Permutation entropy | ordinal patterns, order=3 | `Dsp/Complexity.PermEntropy(double[], int order=3)` | reuse ordinal codes for 2c |

- Domain: `FeatureSet` gains `double Lziv, HiguchiFd, SampleEntropy, PermEntropy` (or a nested `ComplexitySet` record — preferred, keeps `FeatureSet` legible).
- Response: additive `complexity: { lziv, higuchi_fd, sample_entropy, perm_entropy }`.
- Golden: 3 dp (fully deterministic given the fixture signal).

### 2c. Nonlinear / directional frontal connectivity
**Research:** WSMI (weighted symbolic mutual information) beat phase-based WPLI in 4/5 bands for absorption depth; effective (directional) connectivity predicted depth. Current pipeline has only symmetric alpha-PLV between one L/R pair.

**Scope for 4 frontal channels:** compute a small **frontal WSMI** (all channel pairs, reuse the ordinal symbolization from 2c permutation entropy) and, optionally, a **frontal-midline θ directional** measure (θ is the bliss/Sahaj-Samādhi marker). Keep to a compact scalar or 4×4 upper-triangle, not a full graph.

| Touch | File | Detail |
|---|---|---|
| Oracle | `feature_extractor.py` | `_wsmi(filtered)` → mean pairwise WSMI (θ and broadband) |
| DSP | `Dsp/Connectivity.cs` (new) | `static double MeanWsmi(double[][] filtered, int tau, int kernel=3)`; reuse `Hilbert` for phase, ordinal codes for symbols |
| Domain | `FeatureSet` | `double FrontalWsmi`, `double ThetaWsmi` |
| Response | `AnalysisResponse.From` | additive `connectivity: { wsmi, theta_wsmi, plv }` (plv echoed for grouping) |
| Golden | fixtures | 3 dp |

> **Honest hardware ceiling:** source localization, EEG microstates, and whole-brain DMN connectivity from the depth-decoding paper need many channels — **not feasible on Muse's 4 frontal electrodes.** They are explicitly out of scope until a denser headset. What ships here (aperiodic, complexity, frontal WSMI, IAF, artifact rejection) is the Muse-feasible subset.

---

## Phase 3 — Interpretive outputs (4–6 d)  ← needs Phase 2 + settled tuning

Now the new features become tradition-native readings. These touch the classifiers / `Compose`, so they land **after** the guna tuning settles and `golden_classify.json` is regenerated.

### 3a. Vṛtti (mental-chatter) index  ★ most on-brand, lowest cost
**Concept:** the fMRI depth signal is DMN deactivation = less self-referential chatter. Its EEG-accessible correlate — **frontal high-beta suppression with rising frontal alpha, plus (v2) a steeper aperiodic exponent** — maps directly onto *yogaś citta-vṛtti-nirodhaḥ* (YS 1.2). Frontal high-beta = active vṛttis; its quieting = nirodha. No Western product builds this.

- **v1 (ships in Phase 3, cheap):** pure Analysis-layer computation from **existing** `FeatureSet` fields — `vritti = f(highBetaRelative, 1−alphaRelative)`. Compute in `VedanticAnalyzer.Analyze` or `Compose`; no new DSP.
- **v2 (after Phase 2):** enrich with `AperiodicExponent` + complexity (broadband desync = more vṛtti).
- Domain: add `double VrittiIndex` + `string NirodhaState` to `VedanticReading`.
- Response: additive `vritti_index: double`, `nirodha_state: string`.
- Oracle: mirror in `vedantic_logic.py`; extend `golden_classify.json` (this is why it waits for the tuning to settle).
- Persist: add `VrittiIndex` column to `AnalysisRecord` + `SessionService` + `RecordDto`.

### 3b. Continuous contemplative-depth score
**Research:** depth is best modeled **continuous** (1–5), decoded from θ/α/γ power + effective connectivity (PMC11629179).

- Combine markers into a 0–1 (or 1–5) score: alpha↑, vṛtti↓, PLV, `FrontalWsmi`, `AperiodicExponent`, complexity. Start with a transparent weighted blend; the weights get *fit* against real labels in Phase 4.
- **Back-compat:** keep the existing discrete `depth` / `chitta_bhumi.depth` strings untouched; **add** `contemplative_depth_score: double`. Never remove the string.
- Domain: `double ContemplativeDepthScore` on `VedanticReading`; persist on `AnalysisRecord`.

### 3c. Temporal smoothing across epochs (Vikṣipta oscillation)
**Why:** best classifiers add a temporal layer (LSTM); the current classifier is memoryless, so labels jitter and Vikṣipta's documented **bimodal oscillation** is invisible frame-to-frame.

- **Home:** `SessionService.AppendRecordAsync` — the only stateful per-session point. Maintain an EMA (or online HMM/Viterbi) over the epoch stream.
- Emit at **session level**: smoothed bhūmi, a `vikshipta_oscillation` metric (variance / alpha-burst ↔ high-beta-desync alternation rate), alongside the existing rolling `MeanSattva/Rajas/Tamas`.
- Response: additive fields on `SessionSummaryDto` (`smoothed_state`, `oscillation_index`). For live streaming, emit via the SignalR `analysis` event (dashboards already `WatchSession`).
- **Fix first:** `WatchSession` currently lacks an ownership check (IDOR) — close that before any teacher/dashboard surface ships (see EEG-UI notes).

---

## Phase 4 — Validation loop (ongoing)  ← the payoff

This converts the biggest liability (unvalidated mappings on synthetic data) into the biggest asset (a proprietary, tradition-authentic **labeled** dataset). Blueprint: the "emerge" experience-sampling protocol (PMC11629179).

### 4a. Depth-probe labeling API + data model
- **Entity** `DepthProbe { Guid Id, Guid SessionId, DateTimeOffset Timestamp, int DepthRating (1–5), string Confidence, ProbeKind Kind }` where `Kind ∈ { Probe, Emerge }`. (`Probe` = random prompt; `Emerge` = spontaneous self-report on surfacing — the variant that outperformed.)
- **Endpoints:** `POST /sessions/{id}/probe` (auth), `GET /sessions/{id}/probes`. Keep only high-confidence (>3/5) for training, per the paper (74% retention).
- **EF Core:** add `DbSet<DepthProbe>`, migration, relation to `MeditationSession`.
- Golden/E2E: extend `EndpointTests` full-flow to post probes and read them back.

> **Architectural dependency — UI cooperation required.** EEG-UI currently treats this backend as a **stateless classifier** and does **not** send `session_id`/JWT to `/analyze`; its own Postgres is the source of truth for sessions. Depth-probe labeling therefore requires either (a) EEG-UI adopting the backend session flow for labeled-capture sessions, or (b) the backend accepting probe+epoch bundles out-of-band. **Decide this with the EEG-UI team before building 4a** (use the `eeg-ui` skill / repo to confirm).

### 4b. Offline feature selection & depth model
- In `scripts/`, add an evaluation harness (mirror `eval_classifier.py`) that, given labeled sessions, regresses depth against the Phase 2/3 features (θ/α/γ power, aperiodic exponent, complexity, WSMI) — reproduce the paper's continuous-depth target (report MAE vs the 1.51 chance baseline, binary AUC).
- Feed the fitted weights back into 3b's depth score. This is where "which features actually predict depth" gets answered empirically instead of assumed.

### 4c. Per-user calibration + honest uncertainty
- Persist a per-user resting **baseline** (IAF from 1b, resting aperiodic/complexity) on first use; re-center bands and z-score features per user.
- Add an explicit **`Indeterminate`** outcome + confidence gating: when the top-vs-next bhūmi margin is below threshold, return low confidence rather than a forced label. **Mandatory, not polish** — subject-independent meditation classification tops out ~0.62–0.80 AUC even in clean labs; a trust-based product must not overclaim.

---

## 3. Effort & sequencing summary

| Phase | Item | Effort | Blocks on | Ships safely alongside guna tuning? |
|---|---|---|---|---|
| 0 | Baseline commit + settle tuning | 0.5 d | — | — |
| 1a | Artifact rejection | 1–2 d | 0 (commit) | ✅ |
| 1b | IAF scalar | 0.5 d | — | ✅ |
| 2a | Aperiodic 1/f | 1.5 d | — | ✅ |
| 2b | Complexity (LZ/HFD/SampEn/PermEn) | 2–3 d | — | ✅ |
| 2c | Frontal WSMI connectivity | 1.5 d | 2b (ordinal codes) | ✅ |
| 3a | Vṛtti index v1 | 0.5 d | tuning settled | ❌ (touches classify golden) |
| 3a | Vṛtti index v2 | 0.5 d | 2a, 2b | ❌ |
| 3b | Continuous depth score | 1 d | 2a–2c, 3a | ❌ |
| 3c | Temporal smoothing | 1.5 d | — (session layer) | ✅ (session-level, separate golden) |
| 4a | Depth-probe API | 2 d | **EEG-UI decision** | ✅ |
| 4b | Offline depth model | ongoing | 4a data | ✅ |
| 4c | Calibration + uncertainty | 2 d | 4b | ❌ |

## 4. Recommended first cut

**Do in order, ship each behind the additive contract:**

1. **Phase 0** — commit the port; settle the guna tuning.
2. **Phase 2b + 2a** — complexity and aperiodic features. This is the highest research-to-effort ratio: directly attacks the documented deep-state blind spot, is pure DSP (no classifier collision), and is fully golden-testable against a hand-rolled numpy oracle exactly like the existing pipeline.
3. **Phase 3a v1** — the vṛtti index. Cheapest interpretive win, computed from existing features, and the single most defensibly *yours* output (YS 1.2 made measurable).
4. **Phase 4a decision** — take the depth-probe labeling architecture to the EEG-UI team, because without ground-truth labels every mapping above stays unvalidated — and validation, not features, is what turns the authenticity position into a moat.

Everything here preserves the validated-port architecture: numpy/scipy oracle → golden fixture → C# port → additive JSON. Nothing breaks EEG-UI; nothing collides with the in-flight tuning except the clearly-marked Phase 3 items.
