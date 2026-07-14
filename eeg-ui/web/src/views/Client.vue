<script setup>
// Client profile view. Ports the legacy `client` <section> + onShowClient /
// renderClient* functions from app.js. The client id comes from the route
// query (?id=), and both the client record and its sessions are fetched in
// parallel. Timeline dots and session rows navigate to the replay view.
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/lib/api';
import { CLIENT_STATUS, monthsSince, formatDate, formatDuration } from '@/lib/clients';
import { useI18n } from '@/composables/useI18n';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const { t, tf, localizeNumber } = useI18n();
const { showToast } = useToast();

const clientId = computed(() => route.query.id || null);

const client = ref(null);
const sessions = ref([]);
const error = ref('');
const loading = ref(false);

// ── Load client + sessions (Promise.all, sessions best-effort) ──
async function load() {
  error.value = '';
  client.value = null;
  sessions.value = [];
  if (!clientId.value) return;
  loading.value = true;
  try {
    const [c, s] = await Promise.all([
      api('GET', '/clients/' + clientId.value),
      api('GET', '/clients/' + clientId.value + '/sessions').catch(() => []),
    ]);
    client.value = c;
    sessions.value = Array.isArray(s) ? s : [];
  } catch (e) {
    error.value = t('couldNotLoadClient') + e.message;
  } finally {
    loading.value = false;
  }
}

watch(clientId, load, { immediate: true });

// ── Derived display state (mirrors the renderClient* helpers) ──
const status = computed(() => (client.value ? CLIENT_STATUS[client.value.status] : null));

const metaBits = computed(() => {
  const c = client.value;
  if (!c) return [];
  const bits = [];
  if (c.age != null) bits.push(localizeNumber(c.age) + t('yrsSuffix'));
  if (c.practicingSince) bits.push(monthsSince(c.practicingSince));
  if (status.value) bits.push(t(status.value.labelKey));
  return bits;
});

const stats = computed(() => {
  const c = client.value;
  if (!c) return [];
  return [
    { label: t('statSessions'), value: localizeNumber(c.sessionsCount ?? 0) },
    { label: t('statLastSession'), value: c.lastSessionAt ? formatDate(c.lastSessionAt) : '—' },
    { label: t('statProtocolSince'), value: c.protocolSince ? formatDate(c.protocolSince) : '—' },
  ];
});

// Timeline dots: newest first, sized 14–36px by relative duration.
const dots = computed(() => {
  const list = sessions.value;
  if (!list.length) return [];
  const maxDur = Math.max(...list.map(s => s.duration || 0), 1);
  return list.slice().reverse().map(s => {
    const d = s.duration || 0;
    const size = 14 + Math.round((d / maxDur) * 22);
    return {
      id: s.id,
      size,
      title: `${s.name} · ${d ? formatDuration(d) : t('inProgressLabel')}`,
    };
  });
});

function openReplay(sessionId) {
  router.push({ path: '/replay', query: { session: sessionId } });
}

// ── Actions ──
function backToCohort() {
  router.push('/cohort');
}

