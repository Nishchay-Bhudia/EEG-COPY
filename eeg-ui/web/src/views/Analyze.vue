<script setup>
// Analyze view — port of the legacy <section data-view="analyze"> +
// onShowAnalyze / loadAnalyzeSession (app.js). Read-only: pick a recorded
// session, fetch its /analytics + /epochs, and render six SVG instruments.
//
// The legacy code poked six element IDs with innerHTML. Here the summary/epochs
// land in reactive refs, each instrument is a computed markup string, and the
// <svg> renders it via v-html (the ONE sanctioned v-html use — see
// instruments.js, whose builders escape any untrusted labels themselves).
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import {
  VIEWBOX,
  bandRadar,
  gunaTriangle,
  bhumiRing,
  swaraGauge,
  depthMeter,
  sensorSchematic,
} from '@/lib/instruments';

// ── local helper (ported verbatim from app.js formatDuration) ────────────────
function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

// ── reactive state ───────────────────────────────────────────────────────────
const sessions = ref([]);        // [{ id, name, startTime }]
const selectedId = ref('');      // bound to the <select>
const summary = ref(null);       // analytics.summary, or null when nothing to show
const epochs = ref([]);          // /epochs rows (drive the depth meter)
const emptyMessage = ref(
  'Pick a recorded session to see its guṇa, chitta-bhūmi, svara and band-power profile.'
);

// summary != null ⇒ we have epoch data → show the instrument grid.
const hasData = computed(() => summary.value != null);

const meta = computed(() => {
  const s = summary.value;
  if (!s) return '';
  return `${s.totalEpochs} epochs · ${formatDuration(s.durationSeconds || 0)} · dominant: ${s.dominantState || '—'}`;
});

// ── instrument markup strings (bound with v-html) ────────────────────────────
const radarSvg  = computed(() => bandRadar(summary.value?.avgBands || {}));
const gunaSvg   = computed(() => gunaTriangle(summary.value?.avgGunas || {}));
const bhumiSvg  = computed(() => bhumiRing(summary.value?.stateCounts || {}));
const swaraSvg  = computed(() => swaraGauge(summary.value?.swaraCounts || {}));
const depthSvg  = computed(() => depthMeter(epochs.value, summary.value || {}));
const sensorSvg = computed(() => sensorSchematic(summary.value?.avgBands || {}));

// ── data loading ─────────────────────────────────────────────────────────────
function toEmpty(msg) {
  summary.value = null;
  epochs.value = [];
  emptyMessage.value = msg;
}

async function loadSession(id) {
  selectedId.value = id;
  if (!id) return;
  try {
    const a = await api('GET', `/sessions/${id}/analytics`);
    if (!a.summary || !a.summary.totalEpochs) {
      toEmpty('This session has no epoch data to analyze.');
      return;
    }
    const eps = await api('GET', `/sessions/${id}/epochs`).catch(() => []);
    epochs.value = Array.isArray(eps) ? eps : [];
    summary.value = a.summary;
  } catch (err) {
    toEmpty('Could not load analytics: ' + err.message);
  }
}

onMounted(async () => {
  try {
    const rows = await api('GET', '/sessions/mine');
    if (!rows.length) {
      sessions.value = [];
      toEmpty('Record a session first, then analyze it here.');
      return;
    }
    sessions.value = rows;
    await loadSession(String(rows[0].id));
  } catch (err) {
    toEmpty('Could not load sessions: ' + err.message);
  }
});
</script>

<template>
  <div class="analyze">
    <header class="analyze__bar">
      <select
        class="cmd-client-select"
        :value="selectedId"
        @change="loadSession($event.target.value)"
      >
        <option v-if="!sessions.length" value="">No sessions</option>
        <option v-for="s in sessions" :key="s.id" :value="String(s.id)">
          {{ s.name }} — {{ new Date(s.startTime).toLocaleDateString() }}
        </option>
      </select>
      <span class="analyze__meta">{{ meta }}</span>
    </header>

    <div v-if="!hasData" class="view-stub">
      <div class="view-stub__card">
        <h2>Analyze</h2>
        <p>{{ emptyMessage }}</p>
      </div>
    </div>

    <div v-else class="analyze-grid">
      <div class="card">
        <div class="card-label">BAND POWER SPECTRUM</div>
        <svg class="an-svg" :viewBox="VIEWBOX.bandRadar" v-html="radarSvg"></svg>
      </div>
      <div class="card">
        <div class="card-label">TRIGUṆA BALANCE</div>
        <svg class="an-svg" :viewBox="VIEWBOX.gunaTri" v-html="gunaSvg"></svg>
      </div>
      <div class="card">
        <div class="card-label">CHITTA-BHŪMI DISTRIBUTION</div>
        <svg class="an-svg" :viewBox="VIEWBOX.bhumiRing" v-html="bhumiSvg"></svg>
      </div>
      <div class="card">
        <div class="card-label">SVARA / NĀḌĪ BALANCE</div>
        <svg class="an-svg an-svg--short" :viewBox="VIEWBOX.swaraGauge" v-html="swaraSvg"></svg>
      </div>
      <div class="card">
        <div class="card-label">CONTEMPLATIVE DEPTH</div>
        <svg class="an-svg an-svg--short" :viewBox="VIEWBOX.depthMeter" v-html="depthSvg"></svg>
      </div>
      <div class="card">
        <div class="card-label">SENSOR LAYOUT</div>
        <svg class="an-svg" :viewBox="VIEWBOX.sensor" v-html="sensorSvg"></svg>
        <p class="an-disclaimer">
          4-channel headband. Values are whole-head averages — per-electrode
          localization is not recorded and not implied.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ported from style.css: shared .card / .view-stub bits are global there, but
   scoped here since this PoC has no global stylesheet beyond tokens.css. */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px;
  box-shadow: var(--shadow-sm);
}
.card-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.cmd-client-select {
  padding: 5px 10px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card-2);
  color: var(--text);
  max-width: 180px;
  cursor: pointer;
}

.view-stub { max-width: 1200px; margin: 0 auto; padding: 56px 24px; }
.view-stub__card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 44px 40px;
  text-align: center;
}
.view-stub__card h2 {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 24px;
  color: var(--text);
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}
.view-stub__card p {
  color: var(--text-muted);
  font-size: 14px;
  max-width: 42ch;
  margin: 0 auto;
}

/* ── Analyze view (P3) ── */
.analyze { display: flex; flex-direction: column; gap: 16px; }
.analyze__bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.analyze__meta { font-size: 12px; color: var(--text-muted); }
.analyze-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.analyze-grid .card { display: flex; flex-direction: column; gap: 8px; }
.an-svg { width: 100%; height: 220px; display: block; }
/* legacy #an-depth-meter, #an-swara-gauge { height: 150px } → modifier class */
.an-svg--short { height: 150px; }
.an-disclaimer { font-size: 11px; color: var(--text-muted); font-style: italic; margin: 0; }
</style>
