<script setup>
// Cohort grid. Ports the legacy onShowCohort() + renderClientTile() from app.js.
// Fetches /clients and renders a grid of client tiles that link to the client
// profile. Add-client button prompts for a name, POSTs it, then refetches.
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { useI18n } from '@/composables/useI18n';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const { t, tf, localizeNumber } = useI18n();
const { showToast } = useToast();

// Status metadata → badge label key + CSS class (legacy CLIENT_STATUS map).
const CLIENT_STATUS = {
  plateau:  { labelKey: 'clientStatusPlateau', cls: 'status--plateau' },
  progress: { labelKey: 'clientStatusProgress', cls: 'status--progress' },
  issue:    { labelKey: 'clientStatusIssue', cls: 'status--issue' },
  new:      { labelKey: 'clientStatusNew', cls: 'status--new' },
};

const clients = ref([]);
const trends = ref({});   // { [clientId]: number[] }  recent per-session depth scores
const error = ref('');

// ── Contemplative-depth trajectory (from /clients/summary) ──
// Depth scores share the app's DEPTH_PCT scale (0–100). We render a tiny
// sparkline per tile plus a one-line read: direction + the bhūmi the latest
// average lands in.
const SPARK_W = 92;
const SPARK_H = 26;

function scoreToBhumi(s) {
  return s < 8 ? 'Mūḍha' : s < 24 ? 'Kṣipta' : s < 49 ? 'Vikṣipta' : s < 78 ? 'Ekāgra' : 'Niruddha';
}

