<script setup>
// Replay view — ports the legacy <section data-view="replay"> + replay engine
// (onShowReplay / loadReplayData / start|stopReplay / updateReplayDisplay /
//  renderReplayScrubber / renderReplayMetrics) from index.html + app.js.
//
// Transport (play/pause/prev/next + speed) and the per-epoch state readout are
// pure reactive state — the readout binds the fields of replayEpochs[replayIndex]
// directly (no applyReading / DOM writes). A setInterval driven by `playing`
// advances the index; it is cleared on unmount.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { api } from '@/lib/api';

// ── helpers (ported from app.js) ──────────────────────────────────────────
function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}
function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── reactive state ────────────────────────────────────────────────────────
const sessions = ref([]);
const replaySessionId = ref('');
const replayEpochs = ref([]);
const replayIndex = ref(0);
const playing = ref(false);
const speed = ref(1);           // playback multiplier 0.5×–4×
const viewMeta = ref('');
const phases = ref([]);         // from /analytics
const totalSeconds = ref(0);
const summary = ref({});        // /analytics summary for the metrics strip

let timer = null;

// ── derived ──────────────────────────────────────────────────────────────
const hasData = computed(() => replayEpochs.value.length > 0);
const currentEpoch = computed(() => replayEpochs.value[replayIndex.value] || null);
const maxIndex = computed(() => Math.max(0, replayEpochs.value.length - 1));

const epochLabel = computed(() =>
  hasData.value ? `${replayIndex.value + 1} / ${replayEpochs.value.length}` : '—');
const timeLabel = computed(() => {
  const ep = currentEpoch.value;
  return ep && ep.elapsedSeconds != null ? formatTime(ep.elapsedSeconds) : '—';
});

// per-epoch state readout — bound directly from the current epoch
const stateVal = computed(() => currentEpoch.value?.chittaBhumi || '—');
const swaraVal = computed(() => currentEpoch.value?.swara || '—');
const gunaVal = computed(() => currentEpoch.value?.gunas?.label || '—');
const alphaVal = computed(() => {
  const a = currentEpoch.value?.bands?.alpha;
  return a != null ? Math.round(a * 100) + '%' : '—';
});
const spo2Val = computed(() => {
  const v = currentEpoch.value?.bloodOxygen;
  return v != null ? v.toFixed(1) + '%' : '—';
});
const hrVal = computed(() => {
  const v = currentEpoch.value?.heartRate;
  return v != null ? v.toFixed(0) + ' bpm' : '—';
});

// phase-colored scrubber segments, positioned by each phase's time span
const PHASE_COLORS = {
  Mudha: '#8A8F98',
  Kshipta: 'var(--kshipta)',
  Vikshipta: 'var(--vikshipta)',
  Ekagra: 'var(--ekagra)',
  Niruddha: 'var(--niruddha)',
};
const scrubberSegments = computed(() => {
  const total = totalSeconds.value > 0 ? totalSeconds.value : null;
  if (!phases.value.length || !total) return [];
  return phases.value.map(p => {
    const from = p.fromSeconds ?? 0, to = p.toSeconds ?? from;
    const left = Math.max(0, Math.min(100, from / total * 100));
    const width = Math.max(0.5, Math.min(100 - left, (to - from) / total * 100));
    return {
      state: p.state,
      style: {
        left: left.toFixed(2) + '%',
        width: width.toFixed(2) + '%',
        background: PHASE_COLORS[p.state] || 'var(--text-muted)',
      },
    };
  });
});

// honest session metrics strip — only real /analytics fields
const metricsCells = computed(() => {
  const s = summary.value;
  return [
    ['Dominant state', s.dominantState || '—'],
    ['Dominant guṇa', s.dominantGuna ? capitalize(s.dominantGuna) : '—'],
    ['Avg SpO₂', s.avgSpo2 != null ? s.avgSpo2.toFixed(1) + '%' : '—'],
    ['Avg HR', s.avgHr != null ? Math.round(s.avgHr) + ' bpm' : '—'],
    ['Epochs', s.totalEpochs != null ? String(s.totalEpochs) : '—'],
  ];
});

