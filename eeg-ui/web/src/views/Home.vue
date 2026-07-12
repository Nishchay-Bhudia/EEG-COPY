<script setup>
// Home ("This Week") view — the instructor's landing dashboard. Loads
// /clients + /sessions/mine in parallel, then derives a greeting, KPIs, a
// needs-attention list, and a recent-sessions list. Clicking a session row
// navigates to /replay?session=:id; clicking a flagged client → /client.
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';

const router = useRouter();

// Status metadata (shared .client-status chip + .status--* colors from base.css).
const CLIENT_STATUS = {
  plateau: { label: 'Plateau', cls: 'status--plateau' },
  progress: { label: 'Progress', cls: 'status--progress' },
  issue: { label: 'Needs attention', cls: 'status--issue' },
  new: { label: 'New', cls: 'status--new' },
};

const clients = ref([]);
const sessions = ref([]);
const error = ref('');
const loading = ref(true);

// A client "needs attention" if flagged issue/plateau, or its last session is
// older than 14 days (legacy isAttention).
function isAttention(c) {
  if (c.status === 'issue' || c.status === 'plateau') return true;
  if (!c.lastSessionAt) return false;
  return Date.now() - new Date(c.lastSessionAt).getTime() > 14 * 864e5;
}

// Compact, human relative time — "just now" / "12m ago" / "3h ago" / "Mar 3".
function relTime(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Duration in seconds → "4h 20m" / "18m" / "45s" / "—".
function fmtDur(secs) {
  if (!secs || secs < 1) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.round(secs)}s`;
}

// ── Greeting + date header ──
const greeting = computed(() => {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = auth.user?.username;
  return name ? `${part}, ${name}` : part;
});
const todayLabel = new Date().toLocaleDateString(undefined, {
  weekday: 'long', month: 'long', day: 'numeric',
});

// ── Derived data ──
const flagged = computed(() => clients.value.filter(isAttention));

const kpis = computed(() => {
  const weekAgo = Date.now() - 7 * 864e5;
  const all = sessions.value;
  const week = all.filter((s) => new Date(s.startTime).getTime() >= weekAgo);
  const sumDur = (arr) => arr.reduce((a, s) => a + (s.duration || 0), 0);
  const withDur = all.filter((s) => s.duration > 0);
  const avgDur = withDur.length ? sumDur(withDur) / withDur.length : 0;
  const activeThisWeek = new Set(
    week.map((s) => s.clientId).filter((x) => x != null)
  ).size;
  const latest = all[0]; // sessions are pre-sorted newest-first

  const flaggedN = flagged.value.length;

  return [
    {
      key: 'clients', glyph: '○', label: 'Clients',
      value: clients.value.length,
      sub: `${activeThisWeek} active this week`,
      to: '/cohort',
    },
    {
      key: 'attention', glyph: '◎', label: 'Needs attention',
      value: flaggedN,
      sub: flaggedN ? 'follow up soon' : 'all on track',
      tone: flaggedN ? 'warn' : 'ok',
      to: { path: '/cohort', query: { filter: 'attention' } },
    },
    {
      key: 'week', glyph: '◇', label: 'Sessions this week',
      value: week.length,
      sub: `${all.length} all-time`,
      to: '/replay',
    },
    {
      key: 'practice', glyph: '☼', label: 'Practice this week',
      value: fmtDur(sumDur(week)),
      sub: `${fmtDur(sumDur(all))} all-time`,
      to: '/replay',
    },
    {
      key: 'avg', glyph: '≈', label: 'Avg session',
      value: fmtDur(avgDur),
      sub: `over ${withDur.length} sitting${withDur.length === 1 ? '' : 's'}`,
      to: '/replay',
    },
    {
      key: 'last', glyph: '↺', label: 'Last session',
      value: latest ? relTime(latest.startTime) : '—',
      sub: latest ? latest.name : 'no sessions yet',
      to: latest ? { path: '/replay', query: { session: latest.id } } : '/replay',
    },
  ];
});

const attentionRows = computed(() =>
  flagged.value.map((c) => {
    const st = CLIENT_STATUS[c.status];
    const flaggedStatus = (c.status === 'issue' || c.status === 'plateau') && st;
    return {
      id: c.id,
      name: c.name,
      chip: flaggedStatus ? st : { label: 'No recent session', cls: 'status--new' },
      since: c.lastSessionAt ? `last seen ${relTime(c.lastSessionAt)}` : 'no sessions yet',
    };
  })
);

const recentRows = computed(() => {
  const byId = Object.fromEntries(
    clients.value.map((c) => [String(c.id), c.name])
  );
  return sessions.value.slice(0, 8).map((s) => {
    const cn =
      s.clientId != null
        ? byId[String(s.clientId)] || 'Unknown client'
        : 'Unassigned';
    const meta = s.activity ? `${cn} · ${s.activity}` : cn;
    return { id: s.id, name: s.name, client: meta, when: relTime(s.startTime) };
  });
});

function openSession(id) {
  router.push({ path: '/replay', query: { session: id } });
}
function openClient(id) {
  router.push({ path: '/client', query: { id } });
}

onMounted(async () => {
  try {
    const [c, s] = await Promise.all([
      api('GET', '/clients'),
      api('GET', '/sessions/mine').catch(() => []),
    ]);
    s.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    clients.value = c;
    sessions.value = s;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="view-wrap">
    <header class="hero">
      <div class="hero__text">
        <h1 class="hero__greeting">{{ greeting }}</h1>
        <p class="hero__sub">{{ todayLabel }} · your week at a glance</p>
      </div>
      <div class="hero__actions">
        <router-link to="/monitor" class="btn btn-primary">Begin a sitting</router-link>
        <router-link to="/watch" class="btn btn-secondary">Watch live</router-link>
      </div>
    </header>

    <div v-if="error" class="empty-state">{{ error }}</div>

    <div class="hub-kpis">
      <template v-if="loading">
        <div v-for="n in 6" :key="n" class="kpi kpi--skeleton" />
      </template>
      <router-link
        v-for="k in kpis"
        v-else
        :key="k.key"
        :to="k.to"
        class="kpi"
        :class="{ 'kpi--warn': k.tone === 'warn' }"
      >
        <span class="kpi__glyph" aria-hidden="true">{{ k.glyph }}</span>
        <span class="kpi__value">{{ k.value }}</span>
        <span class="kpi__label">{{ k.label }}</span>
        <span v-if="k.sub" class="kpi__sub">{{ k.sub }}</span>
      </router-link>
    </div>

    <div class="hub-cols">
      <div class="card">
        <div class="card-label">NEEDS ATTENTION</div>
        <div class="hub-list">
          <template v-if="loading">
            <div v-for="n in 3" :key="n" class="skeleton-row" />
          </template>
          <div v-else-if="!attentionRows.length" class="empty-state">
            All clients on track.
          </div>
          <button
            v-for="row in attentionRows"
            v-else
            :key="row.id"
            class="hub-row"
            @click="openClient(row.id)"
          >
            <span class="hub-row__lead">
              <span class="hub-row__name">{{ row.name }}</span>
              <span class="hub-row__meta">{{ row.since }}</span>
            </span>
            <span class="hub-row__right">
              <span class="client-status" :class="row.chip.cls">{{ row.chip.label }}</span>
              <span class="hub-row__chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-label">RECENT SESSIONS</div>
        <div class="hub-list">
          <template v-if="loading">
            <div v-for="n in 4" :key="n" class="skeleton-row" />
          </template>
          <div v-else-if="!recentRows.length" class="empty-state">
            No sessions yet.
          </div>
          <button
            v-for="row in recentRows"
            v-else
            :key="row.id"
            class="hub-row"
            @click="openSession(row.id)"
          >
            <span class="hub-row__lead">
              <span class="hub-row__name">{{ row.name }}</span>
              <span class="hub-row__meta">{{ row.client }}</span>
            </span>
            <span class="hub-row__right">
              <span class="hub-row__when">{{ row.when }}</span>
              <span class="hub-row__chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-wrap { max-width: 1200px; margin: 0 auto; padding: 24px; }

/* ── Hero header ── */
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}
.hero__greeting {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 400;
  color: var(--text);
  letter-spacing: -0.01em;
  margin: 0;
}
.hero__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}
.hero__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.hero__actions .btn { text-decoration: none; }

/* Card container (shared legacy .card / .card-label). */
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

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  font-style: italic;
}

/* ── KPIs ── */
.hub-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.kpi {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
a.kpi:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
a.kpi:hover .kpi__glyph { color: var(--accent); }
.kpi__glyph {
  position: absolute;
  top: 12px;
  right: 14px;
  font-size: 18px;
  color: var(--accent-dim);
  line-height: 1;
  transition: color 0.15s;
}
.kpi__value {
  font-size: 30px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.kpi__sub {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kpi--warn { border-color: rgba(199, 92, 92, 0.4); }
.kpi--warn .kpi__value { color: var(--gamma); }
.kpi--warn .kpi__glyph { color: var(--gamma); opacity: 0.5; }
a.kpi--warn:hover { border-color: var(--gamma); }
a.kpi--warn:hover .kpi__glyph { color: var(--gamma); opacity: 0.8; }

.kpi--skeleton {
  height: 96px;
  border-color: var(--border-light);
  background: linear-gradient(90deg, var(--bg-card-2) 25%, var(--border-light) 50%, var(--bg-card-2) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.3s ease-in-out infinite;
}

/* ── Two-column lists ── */
.hub-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.hub-list { display: flex; flex-direction: column; gap: 2px; }
.hub-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
}
.hub-row:hover { background: var(--bg-card-2); }
.hub-row__lead { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hub-row__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hub-row__meta { font-size: 12px; color: var(--text-muted); }
.hub-row__right { display: flex; align-items: center; gap: 10px; flex: none; }
.hub-row__when {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.hub-row__chevron {
  font-size: 16px;
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(-2px);
  transition: opacity 0.15s, transform 0.15s;
}
.hub-row:hover .hub-row__chevron { opacity: 0.7; transform: translateX(0); }

/* ── Loading skeletons ── */
.skeleton-row {
  height: 42px;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--bg-card-2) 25%, var(--border-light) 50%, var(--bg-card-2) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.3s ease-in-out infinite;
}
@keyframes skeleton {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (max-width: 760px) {
  .hub-cols { grid-template-columns: 1fr; }
  .hero { align-items: flex-start; }
}
</style>
