<script setup>
// Live Monitor — the student/practitioner view. Owns the device driver, session
// lifecycle, the metric bar, the canvas waveform, and (new) LIVE SHARING: minting a
// per-session watch token and streaming each epoch to the .NET SignalR hub so an
// instructor can observe in real time (Teacher/Student view).
//
// The rich per-reading display now lives in <ReadingPanel/> (shared with the
// instructor's Watch view) — this file drives it via the smoothed `reading` ref.
//
// Pipeline per completed epoch (from useDriver's onEpoch) or per demo tick:
//   raw reading → smoother.apply() → applyReading() (display)
//                                 → storeEpoch()        (POST /sessions/:id/epoch)
//                                 → streamIfSharing()   (hub StreamEpoch/StreamBands)
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { api, isDotnet } from '@/lib/api';
import { isElevated } from '@/lib/auth';
import { useDriver } from '@/composables/useDriver';
import ReadingPanel from '@/components/ReadingPanel.vue';
import { getEegAccess, buildHub, netFetch } from '@/lib/live';
import { useI18n } from '@/composables/useI18n';
import {
  DEFAULT_BANDS, WAVE_LEN, DEMO_INTERVAL,
  analyzeLocal, mapAnalyzeResponse, createSmoother, createDemoSource,
} from '@/lib/analysis';

const { t, tf, translateDataQuality, localizeNumber } = useI18n();

// ── Driver (BLE) ──────────────────────────────────────────────────────────────
const driver = useDriver();
const {
  connected, connecting, deviceName, battery, hasPPG, heartRate, spo2,
  hrStale, spo2Stale, bufferCount, latestSamples, error, COLLECT_N,
} = driver;

// ── Backend URL (the .NET analyser — NOT the /api Express backend) ─────────────
// Defaults to the local analyser for local dev; a stale/unreachable remote
// default here silently degrades every reading to the local FFT fallback (no
// gunas, no inner-texture). Override by setting localStorage 'controlhub_url'
// for a remote deployment (no in-app settings UI).
const backendUrl = (localStorage.getItem('controlhub_url') || 'http://localhost:5094').replace(/\/$/, '');

// ── Mode / reading state ──────────────────────────────────────────────────────
const mode = ref('idle');           // 'idle' | 'demo' | 'bluetooth'
const reading = ref(null);          // last SMOOTHED reading — drives the display
const board = ref('—');
const modeHint = ref('—');
const lastBands = ref({ ...DEFAULT_BANDS });   // canvas waveform source
let liveEpoch = 0;                   // BLE/local epoch counter (demo has its own)

const smoother = createSmoother();
let demoSource = null;
let demoTimer = null;

// ── Session state ─────────────────────────────────────────────────────────────
// The instructor operates this view: they pick (or quick-add) the student as a
// client, then start a session bound to that client while the student wears the band.
const clients = ref([]);
const selectedClientId = ref('');      // '' | client id | NEW_CLIENT sentinel
const activity = ref('');              // contemplative practice for this sitting
// Practice vocabulary — admin-managed (activity_types), loaded on mount. Free
// text is still allowed; this list just powers the <datalist> suggestions.
const practiceTypes = ref([]);
const NEW_CLIENT = '__new__';
const newClientName = ref('');
const activeSession = ref(null);
const sessionElapsed = ref(0);       // seconds
const notes = ref('');
const history = ref([]);
const historyOpen = ref(false);
let sessionEpochCounter = 0;
let sessionStart = null;
let sessionTimer = null;
let notesTimeout = null;

// ── Going live (remote student → assigned instructor) ──────────────────────────
// No code hand-off: going live registers presence with the BFF; an instructor who
// owns a client record LINKED to this account gets access (assignment = grant).
// Watchers are announced back to us by the hub — consent by transparency.
const sharing = ref(false);
const sharePending = ref(false);
const shareInfo = ref(null);         // { sessionId }
const shareError = ref('');
const watchers = ref([]);            // display names currently watching
let hubConn = null;
let shareAccess = null;              // { token, backendUrl }

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvasEl = ref(null);
let rafId = null;
let wavePhase = 0;
let accent = '#56A67A';

