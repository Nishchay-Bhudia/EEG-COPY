<script setup>
// Watch — the instructor (viewer) side of the Teacher/Student view.
// Assignment-scoped: the list shows the instructor's own clients whose linked
// login account is live right now (GET /api/live/watchable). Watching asks the
// BFF for a grant (POST /api/live/watch/:clientId — ownership + link + liveness
// checked server-side), then joins the hub group; every "analysis" event flows
// through mapAnalyzeResponse into the SAME <ReadingPanel/> the Monitor uses.
// The student sees a "being watched" indicator the moment we join.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import ReadingPanel from '@/components/ReadingPanel.vue';
import { api, getToken, apiBase, isDotnet } from '@/lib/api';
import { buildHub } from '@/lib/live';
import { mapAnalyzeResponse, createSmoother } from '@/lib/analysis';
import { useI18n } from '@/composables/useI18n';

const { t, localizeNumber } = useI18n();

const watchable = ref([]);           // [{ clientId, name, username, netSessionId, startedAt }]
const listError = ref('');
const status = ref('idle');          // 'idle' | 'connecting' | 'watching' | 'error'
const errorMsg = ref('');
const reading = ref(null);
const epochsSeen = ref(0);
const watchingName = ref('');

const smoother = createSmoother();
let hubConn = null;
let pollTimer = null;

const isWatching = computed(() => status.value === 'watching' || status.value === 'connecting');
const hasVitals = computed(() =>
  reading.value?.blood_oxygen != null || reading.value?.heart_rate != null);

async function loadWatchable() {
  try {
    watchable.value = await api('GET', '/live/watchable');
    listError.value = '';
  } catch (err) {
    listError.value = err.message || t('couldNotLoadLiveStudents');
  }
}

async function startWatching(client) {
  errorMsg.value = '';
  status.value = 'connecting';
  reading.value = null;
  epochsSeen.value = 0;
  watchingName.value = client.name;
  smoother.reset();
  try {
    // Assignment check + grant happen server-side.
    const grant = await api('POST', '/live/watch/' + client.clientId);
    // .NET: connect with our own login token, same-origin. Express: the BFF
    // returns the brokered token + backend URL.
    const backendUrl = isDotnet() ? apiBase() : grant.backend_url;
    const token = isDotnet() ? getToken() : grant.token;
    hubConn = buildHub(backendUrl, token);

    hubConn.on('analysis', (payload) => {
      const r = mapAnalyzeResponse(payload);
      r.epoch = ++epochsSeen.value;
      reading.value = smoother.apply(r);
      if (status.value !== 'watching') status.value = 'watching';
    });
    // The backend signals unauthorized/ended via an "error" event (never throws).
    hubConn.on('error', (e) => {
      status.value = 'error';
      errorMsg.value = (e && e.error) || t('sessionNoLongerAvailable');
    });
    hubConn.onclose(() => { if (status.value === 'watching') status.value = 'idle'; });

    await hubConn.start();
    await hubConn.invoke('WatchSession', grant.session_id, grant.watch_token);
    // Stay in 'connecting' until the first analysis arrives (or an error fires).
  } catch (err) {
    status.value = 'error';
    errorMsg.value = err.message || t('couldNotConnectLiveSession');
    await teardown();
  }
}

async function stopWatching() {
  await teardown();
  status.value = 'idle';
  reading.value = null;
  watchingName.value = '';
  loadWatchable();
}

async function teardown() {
  if (hubConn) {
    try { await hubConn.stop(); } catch { /* ignore */ }
    hubConn = null;
  }
}

function fmtSince(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? t('justNow') : `${localizeNumber(mins)}${t('minAgo')}`;
}

onMounted(() => {
  loadWatchable();
  pollTimer = setInterval(() => { if (!isWatching.value) loadWatchable(); }, 10000);
});

onBeforeUnmount(() => {
  clearInterval(pollTimer);
  teardown();
});
</script>