// ── transport ────────────────────────────────────────────────────────────
function setIndex(idx) {
  if (!hasData.value) return;
  replayIndex.value = Math.max(0, Math.min(idx, maxIndex.value));
}
function step(delta) { setIndex(replayIndex.value + delta); }

function startReplay() {
  if (!hasData.value) return;
  // parked at the end → restart from the top instead of dead-stopping
  if (replayIndex.value >= maxIndex.value) setIndex(0);
  playing.value = true;
  clearInterval(timer);
  timer = setInterval(() => {
    if (replayIndex.value >= maxIndex.value) { stopReplay(); return; }
    step(1);
  }, 1500 / speed.value);
}
function stopReplay() {
  playing.value = false;
  clearInterval(timer);
  timer = null;
}
function togglePlay() { playing.value ? stopReplay() : startReplay(); }

function onSpeedChange() {
  speed.value = parseFloat(speed.value) || 1;
  if (playing.value) { stopReplay(); startReplay(); } // re-arm timer at new cadence
}

// ── data loading ──────────────────────────────────────────────────────────
async function onShowReplay() {
  try {
    const list = await api('GET', '/sessions/mine');
    sessions.value = Array.isArray(list) ? list : [];
    if (!sessions.value.length) {
      replaySessionId.value = '';
      return resetData();
    }
    const target = replaySessionId.value || sessions.value[0].id;
    replaySessionId.value = sessions.value.some(s => String(s.id) === String(target))
      ? String(target) : String(sessions.value[0].id);
    await loadReplayData();
  } catch {
    resetData();
  }
}

function resetData() {
  stopReplay();
  replayEpochs.value = [];
  replayIndex.value = 0;
  phases.value = [];
  totalSeconds.value = 0;
  summary.value = {};
  viewMeta.value = '';
}

async function loadReplayData() {
  resetData();
  const sid = replaySessionId.value;
  if (!sid) return;

  try {
    const data = await api('GET', '/sessions/' + sid + '/epochs');
    replayEpochs.value = Array.isArray(data) ? data : (data.epochs || []);
  } catch {
    replayEpochs.value = [];
    return;
  }

  // Session-level readout: phase scrubber + honest metrics from /analytics.
  // These are enrichments — replay still works without them.
  try {
    const a = await api('GET', '/sessions/' + sid + '/analytics');
    phases.value = a.phases || [];
    totalSeconds.value = a.summary?.durationSeconds || 0;
    summary.value = a.summary || {};
    viewMeta.value = a.summary?.totalEpochs
      ? `${a.summary.totalEpochs} epochs · ${formatDuration(a.summary.durationSeconds || 0)}` : '';
  } catch { /* ignore */ }

  replayIndex.value = 0;
}

function onSessionChange() { loadReplayData(); }