// Build sparkline geometry + direction for a client's score series.
function spark(clientId) {
  const scores = trends.value[clientId];
  if (!scores || !scores.length) return null;
  const n = scores.length;
  const pts = scores.map((s, i) => {
    const x = n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W;
    const y = SPARK_H - (Math.max(0, Math.min(100, s)) / 100) * (SPARK_H - 3) - 1.5;
    return [+x.toFixed(1), +y.toFixed(1)];
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  const delta = scores[n - 1] - scores[0];
  const dir = n < 2 ? 'steady' : delta > 6 ? 'up' : delta < -6 ? 'down' : 'steady';
  const read =
    n < 2
      ? `${scoreToBhumi(scores[n - 1])}`
      : `${dir === 'up' ? 'deepening' : dir === 'down' ? 'lightening' : 'steady'} · ${scoreToBhumi(scores[n - 1])}`;
  return { d, pts, dir, read, last: pts[pts.length - 1] };
}

// ── "Needs attention" filter (driven by ?filter=attention, e.g. the Home tile) ──
// Same rule as Home.isAttention: flagged issue/plateau, or no session in 14 days.
function isAttention(c) {
  if (c.status === 'issue' || c.status === 'plateau') return true;
  if (!c.lastSessionAt) return false;
  return Date.now() - new Date(c.lastSessionAt).getTime() > 14 * 864e5;
}

const flaggedOnly = computed(() => route.query.filter === 'attention');
const visibleClients = computed(() =>
  flaggedOnly.value ? clients.value.filter(isAttention) : clients.value
);

function clearFilter() {
  router.push({ path: '/cohort' });
}

const title = computed(() => {
  const n = visibleClients.value.length;
  const s = n === 1 ? '' : 's';
  return flaggedOnly.value
    ? tf('cohortTitleNeedsAttention', { n: localizeNumber(n), s })
    : tf('cohortTitleWithCount', { n: localizeNumber(n), s });
});

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

function statusFor(c) {
  const s = CLIENT_STATUS[c.status];
  return s ? { label: t(s.labelKey), cls: s.cls } : null;
}

function metaFor(c) {
  const n = c.sessionsCount ?? 0;
  const last = c.lastSessionAt ? formatDate(c.lastSessionAt) : t('noSessionsYetLower');
  return `${tf('sessionCountTemplate', { n: localizeNumber(n), s: n === 1 ? '' : 's' })} · ${last}`;
}

async function load() {
  error.value = '';
  try {
    const [c, t] = await Promise.all([
      api('GET', '/clients'),
      api('GET', '/clients/summary').catch(() => ({})),
    ]);
    clients.value = c;
    trends.value = t || {};
  } catch (e) {
    error.value = e.message;
  }
}

async function addClient() {
  const name = prompt(t('newClientNamePrompt'));
  if (!name || !name.trim()) return;
  try {
    await api('POST', '/clients', { name: name.trim() });
    showToast(t('clientAddedToast'));
    await load();
  } catch (e) {
    showToast(e.message);
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <section class="view">
    <div class="hub-head">
      <h2>{{ title }}</h2>
      <button class="btn btn-primary btn-sm" @click="addClient">{{ t('addClient') }}</button>
    </div>
    <div class="hint">{{ t('cohortHint') }}</div>

    <div v-if="flaggedOnly" class="filter-bar">
      <span class="filter-pill">
        {{ t('needsAttention') }}
        <button class="filter-pill__x" :title="t('clearFilterTitle')" @click="clearFilter">✕</button>
      </span>
      <button class="filter-clear" @click="clearFilter">{{ t('showAllClients') }}</button>
    </div>

    <div v-if="error" class="empty-state">{{ error }}</div>
    <div v-else-if="!clients.length" class="empty-state">{{ t('noClientsYetHint') }}</div>
    <div v-else-if="!visibleClients.length" class="empty-state">{{ t('noClientsNeedAttention') }}</div>
    <div v-else class="cohort-grid">
      <router-link
        v-for="c in visibleClients"
        :key="c.id"
        class="client-tile"
        :to="'/client?id=' + c.id"
      >
        <div class="client-tile__top">
          <span class="client-tile__name">{{ c.name }}</span>
          <span
            v-if="statusFor(c)"
            class="client-status"
            :class="statusFor(c).cls"
          >{{ statusFor(c).label }}</span>
        </div>
        <div class="client-tile__meta">{{ metaFor(c) }}</div>

        <div v-if="spark(c.id)" class="trend" :class="'trend--' + spark(c.id).dir">
          <svg class="trend__spark" :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`" preserveAspectRatio="none" aria-hidden="true">
            <path :d="spark(c.id).d" fill="none" stroke="currentColor" stroke-width="1.6"
                  stroke-linejoin="round" stroke-linecap="round" />
            <circle :cx="spark(c.id).last[0]" :cy="spark(c.id).last[1]" r="2" fill="currentColor" />
          </svg>
          <span class="trend__read">{{ spark(c.id).read }}</span>
        </div>
        <div v-else class="trend trend--empty">{{ t('noDepthDataYet') }}</div>

        <div v-if="c.protocol" class="client-tile__protocol">{{ c.protocol }}</div>
      </router-link>
    </div>
  </section>
</template>

<style scoped>
/* Ported verbatim from legacy style.css (HOME / COHORT / CLIENT VIEWS, P2). */
.hub-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.hub-head h2 { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.01em; }
.hint { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; }

.filter-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.filter-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 4px 6px 4px 11px; border-radius: 20px;
  background: rgba(199,92,92,0.16); color: var(--gamma);
}
.filter-pill__x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border: none; border-radius: 50%;
  background: rgba(199,92,92,0.22); color: var(--gamma);
  font-size: 10px; cursor: pointer; line-height: 1;
}
.filter-pill__x:hover { background: rgba(199,92,92,0.35); }
.filter-clear {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--text-muted); text-decoration: underline;
}
.filter-clear:hover { color: var(--text-mid); }
.empty-state { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }

.cohort-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.client-tile { text-align: left; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; cursor: pointer; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.15s, box-shadow 0.15s; text-decoration: none; }
.client-tile:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
.client-tile__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.client-tile__name { font-size: 15px; font-weight: 700; color: var(--text); }
.client-tile__meta { font-size: 12px; color: var(--text-muted); }
.client-tile__protocol { font-size: 12px; color: var(--text-mid); border-top: 1px solid var(--border-light); padding-top: 8px; }

/* Depth-trajectory sparkline */
.trend { display: flex; align-items: center; gap: 9px; }
.trend__spark { width: 92px; height: 26px; flex: none; }
.trend__read { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
.trend--up    { color: var(--ekagra); }
.trend--down  { color: var(--beta); }
.trend--steady { color: var(--text-muted); }
.trend--empty { font-size: 11.5px; font-style: italic; color: var(--text-muted); }
.client-status { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 2px 7px; border-radius: 20px; white-space: nowrap; }
.status--plateau  { background: rgba(212,151,58,0.16);  color: var(--beta); }
.status--progress { background: rgba(86,166,122,0.16);  color: var(--alpha); }
.status--issue    { background: rgba(199,92,92,0.16);   color: var(--gamma); }
.status--new      { background: rgba(90,109,170,0.16);  color: var(--tamas); }
</style>