<template>
  <div class="watch">
    <div class="topbar"><div class="topbar__title">{{ t('watchTitle') }}</div></div>

    <!-- ─ Live students ─ -->
    <div class="card connect-card">
      <div class="connect-head">
        <span class="card-label">{{ t('watchStudentsLiveNow') }}</span>
        <button v-if="!isWatching" class="btn btn-ghost btn-sm" @click="loadWatchable">{{ t('refresh') }}</button>
      </div>
      <p class="connect-hint">{{ t('watchHint') }}</p>
      <div v-if="listError" class="connect-error">{{ listError }}</div>

      <div v-if="!isWatching">
        <div v-if="!watchable.length" class="live-empty">{{ t('noLiveStudents') }}</div>
        <div v-for="c in watchable" :key="c.clientId" class="live-row">
          <span class="live-dot">●</span>
          <div class="live-who">
            <span class="live-name">{{ c.name }}</span>
            <span class="live-sub">{{ c.username }} · {{ t('liveNowWord') }} {{ fmtSince(c.startedAt) }}</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="startWatching(c)">
            <span class="btn-icon">👁</span> {{ t('watchBtn') }}
          </button>
        </div>
      </div>

      <div v-else class="watching-row">
        <span class="status-dot" :class="status === 'watching' ? 'bluetooth' : status === 'connecting' ? 'waking' : 'error'"></span>
        <span class="status-text">
          <template v-if="status === 'connecting'">{{ t('connectingToPrefix') }}{{ watchingName }}…</template>
          <template v-else>{{ t('watchingPrefix') }}<strong>{{ watchingName }}</strong> · {{ localizeNumber(epochsSeen) }}{{ epochsSeen === 1 ? t('epochSingular') : t('epochPlural') }}</template>
        </span>
        <button class="btn btn-danger btn-sm" @click="stopWatching">
          <span class="btn-icon">⏹</span> {{ t('stopBtn') }}
        </button>
      </div>
      <div v-if="status === 'error'" class="connect-error">
        {{ errorMsg }}
        <button class="btn btn-ghost btn-sm" @click="stopWatching">{{ t('backBtn') }}</button>
      </div>
    </div>

    <!-- ─ Live reading ─ -->
    <div v-if="status === 'watching' || reading" class="dashboard-grid">
      <ReadingPanel :reading="reading" :has-p-p-g="hasVitals" />
    </div>
    <div v-else-if="status === 'connecting'" class="waiting">
      {{ t('waitingForFirstEpochPrefix') }}{{ watchingName }}{{ t('waitingForFirstEpochSuffix') }}
    </div>
  </div>
</template>

<style scoped>
.watch { max-width: 1200px; margin: 0 auto; padding: 24px; }
.topbar { margin-bottom: 16px; }
.topbar__title { font-family: var(--font-serif); font-size: 17px; color: var(--text); letter-spacing: -0.01em; }

.dashboard-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }

.connect-card { margin-bottom: 16px; }
.connect-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.connect-hint { font-size: 12.5px; color: var(--text-muted); line-height: 1.55; margin: 0 0 12px; }
.connect-error { font-size: 13px; color: #C75C5C; margin-top: 10px; display: flex; align-items: center; gap: 10px; }

.live-empty { font-size: 13px; color: var(--text-muted); padding: 10px 0; }
.live-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--bg-card-2); border: 1px solid var(--border-light); border-radius: var(--radius-sm); margin-bottom: 8px; }
.live-dot { color: #C75C5C; font-size: 11px; animation: pulse 1.4s ease-in-out infinite; }
.live-who { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.live-name { font-size: 13.5px; font-weight: 600; color: var(--text); }
.live-sub { font-size: 11.5px; color: var(--text-muted); }

.watching-row { display: flex; align-items: center; gap: 10px; }
.status-dot  { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); flex-shrink: 0; }
.status-dot.waking    { background: var(--beta); animation: pulse 1.4s ease-in-out infinite; }
.status-dot.bluetooth { background: var(--ekagra); box-shadow: 0 0 6px var(--ekagra); }
.status-dot.error     { background: var(--gamma); }
.status-text { font-size: 12.5px; color: var(--text-mid); flex: 1; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.waiting { padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; }

/* ─── Buttons (shared primitives) ─── */
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 13px; font-family: var(--font); font-weight: 500; transition: background 0.15s, opacity 0.15s; white-space: nowrap; }
.btn:disabled { opacity: 0.55; cursor: default; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #C4673E; }
.btn-danger  { background: #C75C5C; color: #fff; }
.btn-danger:hover { background: #a84040; }
.btn-ghost   { background: transparent; color: var(--text-mid); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--bg-card-2); }
.btn-sm      { padding: 5px 10px; font-size: 12px; }
.btn-icon    { font-size: 16px; }
</style>