// ════════════════════════════════════════════════════════════════════════════
//  Reading → display
// ════════════════════════════════════════════════════════════════════════════
function applyReading(r) {
  reading.value = r;
  liveEpoch = r.epoch ?? liveEpoch;
  const s = r.eeg_spectrum || (r.band_powers && r.band_powers.relative) || {};
  lastBands.value = {
    delta:    s.delta     ?? lastBands.value.delta,
    theta:    s.theta     ?? lastBands.value.theta,
    alpha:    s.alpha     ?? lastBands.value.alpha,
    low_beta: s.low_beta  ?? (s.beta != null ? s.beta * 0.55 : lastBands.value.low_beta),
    high_beta:s.high_beta ?? (s.beta != null ? s.beta * 0.45 : lastBands.value.high_beta),
    gamma:    s.gamma     ?? lastBands.value.gamma,
  };
}

// ── Metric bar ──
const epochLabel   = computed(() => reading.value?.epoch != null ? localizeNumber(reading.value.epoch) : '—');
const qualityLabel = computed(() => translateDataQuality(reading.value?.data_quality) || t('awaitingSignal'));
const latencyLabel = computed(() => reading.value?.latency_ms != null ? localizeNumber(reading.value.latency_ms.toFixed(1)) : '—');
const bufferLabel  = computed(() => `${localizeNumber(bufferCount.value)} / ${localizeNumber(COLLECT_N)}`);
const modeLabel    = computed(() => mode.value === 'demo' ? t('demo').toLowerCase()
  : mode.value === 'bluetooth' ? modeHint.value : '—');

const statusInfo = computed(() => {
  if (error.value) return { cls: 'error', text: error.value };
  if (connecting.value) return { cls: 'waking', text: t('statusConnecting') };
  if (connected.value) return { cls: 'bluetooth', text: `${deviceName.value || t('deviceFallback')} ${t('statusConnected')}` };
  if (mode.value === 'demo') return { cls: '', text: t('statusDemoMode') };
  return { cls: '', text: t('disconnected') };
});

// ════════════════════════════════════════════════════════════════════════════
//  Epoch pipeline
// ════════════════════════════════════════════════════════════════════════════
async function onEpochComplete(snapshot, meta) {
  const t0 = performance.now();
  if (backendUrl) {
    try {
      const res = await fetch(backendUrl + '/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eeg_data: snapshot,
          sample_rate: meta.sampleRate,
          ...(spo2.value != null && { blood_oxygen: +spo2.value.toFixed(1) }),
          ...(heartRate.value != null && { heart_rate: +heartRate.value.toFixed(1) }),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'HTTP ' + res.status);
      }
      const data = await res.json();
      const r = mapAnalyzeResponse(data);
      r.epoch = ++liveEpoch;
      r.latency_ms = parseFloat((performance.now() - t0).toFixed(1));
      applyReading(smoother.apply(r));
      storeEpoch(r);
      streamIfSharing(r, snapshot, meta.sampleRate);
      return;
    } catch (err) {
      console.warn('Backend /analyze failed, falling back to local FFT:', err.message);
    }
  }
  // Local FFT fallback
  const r = analyzeLocal(snapshot, meta.sampleRate);
  if (!r) return;
  r.epoch = ++liveEpoch;
  r.latency_ms = parseFloat((performance.now() - t0).toFixed(1));
  applyReading(smoother.apply(r));
  storeEpoch(r);
  streamIfSharing(r, snapshot, meta.sampleRate);
}