// Create the student's login in ONE step: account + link. From then on everything
// they record or stream lands under this client, and you can watch them live.
async function createLogin() {
  if (!clientId.value) return;
  const suggested = (client.value?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const username = prompt(t('promptUsernameForStudent'), suggested);
  if (username === null || !username.trim()) return;
  const password = prompt(t('promptPasswordForStudent'));
  if (password === null || !password) return;
  try {
    await api('POST', '/clients/' + clientId.value + '/create-login',
      { username: username.trim(), password });
    await load();
    alert(t('createLoginDonePrefix') + (client.value?.name || t('theStudentFallback')) + t('createLoginDoneMid') + username.trim() + t('createLoginDoneSuffix'));
  } catch (e) {
    error.value = e.message;
  }
}

// Link this client to a login account (remote student). The link is the standing
// grant that lets this client's owner watch that account's live sittings.
async function linkAccount() {
  if (!clientId.value) return;
  const current = client.value?.linkedUsername || '';
  const uname = prompt(t('promptLinkAccount'), current);
  if (uname === null || uname.trim() === current) return;
  try {
    await api('PUT', '/clients/' + clientId.value, { linkedUsername: uname.trim() });
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function editClient() {
  if (!clientId.value) return;
  const protocol = prompt(t('promptProtocol'));
  if (protocol === null) return;
  const notes = prompt(t('promptTeacherNotes'));
  if (notes === null) return;
  const body = {};
  if (protocol !== '') body.protocol = protocol;
  if (notes !== '') body.notes = notes;
  if (!Object.keys(body).length) return;
  try {
    await api('PUT', '/clients/' + clientId.value, body);
    showToast(t('toastSaved'));
    await load();
  } catch (e) {
    showToast(e.message);
    error.value = e.message;
  }
}
</script>

<template>
  <section class="view-client">
    <!-- Empty / error states -->
    <div v-if="!clientId" class="empty-state">{{ t('clientEmptyState') }}</div>
    <div v-else-if="error" class="empty-state">{{ error }}</div>
    <div v-else-if="loading" class="empty-state">{{ t('loading') }}</div>

    <!-- Profile body -->
    <div v-else-if="client">
      <div class="profile-header">
        <div>
          <h2 class="profile-name">{{ client.name }}</h2>
          <div class="profile-meta">{{ metaBits.join(' · ') }}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-ghost btn-sm" @click="editClient">{{ t('edit') }}</button>
          <template v-if="client?.linkedUsername">
            <button class="btn btn-ghost btn-sm" :title="t('signsInAsPrefix') + client.linkedUsername + t('signsInAsSuffix')" @click="linkAccount">
              🔗 {{ client.linkedUsername }}
            </button>
          </template>
          <template v-else>
            <button class="btn btn-ghost btn-sm" :title="t('createLoginTitle')" @click="createLogin">
              {{ t('createLoginBtn') }}
            </button>
            <button class="btn btn-ghost btn-sm" :title="t('linkAccountTitle')" @click="linkAccount">
              {{ t('linkAccountBtn') }}
            </button>
          </template>
          <button class="btn btn-ghost btn-sm" @click="backToCohort">{{ t('backToCohort') }}</button>
        </div>
      </div>

      <div class="stat-row">
        <div v-for="s in stats" :key="s.label" class="stat">
          <span class="stat__label">{{ s.label }}</span>
          <span class="stat__value">{{ s.value }}</span>
        </div>
      </div>

      <div class="profile-grid">
        <div class="client-col-main">
          <div class="card">
            <div class="card-label">{{ t('sessionTimelineTitle') }}</div>
            <div class="session-timeline__chart">
              <div v-if="!dots.length" class="empty-state">{{ t('noSessionsRecordedClient') }}</div>
              <button
                v-for="d in dots"
                :key="d.id"
                class="timeline-dot"
                :title="d.title"
                :style="{ width: d.size + 'px', height: d.size + 'px' }"
                @click="openReplay(d.id)"
              ></button>
            </div>
            <div class="hint">{{ t('sessionTimelineHint') }}</div>
          </div>

          <div class="card">
            <div class="card-label">{{ t('recentSessions') }}</div>
            <div class="hub-list">
              <div v-if="!sessions.length" class="empty-state">{{ t('homeNoSessionsYet') }}</div>
              <button
                v-for="s in sessions"
                :key="s.id"
                class="hub-row"
                @click="openReplay(s.id)"
              >
                <span class="hub-row__name">{{ s.name }}</span>
                <span class="hub-row__meta">
                  {{ formatDate(s.startTime) }} · {{ s.duration ? formatDuration(s.duration) : '—' }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div class="client-col-side">
          <div class="card">
            <div class="card-label">{{ t('protocolTitle') }}</div>
            <div v-if="!client.protocol && !client.goal" class="empty-state">{{ t('noProtocolSet') }}</div>
            <template v-else>
              <div v-if="client.protocol" class="reco__protocol">{{ client.protocol }}</div>
              <div v-if="client.goal" class="reco__goal">{{ t('goalPrefix') }}{{ client.goal }}</div>
            </template>
          </div>

          <div class="card">
            <div class="card-label">{{ t('teacherNotesTitle') }}</div>
            <div v-if="client.notes && client.notes.trim()" class="client-notes">{{ client.notes }}</div>
            <div v-else class="empty-state">{{ t('noNotesYet') }}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Ported from legacy style.css. Design tokens (--accent, --text, --border, …)
   come from @/styles/tokens.css. */
.empty-state { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }
.hint { font-size: 12px; color: var(--text-muted); margin-top: 12px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 13px; font-family: var(--font); font-weight: 500; transition: background 0.15s, opacity 0.15s; white-space: nowrap; }
.btn-ghost { background: transparent; color: var(--text-mid); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--bg-card-2); }
.btn-sm { padding: 5px 10px; font-size: 12px; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

.profile-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.profile-name { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.01em; }
.profile-meta { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.profile-actions { display: flex; gap: 8px; flex-shrink: 0; }

.stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 18px; }
.stat { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.stat__label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.stat__value { font-size: 16px; font-weight: 700; color: var(--text); }

.profile-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start; }
.client-col-main, .client-col-side { display: flex; flex-direction: column; gap: 16px; }

.session-timeline__chart { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 44px; }
.timeline-dot { border-radius: 50%; background: var(--accent); opacity: 0.55; border: none; cursor: pointer; transition: opacity 0.15s, transform 0.15s; }
.timeline-dot:hover { opacity: 1; transform: scale(1.15); }

.hub-list { display: flex; flex-direction: column; gap: 2px; }
.hub-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; padding: 10px 12px; background: none; border: none; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.15s; }
.hub-row:hover { background: var(--bg-card-2); }
.hub-row__name { font-size: 13px; font-weight: 600; color: var(--text); }
.hub-row__meta { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

.reco__protocol { font-size: 14px; font-weight: 600; color: var(--text); }
.reco__goal { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

/* Teacher notes: preserve line breaks without v-html (Vue escapes the text) */
.client-notes { font-size: 13px; color: var(--text); white-space: pre-wrap; }

@media (max-width: 760px) { .profile-grid { grid-template-columns: 1fr; } }
</style>