// ── keyboard (only while mounted) ──────────────────────────────────────────
function onKeydown(e) {
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); step(1); }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  onShowReplay();
});
onBeforeUnmount(() => {
  stopReplay();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="replay-view">
    <header class="replay-header">
      <select class="cmd-client-select" v-model="replaySessionId" @change="onSessionChange">
        <option v-if="!sessions.length" value="">No sessions</option>
        <option v-for="s in sessions" :key="s.id" :value="String(s.id)">
          {{ s.name }}{{ s.activity ? ' · ' + s.activity : '' }} — {{ new Date(s.startTime).toLocaleDateString() }}
        </option>
      </select>
      <span class="analyze__meta">{{ viewMeta }}</span>
    </header>

    <div class="metrics-strip">
      <div class="metrics-strip__cell" v-for="[label, value] in metricsCells" :key="label">
        <span class="metrics-strip__label">{{ label }}</span>
        <span class="metrics-strip__value">{{ value }}</span>
      </div>
    </div>

    <div class="card replay-player">
      <div class="replay-controls">
        <button class="btn btn-ghost btn-sm replay-btn" title="Previous"
                :disabled="!hasData" @click="step(-1)">⏮</button>
        <button class="btn btn-primary btn-sm replay-btn"
                :disabled="!hasData" @click="togglePlay">
          {{ playing ? '⏸ Pause' : '▶ Play' }}
        </button>
        <button class="btn btn-ghost btn-sm replay-btn" title="Next"
                :disabled="!hasData" @click="step(1)">⏭</button>
        <select class="cmd-client-select replay-speed" title="Playback speed"
                v-model="speed" @change="onSpeedChange">
          <option :value="0.5">0.5×</option>
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="4">4×</option>
        </select>
      </div>

      <div class="scrubber">
        <div class="scrubber__track">
          <span class="scrubber__phase" v-for="(seg, i) in scrubberSegments" :key="i"
                :style="seg.style" :title="seg.state"></span>
        </div>
        <input type="range" class="replay-slider" min="0" :max="maxIndex"
               :value="replayIndex" @input="setIndex(parseInt($event.target.value, 10))" />
      </div>

      <div class="replay-meta">
        <span>{{ epochLabel }}</span>
        <span class="replay-time">{{ timeLabel }}</span>
      </div>

      <div class="replay-state-display" v-if="hasData">
        <div class="replay-state-row">
          <span class="replay-state-key">State</span>
          <span class="replay-state-val">{{ stateVal }}</span>
        </div>
        <div class="replay-state-row">
          <span class="replay-state-key">Swara</span>
          <span class="replay-state-val">{{ swaraVal }}</span>
        </div>
        <div class="replay-state-row">
          <span class="replay-state-key">Dominant Guna</span>
          <span class="replay-state-val">{{ gunaVal }}</span>
        </div>
        <div class="replay-state-row">
          <span class="replay-state-key">Alpha Power</span>
          <span class="replay-state-val">{{ alphaVal }}</span>
        </div>
        <div class="replay-state-row">
          <span class="replay-state-key">SpO₂</span>
          <span class="replay-state-val">{{ spo2Val }}</span>
        </div>
        <div class="replay-state-row">
          <span class="replay-state-key">Heart Rate</span>
          <span class="replay-state-val">{{ hrVal }}</span>
        </div>
      </div>

      <div class="replay-no-data" v-else>No epoch data available for this session.</div>
    </div>
  </div>
</template>

<style scoped>
/* ── Replay Player (ported from legacy style.css) ───────────────────────── */
.replay-player { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.replay-controls { display: flex; gap: 8px; align-items: center; }
.replay-btn { min-width: 40px; }
.replay-slider { flex: 1; cursor: pointer; accent-color: var(--accent); }
.replay-meta { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); align-items: center; }
.replay-time { margin-left: auto; }
.replay-state-display {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 16px;
}
.replay-state-row { display: flex; flex-direction: column; gap: 2px; }
.replay-state-key { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
.replay-state-val { font-size: 14px; font-weight: 600; color: var(--text); }
.replay-no-data { font-size: 13px; color: var(--text-muted); text-align: center; padding: 16px 0; font-style: italic; }

.replay-header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }

/* metrics strip */
.metrics-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 12px; }
.metrics-strip__cell {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.metrics-strip__label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
.metrics-strip__value { font-size: 16px; font-weight: 700; color: var(--text); }

/* scrubber */
.scrubber { position: relative; padding: 10px 0; }
.scrubber__track {
  position: absolute; top: 50%; left: 0; right: 0; height: 8px;
  transform: translateY(-50%); background: var(--bg-card-2);
  border-radius: 4px; overflow: hidden;
}
.scrubber__phase { position: absolute; top: 0; bottom: 0; opacity: 0.8; }
.scrubber .replay-slider { position: relative; width: 100%; margin: 0; background: transparent; }
</style>