// Persist the RAW (unsmoothed) reading to the active session (fire-and-forget).
function storeEpoch(r) {
  if (!activeSession.value || !r) return;
  sessionEpochCounter++;
  const elapsed = sessionStart ? (Date.now() - sessionStart.getTime()) / 1000 : null;
  const ch = r.chitta_bhumi || {};
  const sw = r.swara || {};
  const spectrum = r.eeg_spectrum || (r.band_powers && r.band_powers.relative) || {};
  const g = r.gunas || {};
  const swaraSimple = (sw.state || '').split(' ')[0] || null;

  const body = {
    epochNum: sessionEpochCounter,
    elapsedSeconds: elapsed ? +elapsed.toFixed(2) : null,
    chittaBhumi: ch.state || null,
    chittaConfidence: ch.confidence || null,
    contemplativeDepth: ch.depth || null,
    swara: swaraSimple,
    swaraConfidence: sw.confidence || null,
    bands: {
      delta: spectrum.delta ?? null, theta: spectrum.theta ?? null,
      alpha: spectrum.alpha ?? null, beta: spectrum.beta ?? null, gamma: spectrum.gamma ?? null,
    },
    gunas: { sattva: g.sattva ?? null, rajas: g.rajas ?? null, tamas: g.tamas ?? null, label: g.label || null },
    tattvaFlags: r.tattva_flags || [],
    bloodOxygen: r.blood_oxygen != null ? r.blood_oxygen : null,
    heartRate: r.heart_rate != null ? r.heart_rate : null,
    // Inner Texture (v3 deep-state features).
    vrittiIndex: r.vritti_index ?? null,
    nirodhaState: r.nirodha_state || null,
    complexity: r.complexity ? {
      lziv: r.complexity.lziv ?? null,
      higuchiFd: r.complexity.higuchi_fd ?? null,
      sampleEntropy: r.complexity.sample_entropy ?? null,
      permEntropy: r.complexity.perm_entropy ?? null,
    } : null,
    aperiodic: r.aperiodic ? {
      exponent: r.aperiodic.exponent ?? null,
      offset: r.aperiodic.offset ?? null,
    } : null,
    // Full-fidelity fields for offline classifier calibration (session export) —
    // all of these are already computed live in the reading object; without
    // capturing them here, Replay/Analyze and the Export TXT feature only ever
    // see the winning state, never the full picture behind it.
    probabilities: ch.probabilities || null,
    corroboration: ch.corroboration || null,
    faa: r.faa ?? null,
    plv: r.connectivity?.plv ?? null,
    lowBetaPower: spectrum.low_beta ?? null,
    highBetaPower: spectrum.high_beta ?? null,
    dataQuality: r.data_quality || null,
    swaraNote: sw.note || null,
    latencyMs: r.latency_ms ?? null,
  };
  api('POST', '/sessions/' + activeSession.value.id + '/epoch', body)
    .catch(err => console.warn('[Epoch store] failed:', err.message));
}

// ════════════════════════════════════════════════════════════════════════════
//  Live sharing — stream each epoch into the .NET hub group
// ════════════════════════════════════════════════════════════════════════════
// Fire-and-forget: a streaming hiccup must never disturb local display/storage.
function streamIfSharing(r, snapshot, sampleRate) {
  if (!sharing.value || !hubConn || hubConn.state !== 'Connected' || !shareInfo.value) return;
  const sid = shareInfo.value.sessionId;
  try {
    if (snapshot && snapshot.length) {
      // Full re-analysis on the hub (identical richness to /analyze).
      hubConn.invoke('StreamEpoch', {
        eeg_data: snapshot,
        sample_rate: sampleRate,
        ...(r.blood_oxygen != null && { blood_oxygen: r.blood_oxygen }),
        ...(r.heart_rate != null && { heart_rate: r.heart_rate }),
        session_id: sid,
      }).catch(() => {});
    } else {
      // Demo / bandless: relay the band powers so watchers still see the reading.
      const s = r.eeg_spectrum || (r.band_powers && r.band_powers.relative) || {};
      if (s.delta == null) return;
      hubConn.invoke('StreamBands', {
        delta: s.delta, theta: s.theta, alpha: s.alpha, beta: s.beta, gamma: s.gamma,
        ...(r.blood_oxygen != null && { blood_oxygen: r.blood_oxygen }),
        ...(r.heart_rate != null && { heart_rate: r.heart_rate }),
        session_id: sid,
      }).catch(() => {});
    }
  } catch { /* connection raced closed — ignore */ }
}

async function goLive() {
  if (sharePending.value || sharing.value) return;
  sharePending.value = true;
  shareError.value = '';
  try {
    // A live sitting always records: if no session is running, start one silently.
    // For a linked student the server auto-binds it to their instructor's client
    // record, so the instructor sees the history there afterwards.
    if (!activeSession.value) {
      const clientId = selectedClientId.value && selectedClientId.value !== NEW_CLIENT
        ? selectedClientId.value : null;
      const sess = await api('POST', '/sessions/start', {
        name: t('liveSittingPrefix') + new Date().toLocaleDateString(),
        client_id: clientId,
        activity: activity.value.trim() || null,
      });
      beginSession(sess);
    }
    shareAccess = await getEegAccess();
    hubConn = buildHub(shareAccess.backendUrl, shareAccess.token);
    // The hub announces watchers to the session group; we join our own group
    // (owner path, no token) so the indicator below stays truthful.
    hubConn.on('watcher_joined', (e) => { watchers.value = [...watchers.value, e.name]; });
    hubConn.on('watcher_left', (e) => {
      const i = watchers.value.indexOf(e.name);
      if (i >= 0) watchers.value = watchers.value.toSpliced(i, 1);
    });
    await hubConn.start();
    // Consolidated (.NET): the control-hub session IS the hub session — one id.
    // Legacy (Express): create a separate .NET session for the hub.
    let hubSessionId;
    if (isDotnet()) {
      hubSessionId = activeSession.value.id;
    } else {
      const sess = await netFetch(shareAccess.backendUrl, shareAccess.token, 'POST', '/sessions',
        { label: activeSession.value?.name || t('liveSittingFallback') });
      hubSessionId = sess.id;
    }
    await hubConn.invoke('WatchSession', hubSessionId, null); // owner join — no token
    // Both keys sent; each backend reads the one it knows (sessionId / netSessionId).
    await api('POST', '/live/start', { sessionId: hubSessionId, netSessionId: hubSessionId });
    shareInfo.value = { sessionId: hubSessionId };
    sharing.value = true;
  } catch (err) {
    shareError.value = err.message || t('shareCouldNotGoLive');
    await teardownShare();
  } finally {
    sharePending.value = false;
  }
}

async function stopLive() {
  const info = shareInfo.value;
  const access = shareAccess;
  sharing.value = false;
  api('POST', '/live/stop').catch(() => {});
  if (info) {
    // Best-effort revoke + end so any active instructor grant dies immediately.
    if (isDotnet()) {
      api('POST', `/sessions/${info.sessionId}/watch-token/revoke`).catch(() => {});
      api('POST', `/sessions/${info.sessionId}/end`).catch(() => {});
    } else if (access) {
      netFetch(access.backendUrl, access.token, 'POST', `/sessions/${info.sessionId}/watch-token/revoke`).catch(() => {});
      netFetch(access.backendUrl, access.token, 'POST', `/sessions/${info.sessionId}/end`).catch(() => {});
    }
  }
  await teardownShare();
}

async function teardownShare() {
  sharing.value = false;
  shareInfo.value = null;
  watchers.value = [];
  if (hubConn) { try { await hubConn.stop(); } catch { /* ignore */ } hubConn = null; }
  shareAccess = null;
}

const watcherNames = computed(() => [...new Set(watchers.value)].join(', '));

// ════════════════════════════════════════════════════════════════════════════
//  Connect / Demo controls
// ════════════════════════════════════════════════════════════════════════════
async function toggleConnect() {
  if (connected.value) {
    driver.disconnect();
    mode.value = 'idle';
    return;
  }
  if (mode.value === 'demo') stopDemo();
  smoother.reset();
  await driver.connect();
  if (connected.value) {
    mode.value = 'bluetooth';
    board.value = deviceName.value || 'BLE headband';
    modeHint.value = backendUrl ? t('modeBleRender') : t('modeBleLocal');
  }
}

function toggleDemo() {
  if (mode.value === 'demo') { stopDemo(); return; }
  if (connected.value) driver.disconnect();
  mode.value = 'demo';
  smoother.reset();
  demoSource = createDemoSource();
  const run = () => {
    const r = demoSource.next();
    applyReading(smoother.apply(r));
    storeEpoch(r);
    streamIfSharing(r, null, null);
  };
  run();
  demoTimer = setInterval(run, DEMO_INTERVAL);
}

function stopDemo() {
  clearInterval(demoTimer); demoTimer = null;
  demoSource = null;
  if (mode.value === 'demo') mode.value = 'idle';
}

// ════════════════════════════════════════════════════════════════════════════
//  Sessions
// ════════════════════════════════════════════════════════════════════════════
async function loadClients() {
  if (!isElevated()) return; // students have no client list — binding is server-side
  try { clients.value = await api('GET', '/clients'); }
  catch { /* leave the default "No client" option */ }
}

async function loadHistory() {
  try { history.value = (await api('GET', '/sessions/mine')).slice(0, 5); }
  catch { /* ignore */ }
}

async function loadPractices() {
  try { practiceTypes.value = (await api('GET', '/activities')).map((a) => a.name); }
  catch { /* picker still accepts free text */ }
}

function fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }
function fmtTime(sec) {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function startSession() {
  // Quick-add: create a standalone client for the student, then bind the session.
  let clientId = selectedClientId.value || null;
  if (clientId === NEW_CLIENT) {
    const studentName = newClientName.value.trim();
    if (!studentName) { alert(t('alertEnterStudentName')); return; }
    try {
      const created = await api('POST', '/clients', { name: studentName });
      clients.value = [...clients.value, created];
      selectedClientId.value = created.id;
      clientId = created.id;
      newClientName.value = '';
    } catch (err) {
      alert(t('alertCouldNotCreateStudent') + err.message);
      return;
    }
  }

  const name = prompt(t('promptSessionName'), t('sessionDefaultPrefix') + new Date().toLocaleDateString());
  if (name === null) return;
  try {
    const sess = await api('POST', '/sessions/start', {
      name: name.trim() || t('defaultNewSessionName'),
      client_id: clientId,
      activity: activity.value.trim() || null,
    });
    beginSession(sess);
  } catch (err) {
    alert(t('failedToStartSessionPrefix') + err.message);
  }
}

// Shared bookkeeping once a session row exists (manual start or Go Live auto-start).
function beginSession(sess) {
  activeSession.value = sess;
  sessionStart = new Date();
  sessionEpochCounter = 0;
  sessionElapsed.value = 0;
  notes.value = '';
  clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    sessionElapsed.value = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
  }, 1000);
}

async function endSession() {
  if (!activeSession.value) return;
  try { await api('POST', '/sessions/' + activeSession.value.id + '/end'); }
  catch { /* ignore */ }
  clearInterval(sessionTimer); sessionTimer = null;
  activeSession.value = null;
  await loadHistory();
}

function onNotesInput() {
  if (!activeSession.value) return;
  clearTimeout(notesTimeout);
  notesTimeout = setTimeout(async () => {
    try { await api('PUT', '/sessions/' + activeSession.value.id + '/notes', { content: notes.value }); }
    catch { /* retry on next keystroke */ }
  }, 800);
}

async function pingBackend() {
  if (!backendUrl) return;
  try {
    const res = await fetch(backendUrl + '/status', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      board.value = t('renderBackendLabel');
      modeHint.value = data.model_ready ? t('statusReady') : t('statusLoadingModelDots');
    }
  } catch {
    board.value = t('statusBackendWaking');
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Canvas waveform (imperative — the one sanctioned exception)
// ════════════════════════════════════════════════════════════════════════════
function resizeCanvas() {
  const c = canvasEl.value;
  if (!c) return;
  c.width = c.offsetWidth;
  c.height = c.offsetHeight;
}

function drawWave() {
  const c = canvasEl.value;
  if (!c) { rafId = requestAnimationFrame(drawWave); return; }
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const cy = H / 2;

  const ch0 = connected.value ? latestSamples.value?.[0] : null;
  if (ch0 && ch0.length > 1) {
    const len = Math.min(ch0.length, WAVE_LEN);
    const raw = ch0.slice(ch0.length - len);
    // Trailing moving-average to tame per-sample noise and blink spikes.
    const win = 6;
    const sm = new Array(len);
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += raw[i];
      if (i >= win) sum -= raw[i - win];
      sm[i] = sum / Math.min(i + 1, win);
    }
    // Detrend against the window mean, then auto-scale to the window's own peak.
    // Raw EEG can ride on a large electrode DC offset — BrainBit streams it
    // DC-coupled (~-0.13 V), Muse arrives near zero. Without this, the fixed gain
    // flung the DC-heavy BrainBit trace ~50 canvas-heights off-screen (blank
    // graph) while every derived figure kept animating (band powers ignore the
    // 0 Hz bin, PLV is offset-invariant). Subtracting the mean removes the
    // pedestal; auto-gain to peak makes ~200 µV of real signal fill the panel on
    // any device. A µV-floor stops a flat/noisy window from being blown up.
    const mean = sm.reduce((a, b) => a + b, 0) / len;
    let peak = 0;
    for (let i = 0; i < len; i++) { const d = Math.abs(sm[i] - mean); if (d > peak) peak = d; }
    const gain = (H * 0.42) / Math.max(peak, 2e-5); // 2e-5 V ≈ 20 µV floor
    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * W;
      const y = cy - (sm[i] - mean) * gain;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else {
    wavePhase += 0.015;
    const bp = lastBands.value;
    const swell = (bp.alpha || 0.28) * (H * 0.30);
    const ripple = ((bp.low_beta || 0.18) + (bp.high_beta || 0.13)) * (H * 0.06);
    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    for (let i = 0; i <= WAVE_LEN; i++) {
      const x = (i / WAVE_LEN) * W;
      const t = (i / WAVE_LEN) * Math.PI * 4 + wavePhase;
      const y = cy + Math.sin(t) * swell + Math.sin(t * 2.6) * ripple;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  rafId = requestAnimationFrame(drawWave);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  driver.onEpoch(onEpochComplete);
  accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  rafId = requestAnimationFrame(drawWave);
  loadClients();
  loadHistory();
  loadPractices();
  pingBackend();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('resize', resizeCanvas);
  clearInterval(demoTimer);
  clearInterval(sessionTimer);
  clearTimeout(notesTimeout);
  if (sharing.value) stopLive(); else teardownShare();
  if (connected.value) driver.disconnect();
});
</script>

<template>
  <div class="monitor">
    <div class="topbar"><div class="topbar__title">{{ t('navLiveMonitor') }}</div></div>

    <div class="dashboard-grid">
      <!-- ─ Device / Session Command Bar ─ -->
      <div class="command-bar card">
        <div class="command-bar__group command-bar__conn">
          <span class="status-dot" :class="statusInfo.cls"></span>
          <div v-if="connected" class="bt-device-row">
            <span class="bt-device-name">{{ deviceName || t('deviceFallback') }}</span>
            <button class="btn btn-ghost btn-sm" @click="toggleConnect">{{ t('disconnect') }}</button>
          </div>
          <button
            v-else class="btn btn-secondary btn-sm" :disabled="connecting"
            @click="toggleConnect"
          >
            <span class="btn-icon">📡</span> {{ connecting ? t('statusConnecting') : t('connect') }}
          </button>
          <button class="btn btn-secondary btn-sm" @click="toggleDemo">
            {{ mode === 'demo' ? t('stopDemoLabel') : t('demoLabel') }}
          </button>
          <div v-if="battery != null" class="cmd-battery">
            <span class="cmd-battery__icon">🔋</span><span class="cmd-battery__val">{{ localizeNumber(battery) }}%</span>
          </div>
        </div>

        <div class="command-bar__group command-bar__session">
          <button
            v-if="!sharing" class="btn btn-secondary btn-sm" :disabled="sharePending"
            :title="t('goLiveHint')"
            @click="goLive"
          >
            <span class="btn-icon">📶</span> {{ sharePending ? t('goLiveStarting') : t('goLiveLabel') }}
          </button>
          <button v-else class="btn btn-danger btn-sm" @click="stopLive">
            <span class="btn-icon">⏹</span> {{ t('stopLiveLabel') }}
          </button>
          <!-- Client binding is instructor work; a student's session auto-binds server-side. -->
          <select v-if="isElevated()" v-model="selectedClientId" class="cmd-client-select" :title="t('clientSelectTitle')">
            <option value="">{{ t('noClient') }}</option>
            <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
            <option :value="NEW_CLIENT">{{ t('newStudentOption') }}</option>
          </select>
          <input
            v-if="isElevated() && selectedClientId === NEW_CLIENT"
            v-model="newClientName" class="cmd-new-client" type="text"
            :placeholder="t('studentNamePlaceholder')" @keyup.enter="startSession"
          />
          <input
            v-if="!activeSession"
            v-model="activity" class="cmd-activity" type="text" list="practice-types"
            :placeholder="t('practicePlaceholder')" :title="t('practiceTitle')"
            @keyup.enter="startSession"
          />
          <datalist id="practice-types">
            <option v-for="p in practiceTypes" :key="p" :value="p" />
          </datalist>
          <button v-if="!activeSession" class="btn btn-primary btn-sm" @click="startSession">
            <span class="btn-icon">⏺</span> {{ t('startSession') }}
          </button>
          <template v-else>
            <div class="session-timer-row">
              <span class="session-name-display">{{ activeSession.name }}</span>
              <span v-if="activeSession.activity" class="session-activity">{{ activeSession.activity }}</span>
              <span class="session-timer">{{ localizeNumber(fmtTime(sessionElapsed)) }}</span>
            </div>
            <button class="btn btn-danger btn-sm" @click="endSession">{{ t('endSession') }}</button>
          </template>
        </div>
      </div>

      <!-- ─ Live panel ─ -->
      <div v-if="sharing || shareError" class="card share-card">
        <div class="share-head">
          <span class="card-label">{{ t('liveTag') }}</span>
          <span v-if="sharing" class="share-live-dot">{{ t('liveDot') }}</span>
        </div>
        <div v-if="shareError" class="share-error">{{ shareError }}</div>
        <template v-if="sharing">
          <p class="share-hint">{{ t('shareHint') }}</p>
          <div v-if="watchers.length" class="share-watched">
            <span class="share-watched-dot">●</span>
            {{ t('shareWatchedByPrefix') }}<strong>{{ watcherNames }}</strong>
          </div>
          <div v-else class="share-watched muted">{{ t('shareNoWatchers') }}</div>
        </template>
      </div>

      <!-- ─ Live Metric Bar ─ -->
      <div class="metric-bar card">
        <div class="metric-item">
          <span class="metric-label">{{ t('metricEpoch') }}</span>
          <span class="metric-value">{{ epochLabel }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricQuality') }}</span>
          <span class="metric-value">{{ qualityLabel }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricLatency') }}</span>
          <span class="metric-value">{{ latencyLabel }} <span class="metric-unit">ms</span></span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricBuffer') }}</span>
          <span class="metric-value">{{ bufferLabel }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricMode') }}</span>
          <span class="metric-value">{{ modeLabel }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricBoard') }}</span>
          <span class="metric-value">{{ board }}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">{{ t('metricStatus') }}</span>
          <div class="status-indicator">
            <span class="status-dot" :class="statusInfo.cls"></span>
            <span class="status-text">{{ statusInfo.text }}</span>
          </div>
        </div>
      </div>

      <!-- ─ EEG Waveform Canvas ─ -->
      <div class="card canvas-card">
        <canvas ref="canvasEl"></canvas>
      </div>

      <!-- ─ Rich per-reading display (shared with the instructor Watch view) ─ -->
      <ReadingPanel
        :reading="reading" :has-p-p-g="hasPPG"
        :spo2-fallback="spo2" :hr-fallback="heartRate"
        :hr-stale="mode === 'bluetooth' && hrStale" :spo2-stale="mode === 'bluetooth' && spo2Stale"
      />

      <!-- ─ Session Notes ─ -->
      <div class="card session-card">
        <div class="card-label">{{ t('sessionNotesTitle') }}</div>
        <div class="session-notes-section">
          <textarea
            v-model="notes" class="session-notes-input" rows="3"
            :placeholder="t('sessionNotesPlaceholder')" :disabled="!activeSession"
            @input="onNotesInput"
          ></textarea>
        </div>
      </div>

      <!-- ─ Session History ─ -->
      <div class="card history-card">
        <div class="history-header">
          <span class="card-label">{{ t('sessionHistoryTitle') }}</span>
          <button class="btn btn-ghost btn-sm" @click="historyOpen = !historyOpen">
            {{ historyOpen ? t('hide') : t('show') }}
          </button>
        </div>
        <div v-show="historyOpen" class="history-list">
          <div v-if="!history.length" class="history-empty">{{ t('noSessionsYet') }}</div>
          <div v-for="s in history" :key="s.id" class="history-item">
            {{ s.name }} — {{ fmtDate(s.startTime) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Monitor-specific chrome: command bar, metric bar, canvas, share panel, session,
   history. The rich reading cards + their styles live in ReadingPanel.vue. */
.monitor { max-width: 1200px; margin: 0 auto; padding: 24px; }

.topbar { margin-bottom: 16px; }
.topbar__title { font-family: var(--font-serif); font-size: 17px; color: var(--text); letter-spacing: -0.01em; }

.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

/* ─── Buttons ─── */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 13px; font-family: var(--font); font-weight: 500; transition: background 0.15s, opacity 0.15s; white-space: nowrap; }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn-primary   { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #C4673E; }
.btn-secondary { background: var(--bg-card-2); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--border); }
.btn-ghost     { background: transparent; color: var(--text-mid); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--bg-card-2); }
.btn-danger    { background: #C75C5C; color: #fff; }
.btn-danger:hover { background: #a84040; }
.btn-sm        { padding: 5px 10px; font-size: 12px; }
.btn-icon      { font-size: 16px; }

/* ─── Command bar ─── */
.command-bar { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 20px; padding: 12px 16px; }
.command-bar__group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.command-bar__conn { flex: 1; min-width: 260px; }
.command-bar__session { justify-content: flex-end; }
.bt-device-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 10px; background: var(--bg-card-2); border-radius: var(--radius-sm); border: 1px solid var(--border); flex: 0 1 auto; }
.bt-device-name { font-size: 13px; font-weight: 600; color: var(--text); }
.command-bar .session-timer-row { min-width: 120px; gap: 12px; }
.cmd-battery { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
.cmd-battery__icon { font-size: 13px; }
.cmd-client-select { padding: 5px 10px; font-size: 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card-2); color: var(--text); max-width: 180px; cursor: pointer; }
.cmd-new-client { padding: 5px 10px; font-size: 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card-2); color: var(--text); width: 150px; }
.cmd-new-client:focus { outline: none; border-color: var(--accent); }
.cmd-activity { padding: 5px 10px; font-size: 13px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-card-2); color: var(--text); width: 170px; }
.cmd-activity:focus { outline: none; border-color: var(--accent); }
.session-activity { font-size: 12px; color: var(--accent); font-weight: 600; }

/* ─── Live share panel ─── */
.share-card { grid-column: 1 / -1; }
.share-head { display: flex; align-items: center; justify-content: space-between; }
.share-live-dot { font-size: 11px; font-weight: 700; color: #C75C5C; letter-spacing: 0.04em; }
.share-error { font-size: 13px; color: #C75C5C; }
.share-hint { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin: 4px 0 10px; }
.share-watched { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); background: var(--bg-card-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; }
.share-watched.muted { color: var(--text-muted); }
.share-watched-dot { color: #C75C5C; animation: pulse 1.4s ease-in-out infinite; }

/* ─── Metric bar ─── */
.metric-bar { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 0; padding: 0; overflow: hidden; }
.metric-item { flex: 1; min-width: 100px; display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-right: 1px solid var(--border-light); }
.metric-item:last-child { border-right: none; }
.metric-label { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.metric-value { font-size: 13px; font-weight: 600; color: var(--text); }
.metric-unit  { font-size: 10px; color: var(--text-muted); }
.status-indicator { display: flex; align-items: center; gap: 6px; }
.status-dot  { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.status-dot.connected { background: var(--alpha); box-shadow: 0 0 6px var(--alpha); }
.status-dot.waking    { background: var(--beta); animation: pulse 1.4s ease-in-out infinite; }
.status-dot.bluetooth { background: var(--ekagra); box-shadow: 0 0 6px var(--ekagra); }
.status-dot.error     { background: var(--gamma); }
.status-text { font-size: 12px; color: var(--text-mid); }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ─── Canvas ─── */
.canvas-card { grid-column: 1 / -1; padding: 0; overflow: hidden; }
.canvas-card canvas { display: block; width: 100%; height: 110px; }

/* ─── Session / History ─── */
.session-card { grid-column: span 2; }
.session-timer-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.session-name-display { font-size: 13px; font-weight: 600; color: var(--text-mid); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-timer { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); }
.session-notes-section { display: flex; flex-direction: column; gap: 6px; }
.session-notes-input   { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 13px; font-family: var(--font); resize: vertical; transition: border-color 0.15s; }
.session-notes-input:focus { outline: none; border-color: var(--accent); }
.session-notes-input:disabled { opacity: 0.6; }
.history-card  { grid-column: 1 / -1; }
.history-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.history-list   { display: flex; flex-direction: column; gap: 8px; }
.history-empty  { font-size: 13px; color: var(--text-muted); padding: 12px 0; }
.history-item   { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--bg-card-2); border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-size: 13px; color: var(--text); }

/* ─── Responsive ─── */
@media (max-width: 900px) {
  .dashboard-grid { grid-template-columns: 1fr 1fr; }
  .metric-item { min-width: 50%; border-right: none; border-bottom: 1px solid var(--border-light); }
}
@media (max-width: 600px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}
</style>
