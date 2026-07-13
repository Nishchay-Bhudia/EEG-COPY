/* ════════════════════════════════════════════════════════════════════════════
 EEG DEV TESTING — app.js
 Modes: demo | bluetooth+backend | bluetooth-local | backend-url
 Auth: Login → Session management → Admin dashboard (dedicated page)
 New: Trigunas display, Session epoch storage, Admin session analytics
════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Language selector (i18n.js defines I18N/t/getLang/setLang/applyI18n) ──────
applyI18n();
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});
// Re-render whatever's currently on screen with the new language — state
// names, notes, and numbers are re-applied from the same underlying reading,
// not re-fetched, so switching is instant and never loses live data.
function onLanguageChanged() {
  // Topbar title is set once per nav click (showView), not part of applyReading.
  if (typeof VIEWS !== 'undefined' && typeof currentView !== 'undefined' && currentView && VIEWS[currentView]) {
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = t(VIEWS[currentView].titleKey);
  }
  if (typeof lastAppliedReading !== 'undefined' && lastAppliedReading) {
    applyReading(lastAppliedReading);
  }
  // pingBackendStatus writes "ready"/"loading model..." once at login, outside
  // applyReading — re-run it so that text also follows a language switch
  // (caught by actually rendering the page and screenshotting it, not just
  // reading the code: the MODE field kept showing English "ready" after
  // switching to Gujarati because nothing re-rendered it).
  if (typeof backendUrl !== 'undefined' && backendUrl && typeof pingBackendStatus === 'function') {
    pingBackendStatus(backendUrl);
  }
  // User-menu role label is set once in enterApp(), outside any per-view render.
  if (typeof currentUser !== 'undefined' && currentUser && typeof translateRole === 'function') {
    const roleEl = document.getElementById('user-menu-role');
    if (roleEl) roleEl.textContent = translateRole(currentUser.role);
  }
  // Command-bar client picker and the sidebar session history are also
  // populated once in enterApp(), outside any per-view render — refresh both
  // (cheap idempotent GETs, no interactive state to lose) so they don't go
  // stale after the first language switch.
  if (typeof currentUser !== 'undefined' && currentUser) {
    if (typeof loadClientOptions === 'function') loadClientOptions();
    if (typeof loadSessionHistory === 'function') loadSessionHistory();
  }
  // Demo toggle button's label is set imperatively on click (mode === 'demo'),
  // not re-derived from state on every render — resync it here too.
  if (typeof mode !== 'undefined') {
    const demoBtn = document.getElementById('btn-demo');
    if (demoBtn) demoBtn.textContent = mode === 'demo' ? t('stopDemoLabel') : t('demoLabel');
  }
  // Views other than the dashboard bake translated text straight into
  // innerHTML at render time, so switching language only takes effect there
  // once they're re-rendered. Re-run whichever view is currently on screen —
  // cheap idempotent GETs for the list-style views, and a same-data redraw
  // (no re-fetch, no lost scrub position) for Replay/Analyze.
  switch (typeof currentView !== 'undefined' ? currentView : null) {
    case 'home':    if (typeof onShowHome === 'function') onShowHome(); break;
    case 'cohort':  if (typeof onShowCohort === 'function') onShowCohort(); break;
    case 'client':  if (typeof onShowClient === 'function') onShowClient(); break;
    case 'admin':   if (typeof openAdminTab === 'function') openAdminTab(adminCurrentTab); break;
    case 'replay':
      if (typeof replayEpochs !== 'undefined' && replayEpochs.length && typeof updateReplayDisplay === 'function') {
        // Render order matters: updateReplayDisplay() ends with the localizeDom
        // sweep for the whole .replay-view, so anything digit-bearing must be
        // (re)written before it runs, or its numerals are left un-swept.
        if (typeof renderReplayMetrics === 'function') renderReplayMetrics(lastReplaySummary || {});
        if (typeof renderReplayViewMeta === 'function') renderReplayViewMeta(lastReplaySummary);
        if (typeof renderReplayScrubber === 'function') renderReplayScrubber(lastReplayPhases, lastReplaySummary?.durationSeconds || 0);
        updateReplayDisplay(replayIndex);
      } else if (typeof onShowReplay === 'function') {
        // No session loaded — nothing to lose, safe to re-run in full so the
        // "No sessions" empty state (and picker options) pick up the new language.
        onShowReplay();
      }
      if (typeof replayPlaying !== 'undefined') {
        const ppBtn = document.getElementById('replay-play-pause');
        if (ppBtn) ppBtn.textContent = replayPlaying ? t('pauseLabel') : t('playLabel');
      }
      break;
    case 'analyze':
      if (typeof analyzeSessionId !== 'undefined' && analyzeSessionId && typeof loadAnalyzeSession === 'function') {
        loadAnalyzeSession(analyzeSessionId);
      }
      break;
  }
  // AI Baba is a modal, not a nav view — re-fetch its session picker if that's
  // the step showing (safe: no selection made yet, nothing to lose). Leave an
  // in-progress chat alone rather than wiping the conversation.
  const aiOverlay = document.getElementById('ai-baba-overlay');
  const aiPickStep = document.getElementById('ai-baba-step-pick');
  if (aiOverlay && aiOverlay.style.display !== 'none' && aiPickStep && aiPickStep.style.display !== 'none'
      && typeof openAiBaba === 'function') {
    openAiBaba();
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE = 256;
// Analysis window per epoch. Longer = each state reading holds longer on screen
// and is a steadier estimate (less flip-flop between adjacent states).
const COLLECT_SECS = 4;
const COLLECT_N = SAMPLE_RATE * COLLECT_SECS;
const WAVE_LEN = 300;
const DEMO_INTERVAL = 1200;

const MUSE_SERVICE_UUID = '0000fe8d-0000-1000-8000-00805f9b34fb';
const MUSE_CONTROL_UUID = '273e0001-4c4d-454d-96be-f03bac821358';
const MUSE_EEG_UUIDS = [
  '273e0003-4c4d-454d-96be-f03bac821358',
  '273e0004-4c4d-454d-96be-f03bac821358',
  '273e0005-4c4d-454d-96be-f03bac821358',
  '273e0006-4c4d-454d-96be-f03bac821358',
];

// Muse S PPG UUIDs for heart rate and SpO2
const MUSE_PPG_UUIDS = {
  ambient: '273e000f-4c4d-454d-96be-f03bac821358',
  ir:      '273e0010-4c4d-454d-96be-f03bac821358',
  red:     '273e0011-4c4d-454d-96be-f03bac821358',
};
const PPG_SAMPLE_RATE = 64;
const PPG_WINDOW_SAMPLES = PPG_SAMPLE_RATE * 8; // 8-second window

// BrainBit (4-channel dry EEG, 250 Hz). Protocol per the vendor's web SDK.
const BRAINBIT_SERVICE_UUID = '6e400001-b534-f393-68a9-e50e24dcca9e';
const BRAINBIT_STATUS_UUID  = '6e400002-b534-f393-68a9-e50e24dcca9e'; // notify status/battery
const BRAINBIT_COMMAND_UUID = '6e400003-b534-f393-68a9-e50e24dcca9e'; // write commands
const BRAINBIT_SIGNAL_UUID  = '6e400004-b534-f393-68a9-e50e24dcca9e'; // notify EEG
// SIGNAL-mode scale → volts: 2.4 V reference / (0xFFFFF full-scale × gain 6).
const BRAINBIT_SIGNAL_MULT = 2.4 / (0xFFFFF * 6);
const BRAINBIT_CMD_STOP   = new Uint8Array([1]);          // stop everything
const BRAINBIT_CMD_SIGNAL = new Uint8Array([2, 0, 0, 0, 0]); // start signal mode

const DEPTH_PCT = { 'Deep Inertia': 3, Surface: 12, Emerging: 37, Deep: 62, Profound: 94 };
const CHITTA_DEPTHS = { Mudha: 'Deep Inertia', Kshipta: 'Surface', Vikshipta: 'Emerging', Ekagra: 'Deep', Niruddha: 'Profound' };
// Getter-based so SWARA_NOTES.ida etc always reflects the current language —
// none of the Swara classification logic that reads these (classifyLocal) is
// touched, only what the resulting note text resolves to.
const SWARA_NOTES = {
  get ida() { return t('swaraNoteIda'); },
  get pingala() { return t('swaraNotePingala'); },
  get sushumna() { return t('swaraNoteSushumna'); },
};

// ── App state ─────────────────────────────────────────────────────────────────
let mode = 'idle';
// Default to the local .NET analyser for local dev. A stale/unreachable remote
// default here silently degrades every reading to the local FFT fallback (no
// gunas, no inner-texture, weaker tattva flags) with only a console warning —
// see eeg-backend/docs/IMPLEMENTATION_PLAN.md guardrails. Override via the
// backend-URL field in Settings for a remote deployment.
let backendUrl = localStorage.getItem('controlhub_url') || 'http://localhost:5094';
let btDevice = null;
let btDisconnect = null;
let activeDriver = null;              // the headband driver in use this connection
let activeSampleRate = SAMPLE_RATE;   // per-device Hz (Muse 256, BrainBit 250, …)
let demoTimer = null;
let epoch = 0;
let demoStateIdx = 0;
let demoSwaraIdx = 0;
let demoEpoch = 0;
let pollTimer = null;
let sseSource = null;
let backendPollTimer = null;

// Auth state
let currentUser = null; // { id, username, role }

// Session state
let activeSession = null; // { id, name, startTime }
let sessionTimerInterval = null;
let notesSaveTimeout = null;
let sessionEpochCounter = 0;
let sessionStartTimestamp = null;

// Admin page state
let adminCurrentTab = 'users';
let resetPwTargetUserId = null;

const bleChannels = [[], [], [], []];
let blePhase = 0;
let bleSamTick = 0;

// PPG state (Muse S heart rate / SpO2)
    const ppgBuf = { ambient: [], ir: [], red: [] };
    let latestHeartRate = null;
    let latestSpO2 = null;

    const waveBuf = new Float32Array(WAVE_LEN);
let waveTail = 0;
let wavePhase = 0;

// Band power state — updated each epoch; used by drawWave for live bar display
let lastBandPowers = { delta: 0.15, theta: 0.18, alpha: 0.28, low_beta: 0.18, high_beta: 0.13, gamma: 0.08 };

// Replay Player state
let replayEpochs = [];
let replayIndex = 0;
let replayTimer = null;
let replayPlaying = false;
let replaySpeed = 1;                 // playback multiplier (0.5×–4×)
let replaySessionId = null;          // session shown in the Replay view
let pendingReplaySessionId = null;   // deep-link target from the analytics overlay
let currentAnalyticsSessionId = null;
let lastReplaySummary = null;        // last /analytics summary, for re-translating the metrics strip in place
let lastReplayPhases = [];           // last /analytics phases, for re-translating the scrubber tooltips in place

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utility helpers ───────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function qAll(selector) { return Array.from(document.querySelectorAll(selector)); }

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

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

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || t('requestFailed')), { status: res.status });
  return data;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    currentUser = await api('GET', '/auth/me');
    enterApp();
  } catch {
    showLoginScreen();
  }
}

// ── View router ────────────────────────────────────────────────────────────────
// Single source of navigation truth. Each view maps to a [data-view] section and a
// [data-nav] sidebar button; onShow runs each time the view is entered. Later phases
// register their render fns as onShow hooks against the stub views.
const VIEWS = {
  dashboard: { titleKey: 'navLiveMonitor',      onShow: onShowDashboard },
  home:      { titleKey: 'navThisWeek',         onShow: onShowHome },
  cohort:    { titleKey: 'navCohort',           onShow: onShowCohort },
  client:    { titleKey: 'navClients',          onShow: onShowClient },
  replay:    { titleKey: 'navReplay',           onShow: onShowReplay },
  analyze:   { titleKey: 'navAnalyze',          onShow: onShowAnalyze },
  prescribe: { titleKey: 'navPrescribe' },
  admin:     { titleKey: 'adminDashboardTitle', elevatedOnly: true, onShow: onShowAdmin },
};

let currentView = null;

function isElevatedRole() {
  return !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'co-admin');
}

function showView(name) {
  let view = VIEWS[name];
  if (!view) { name = 'dashboard'; view = VIEWS.dashboard; }
  // Guard elevated-only views (defence in depth — nav item is also hidden)
  if (view.elevatedOnly && !isElevatedRole()) { name = 'dashboard'; view = VIEWS.dashboard; }

  // Leaving the replay view: stop the playback timer to avoid a leak.
  if (currentView === 'replay' && name !== 'replay' && typeof stopReplay === 'function') stopReplay();

  qAll('[data-view]').forEach(el => el.classList.toggle('is-active', el.dataset.view === name));
  qAll('[data-nav]').forEach(el => el.classList.toggle('is-active', el.dataset.nav === name));
  const titleEl = $('topbar-title');
  if (titleEl) titleEl.textContent = t(view.titleKey);
  currentView = name;
  if (view.onShow) view.onShow();
}

function onShowDashboard() {
  // canvas must be re-measured whenever the dashboard becomes visible again
  resizeCanvas();
}

function onShowAdmin() {
  const isCoAdmin = currentUser.role === 'co-admin';
  const usersTabBtn = document.querySelector('.admin-tab[data-tab="users"]');
  if (usersTabBtn) usersTabBtn.style.display = isCoAdmin ? 'none' : '';
  const targetTab = isCoAdmin ? 'sessions' : adminCurrentTab;
  openAdminTab(targetTab);
}

// ── Auth screen gating ──────────────────────────────────────────────────────────
let waveLoopStarted = false;

function showLoginScreen() {
  $('login-screen').style.display = 'flex';
  $('app-shell').style.display = 'none';
}

// One-time setup when entering the app after a successful auth.
function enterApp() {
  $('login-screen').style.display = 'none';
  $('app-shell').style.display = 'flex';

  $('user-avatar-initial').textContent = (currentUser.username[0] || '?').toUpperCase();
  $('user-display-name').textContent = currentUser.username;
  $('user-menu-role').textContent = translateRole(currentUser.role);

  const elevated = isElevatedRole();
  $('btn-open-admin').style.display = elevated ? '' : 'none';
  const adminNav = document.querySelector('.nav__item[data-nav="admin"]');
  if (adminNav) adminNav.style.display = elevated ? '' : 'none';
  $('btn-ai-baba').style.display = '';

  resizeCanvas();
  if (!waveLoopStarted) { waveLoopStarted = true; requestAnimationFrame(drawWave); }
  $('val-buffer').textContent = '0 / ' + COLLECT_N;

  if (backendUrl) {
    $('input-backend-url').value = backendUrl;
    // Ping once to show backend status, but don't force 'backend' mode — conflicts with BT
    pingBackendStatus(backendUrl);
  }

  loadSessionHistory();
  loadClientOptions();
  showView('dashboard');
}

// Populate the command-bar client picker from the cohort (P1 endpoint).
async function loadClientOptions() {
  const sel = $('session-client-select');
  if (!sel) return;
  try {
    const clients = await api('GET', '/clients');
    const current = sel.value;
    sel.innerHTML = `<option value="">${escHtml(t('noClient'))}</option>` +
      clients.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    sel.value = current; // preserve selection across refreshes
  } catch (_) { /* leave the default "No client" option */ }
}

// Back-compat shims — existing call sites keep working (admin button, back-to-dashboard).
function showMainApp()  { showView('dashboard'); }
function showAdminPage() { showView('admin'); }

// Sidebar navigation
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) showView(nav.dataset.nav);
});

// Toast — reusable notification primitive used by later phases.
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2600);
}

// ── Login form ────────────────────────────────────────────────────────────────
$('btn-login').addEventListener('click', async () => {
  const username = $('input-username').value.trim();
  const password = $('input-password').value;
  const errEl = $('login-error');
  errEl.style.display = 'none';
  $('btn-login').disabled = true;
  $('btn-login').textContent = t('signingIn');

  try {
    currentUser = await api('POST', '/auth/login', { username, password });
    enterApp();
  } catch (err) {
    errEl.textContent = err.message || t('loginFailed');
    errEl.style.display = '';
  } finally {
    $('btn-login').disabled = false;
    $('btn-login').textContent = t('signIn');
  }
});

$('input-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-login').click();
});

// ── User menu ─────────────────────────────────────────────────────────────────
$('btn-user-menu').addEventListener('click', e => {
  e.stopPropagation();
  const dd = $('user-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
});

document.addEventListener('click', () => {
  $('user-dropdown').style.display = 'none';
});

$('btn-logout').addEventListener('click', async () => {
  await api('POST', '/auth/logout').catch(() => {});
  currentUser = null;
  activeSession = null;
  clearInterval(sessionTimerInterval);
  showLoginScreen();
});

// ── Settings ──────────────────────────────────────────────────────────────────
$('btn-settings').addEventListener('click', () => {
  $('settings-overlay').classList.toggle('open');
});

$('btn-close-settings').addEventListener('click', () => {
  $('settings-overlay').classList.remove('open');
});

$('settings-overlay').addEventListener('click', e => {
  if (e.target === $('settings-overlay')) $('settings-overlay').classList.remove('open');
});

$('btn-test').addEventListener('click', async () => {
  const url = $('input-backend-url').value.trim().replace(/\/$/, '');
  const testEl = $('test-msg');
  if (!url) { alert(t('alertEnterUrl')); return; }
  testEl.style.display = '';
  testEl.style.color = 'var(--text-muted)';
  testEl.textContent = t('testingEllipsis');
  try {
    const res = await fetch(url + '/status', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    testEl.style.color = '#56A67A';
    testEl.textContent = t('connectedBoardPrefix') + (data.board || 'web-bluetooth') + (data.model_ready ? t('modelReadySuffix') : t('modelLoadingSuffix'));
  } catch (e) {
    testEl.style.color = '#C75C5C';
    testEl.textContent = '✗ ' + (e.message || t('connectionFailed'));
  }
});

$('btn-save').addEventListener('click', () => {
  const url = $('input-backend-url').value.trim().replace(/\/$/, '');
  if (!url) { alert(t('alertEnterUrl')); return; }
  backendUrl = url;
  localStorage.setItem('controlhub_url', url);
  $('settings-overlay').classList.remove('open');
  connectBackendUrl(url);
});

// ── Admin page navigation ─────────────────────────────────────────────────────
$('btn-open-admin').addEventListener('click', () => { showAdminPage(); });
$('btn-back-to-dashboard').addEventListener('click', () => { showMainApp(); });

qAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => { openAdminTab(tab.dataset.tab); });
});

function openAdminTab(tabName) {
  if (tabName === 'users' && currentUser.role === 'co-admin') tabName = 'sessions';
  adminCurrentTab = tabName;
  qAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  $('admin-tab-users').style.display = tabName === 'users' ? '' : 'none';
  $('admin-tab-sessions').style.display = tabName === 'sessions' ? '' : 'none';
  if (tabName === 'users') loadAdminUsers();
  if (tabName === 'sessions') loadAdminSessions();
}

// ── Admin: Users tab ──────────────────────────────────────────────────────────
$('btn-add-user').addEventListener('click', () => {
  $('create-user-form').style.display = '';
  $('create-user-error').style.display = 'none';
  $('new-username').value = '';
  $('new-password').value = '';
  $('new-role').value = 'user';
});

$('btn-cancel-create-user').addEventListener('click', () => {
  $('create-user-form').style.display = 'none';
});

$('btn-create-user').addEventListener('click', async () => {
  const username = $('new-username').value.trim();
  const password = $('new-password').value;
  const role = $('new-role').value;
  const errEl = $('create-user-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = t('usernamePasswordRequired');
    errEl.style.display = '';
    return;
  }

  try {
    await api('POST', '/users', { username, password, role });
    $('create-user-form').style.display = 'none';
    await loadAdminUsers();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
  }
});

$('btn-cancel-reset-pw').addEventListener('click', () => {
  $('reset-pw-form').style.display = 'none';
  resetPwTargetUserId = null;
});

$('btn-save-reset-pw').addEventListener('click', async () => {
  if (!resetPwTargetUserId) return;
  const pw = $('reset-pw-input').value;
  if (!pw) { alert(t('alertEnterPassword')); return; }
  try {
    await api('PUT', '/users/' + resetPwTargetUserId + '/password', { password: pw });
    $('reset-pw-form').style.display = 'none';
    resetPwTargetUserId = null;
    $('reset-pw-input').value = '';
    alert(t('alertPasswordUpdated'));
  } catch (err) {
    alert(t('alertErrorPrefix') + err.message);
  }
});

async function loadAdminUsers() {
  const tbody = $('admin-users-tbody');
  tbody.innerHTML = `<tr><td colspan="5">${escHtml(t('loading'))}</td></tr>`;
  try {
    const users = await api('GET', '/users');
    tbody.innerHTML = '';
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5">${escHtml(t('noUsersFound'))}</td></tr>`;
      return;
    }
    users.forEach(u => {
      const isSelf = u.id === currentUser.id;
      const roleClass = 'role-' + u.role.replace('-', '_');
      const roleSelector = !isSelf ? `
        <select class="field-input field-input-xs" data-action="select-role">
          <option value="user" ${u.role==='user'?'selected':''}>${escHtml(t('adminRoleUser'))}</option>
          <option value="co-admin" ${u.role==='co-admin'?'selected':''}>${escHtml(t('adminRoleCoAdmin'))}</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>${escHtml(t('adminRoleAdmin'))}</option>
        </select>
        <button class="btn btn-primary btn-sm" data-action="change-role" data-uid="${u.id}">${escHtml(t('btnApply'))}</button>
      ` : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escHtml(u.username)}</strong></td>
        <td><span class="role-badge ${roleClass}">${escHtml(translateRole(u.role))}</span></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div class="table-actions">
            ${roleSelector}
          </div>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" data-action="reset-pw" data-uid="${u.id}">${escHtml(t('btnResetPw'))}</button>
            ${!isSelf
              ? `<button class="btn btn-danger btn-sm" data-action="delete-user" data-uid="${u.id}">${escHtml(t('btnDelete'))}</button>`
              : `<span class="role-badge role-user">${escHtml(t('youBadge'))}</span>`}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    localizeDom(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${escHtml(err.message)}</td></tr>`;
  }
}

$('admin-users-tbody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const uid = parseInt(btn.dataset.uid, 10);
  const action = btn.dataset.action;

  if (action === 'reset-pw') {
    resetPwTargetUserId = uid;
    $('reset-pw-input').value = '';
    $('reset-pw-form').style.display = '';
    $('reset-pw-input').focus();
  } else if (action === 'delete-user') {
    if (!confirm(t('confirmDeleteUser'))) return;
    try {
      await api('DELETE', '/users/' + uid);
      await loadAdminUsers();
    } catch (err) {
      alert(t('alertErrorPrefix') + err.message);
    }
  } else if (action === 'change-role') {
    const row = btn.closest('tr');
    const select = row.querySelector('[data-action="select-role"]');
    if (!select) return;
    const newRole = select.value;
    if (!confirm(tf('confirmChangeRole', { role: translateRole(newRole) }))) return;
    try {
      await api('PUT', '/users/' + uid + '/role', { role: newRole });
      await loadAdminUsers();
    } catch (err) {
      alert(t('alertErrorPrefix') + err.message);
    }
  }
});

// ── Admin: Sessions tab ───────────────────────────────────────────────────────
$('admin-sessions-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  qAll('#admin-sessions-tbody tr').forEach(tr => {
    const user = tr.querySelector('[data-username]')?.dataset.username || '';
    tr.style.display = user.includes(q) ? '' : 'none';
  });
});

async function loadAdminSessions() {
  const tbody = $('admin-sessions-tbody');
  tbody.innerHTML = `<tr><td colspan="6">${escHtml(t('loading'))}</td></tr>`;
  try {
    const sessions = await api('GET', '/sessions');
    tbody.innerHTML = '';
    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="6">${escHtml(t('noSessionsYetAdmin'))}</td></tr>`;
      return;
    }
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      tr.dataset.username = (s.username || '').toLowerCase();
      tr.innerHTML = `
        <td data-username="${escHtml(s.username || '')}">${escHtml(s.username || '?')}</td>
        <td><strong>${escHtml(s.name)}</strong></td>
        <td>${formatDate(s.startTime)}</td>
        <td>${s.duration ? formatDuration(s.duration) : (s.endTime ? '—' : `<em>${escHtml(t('activeLabel'))}</em>`)}</td>
        <td><span class="epoch-badge" id="epoch-count-${s.id}">—</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" data-action="view-analytics" data-sid="${s.id}" data-sname="${escHtml(s.name)}">
            ${escHtml(t('btnViewAnalytics'))}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    localizeDom(tbody);
    loadEpochCounts(sessions, tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${escHtml(err.message)}</td></tr>`;
  }
}

async function loadEpochCounts(sessions, tbody) {
  await Promise.allSettled(sessions.map(async s => {
    try {
      const data = await api('GET', '/sessions/' + s.id + '/analytics');
      const el = $('epoch-count-' + s.id);
      if (el) el.textContent = data.summary?.totalEpochs ?? 0;
    } catch { /* ignore */ }
  }));
  if (tbody) localizeDom(tbody);
}

$('admin-sessions-tbody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action="view-analytics"]');
  if (!btn) return;
  const sid = parseInt(btn.dataset.sid, 10);
  const sname = btn.dataset.sname;
  openSessionAnalytics(sid, sname);
});

// ── Session Analytics Overlay ─────────────────────────────────────────────────
$('btn-close-analytics').addEventListener('click', () => {
  $('analytics-overlay').style.display = 'none';
  stopReplay();
});

$('analytics-overlay').addEventListener('click', e => {
  if (e.target === $('analytics-overlay')) {
    $('analytics-overlay').style.display = 'none';
    stopReplay();
  }
});

function setAnalyticsState(state) {
  // state: 'loading' | 'error' | 'content'
  $('analytics-loading').style.display = state === 'loading' ? '' : 'none';
  $('analytics-error').style.display = state === 'error' ? '' : 'none';
  $('analytics-content').style.display = state === 'content' ? '' : 'none';
}

async function openSessionAnalytics(sessionId, sessionName) {
  currentAnalyticsSessionId = sessionId;
  $('analytics-session-name').textContent = sessionName || t('aiBabaSessionFallbackName');
  $('analytics-session-meta').textContent = '';
  $('analytics-overlay').style.display = '';
  setAnalyticsState('loading');

  try {
    const data = await api('GET', '/sessions/' + sessionId + '/analytics');
    renderAnalyticsSummary(data.summary || {});
    renderAnalyticsTimeline(data.phases || []);
    setAnalyticsState('content');
    loadAnalyticsNotes(sessionId);
    localizeDom(document.querySelector('.analytics-panel'));
  } catch (err) {
    $('analytics-error').textContent = err.message;
    setAnalyticsState('error');
  }
}

function pct(v) { return v != null ? Math.round(v * 100) + '%' : '—'; }

function renderAnalyticsSummary(s) {
  $('a-total-epochs').textContent = s.totalEpochs != null ? localizeNumber(s.totalEpochs) : '—';
  $('a-duration').textContent = s.durationSeconds ? formatDuration(s.durationSeconds) : '—';
  $('a-dominant-guna').textContent = s.dominantGuna ? t(s.dominantGuna.toLowerCase()) : '—'; // 'sattva'/'rajas'/'tamas' key
  $('a-dominant-state').textContent = s.dominantState ? translateState(s.dominantState) : '—';
  $('a-avg-spo2').textContent = s.avgSpo2 != null ? localizeNumber(s.avgSpo2.toFixed(1)) : '—';
  $('a-avg-hr').textContent = s.avgHr != null ? localizeNumber(s.avgHr.toFixed(0)) : '—';

  const gunas = s.avgGunas || {};
  ['sattva', 'rajas', 'tamas'].forEach(g => {
    const barEl = $('a-bar-' + g);
    const pctEl = $('a-pct-' + g);
    if (barEl) barEl.style.width = (gunas[g] != null ? Math.round(gunas[g] * 100) : 0) + '%';
    if (pctEl) pctEl.textContent = localizeNumber(pct(gunas[g]));
  });

  renderBreakdown('a-state-breakdown', s.stateCounts || {}, s.totalEpochs || 0, translateState);
  renderBreakdown('a-swara-breakdown', s.swaraCounts || {}, s.totalEpochs || 0, translateSwaraNadi);

  const bandsEl = $('a-avg-bands');
  if (bandsEl) {
    const syms = { delta: 'δ', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ' };
    const nameKeys = { delta: 'bandDelta', theta: 'bandTheta', alpha: 'bandAlpha', beta: 'bandBeta', gamma: 'bandGamma' };
    const avgBands = s.avgBands || {};
    bandsEl.innerHTML = ['delta', 'theta', 'alpha', 'beta', 'gamma'].map(b => `
      <div class="analytics-band-pill">
        <span class="analytics-band-sym">${syms[b]}</span>
        <span class="analytics-band-name">${escHtml(t(nameKeys[b]))}</span>
        <span class="analytics-band-val">${localizeNumber(pct(avgBands[b]))}</span>
      </div>
    `).join('');
  }
}

function renderBreakdown(containerId, counts, total, translateLabel) {
  const el = $(containerId);
  if (!el) return;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { el.innerHTML = `<p style="color:var(--text-muted);font-size:12px">${escHtml(t('noDataDot'))}</p>`; return; }
  el.innerHTML = entries.map(([label, count]) => {
    const p = total ? Math.round((count / total) * 100) : 0;
    const displayLabel = translateLabel ? translateLabel(label) : label;
    return `
      <div class="breakdown-item">
        <span class="breakdown-label">${escHtml(displayLabel)}</span>
        <div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${p}%"></div></div>
        <span class="breakdown-pct">${localizeNumber(p)}%</span>
      </div>
    `;
  }).join('');
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function renderAnalyticsTimeline(phases) {
  const el = $('a-timeline');
  if (!el) return;
  if (!phases.length) { el.innerHTML = `<p style="color:var(--text-muted);font-size:12px">${escHtml(t('noPhaseDataDot'))}</p>`; return; }
  el.innerHTML = phases.map(p => `
    <div class="timeline-phase">
      <strong>${escHtml(translateState(p.state))}</strong>
      <span>${escHtml(p.depth ? translateDepth(p.depth) : '')}</span>
      <span>${formatTime(p.fromSeconds)} – ${formatTime(p.toSeconds)}</span>
      <span>${localizeNumber(p.epochCount)} ${p.epochCount !== 1 ? t('aiBabaEpochPlural') : t('aiBabaEpochSingular')}</span>
    </div>
  `).join('');
}

// ── Session Notes (analytics modal) ───────────────────────────────────────────
async function loadAnalyticsNotes(sessionId) {
  const el = $('a-notes-content');
  if (!el) return;
  try {
    const data = await api('GET', '/sessions/' + sessionId + '/notes');
    el.innerHTML = data.content
      ? escHtml(data.content).replace(/\n/g, '<br>')
      : `<em class="analytics-notes-empty">${escHtml(t('noNotesRecorded'))}</em>`;
  } catch {
    el.innerHTML = `<em class="analytics-notes-empty">${escHtml(t('noNotesRecorded'))}</em>`;
  }
}

// ── Session export (.txt) — full per-epoch data for offline classifier
// calibration. Kept deliberately in plain, untranslated, consistently-
// formatted terms regardless of UI language (this is meant to be read by a
// person doing careful analysis across states/features, not displayed in the
// app), and includes a blank line per epoch for the user to hand-annotate
// what they were actually doing/experiencing before feeding the file back in.
function fmtExportNum(v, digits) {
  return (v == null || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(digits ?? 3);
}

// Chitta Bhumi probabilities are inconsistently shaped across the three
// analysis paths — demo and the backend-relay path send raw 0-1 floats,
// the local-FFT fallback sends pre-formatted "82.4%" strings. Normalize
// both into the same percentage display rather than let fmtExportNum
// silently blank out the already-formatted strings (Number("82.4%") is NaN).
function fmtExportProb(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.includes('%') ? v : (isNaN(Number(v)) ? v : (Number(v) * 100).toFixed(1) + '%');
  const n = Number(v);
  return isNaN(n) ? '—' : (n * 100).toFixed(1) + '%';
}

function buildSessionExportTxt(sessionName, epochs, notes) {
  const lines = [];
  const sep = '='.repeat(78);
  const dash = '-'.repeat(78);

  lines.push(sep);
  lines.push('SESSION EXPORT: ' + sessionName);
  lines.push('Exported: ' + new Date().toLocaleString());
  lines.push('Total epochs: ' + epochs.length);
  lines.push(sep);
  lines.push('');
  lines.push('SESSION NOTES:');
  lines.push(notes && notes.trim() ? notes.trim() : '(none)');
  lines.push('');
  lines.push(sep);
  lines.push('EPOCH-BY-EPOCH DATA');
  lines.push('Each epoch below has a blank "MY NOTES" line at the end — fill in what');
  lines.push('you actually experienced/were doing during that epoch, then paste this');
  lines.push('whole file back for classifier calibration analysis.');
  lines.push(sep);

  for (const ep of epochs) {
    lines.push('');
    lines.push(dash);
    const elapsed = ep.elapsedSeconds != null ? formatTime(ep.elapsedSeconds) : '—';
    lines.push(`EPOCH ${ep.epochNum}  |  t=+${elapsed}  |  recorded ${formatDate(ep.recordedAt)}  |  source: ${ep.dataQuality || '—'}`);
    lines.push(dash);

    lines.push('');
    lines.push('CHITTA BHUMI');
    lines.push(`  State: ${ep.chittaBhumi || '—'}   Confidence: ${ep.chittaConfidence || '—'}   Depth: ${ep.contemplativeDepth || '—'}`);
    const probEntries = ep.probabilities && typeof ep.probabilities === 'object' ? Object.entries(ep.probabilities) : [];
    lines.push('  Full probabilities: ' + (probEntries.length ? probEntries.map(([k, v]) => `${k}=${fmtExportProb(v)}`).join('  ') : '—'));

    lines.push('');
    lines.push('SWARA NADI');
    lines.push(`  State: ${ep.swara || '—'}   Confidence: ${ep.swaraConfidence || '—'}`);
    if (ep.swaraNote) lines.push(`  Note: ${ep.swaraNote}`);

    lines.push('');
    lines.push('TRIGUNAS');
    lines.push(`  Sattva=${fmtExportNum(ep.gunas?.sattva)}  Rajas=${fmtExportNum(ep.gunas?.rajas)}  Tamas=${fmtExportNum(ep.gunas?.tamas)}  Label=${ep.gunas?.label || '—'}`);

    lines.push('');
    lines.push('BAND POWERS (relative, 0-1)');
    lines.push(`  Delta=${fmtExportNum(ep.bands?.delta)}  Theta=${fmtExportNum(ep.bands?.theta)}  Alpha=${fmtExportNum(ep.bands?.alpha)}  LowBeta=${fmtExportNum(ep.lowBetaPower)}  HighBeta=${fmtExportNum(ep.highBetaPower)}  Beta(combined)=${fmtExportNum(ep.bands?.beta)}  Gamma=${fmtExportNum(ep.bands?.gamma)}`);

    lines.push('');
    lines.push('KEY DISCRIMINATING FEATURES');
    lines.push(`  FAA (frontal alpha asymmetry): ${fmtExportNum(ep.faa)}`);
    lines.push(`  PLV (phase-locking / coherence): ${fmtExportNum(ep.plv)}`);
    lines.push(`  Vritti index: ${fmtExportNum(ep.vrittiIndex)}   Nirodha state: ${ep.nirodhaState || '—'}`);

    if (ep.complexity) {
      lines.push('');
      lines.push('COMPLEXITY / INNER TEXTURE');
      lines.push(`  LZiv=${fmtExportNum(ep.complexity.lziv)}  HiguchiFD=${fmtExportNum(ep.complexity.higuchiFd)}  SampleEntropy=${fmtExportNum(ep.complexity.sampleEntropy)}  PermEntropy=${fmtExportNum(ep.complexity.permEntropy)}`);
    }
    if (ep.aperiodic) {
      lines.push(`  Aperiodic: exponent=${fmtExportNum(ep.aperiodic.exponent)}  offset=${fmtExportNum(ep.aperiodic.offset)}`);
    }

    lines.push('');
    lines.push('TATTVA FLAGS');
    lines.push('  ' + ((ep.tattvaFlags && ep.tattvaFlags.length) ? ep.tattvaFlags.join(', ') : '(none)'));

    if (ep.corroboration && ep.corroboration.axes && ep.corroboration.axes.length) {
      lines.push('');
      lines.push('CORROBORATION (what the signals say)');
      lines.push(`  Overall: ${ep.corroboration.concord || '—'}${ep.corroboration.indeterminate ? ' (indeterminate)' : ''}`);
      for (const ax of ep.corroboration.axes) {
        const agree = ax.agrees === true ? 'agrees' : ax.agrees === false ? 'disagrees' : 'neutral';
        lines.push(`  - ${ax.axis}: ${ax.reading} (${agree})${ax.note ? ' — ' + ax.note : ''}`);
      }
      if (ep.corroboration.caveat) lines.push(`  Caveat: ${ep.corroboration.caveat}`);
    }

    if (ep.heartRate != null || ep.bloodOxygen != null) {
      lines.push('');
      lines.push('VITALS');
      lines.push(`  Heart rate: ${ep.heartRate != null ? ep.heartRate + ' bpm' : '—'}   SpO2: ${ep.bloodOxygen != null ? ep.bloodOxygen + '%' : '—'}`);
    }

    lines.push('');
    lines.push('MY NOTES FOR THIS EPOCH: ______________________________________________');
  }

  lines.push('');
  lines.push(sep);
  lines.push('END OF EXPORT');
  lines.push(sep);

  return lines.join('\n');
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportSessionAsTxt() {
  const sessionId = currentAnalyticsSessionId;
  if (!sessionId) return;
  const btn = $('btn-export-session');
  const originalLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = t('exportingEllipsis'); }
  try {
    const [epochs, notesData] = await Promise.all([
      api('GET', '/sessions/' + sessionId + '/epochs'),
      api('GET', '/sessions/' + sessionId + '/notes').catch(() => ({ content: '' })),
    ]);
    const sessionName = (($('analytics-session-name') && $('analytics-session-name').textContent) || 'Session').trim();
    const txt = buildSessionExportTxt(sessionName, epochs, notesData?.content || '');
    const safeName = sessionName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'session';
    downloadTextFile(safeName + '_export.txt', txt);
  } catch (err) {
    showToast(t('exportFailedPrefix') + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

const btnExportSession = $('btn-export-session');
if (btnExportSession) btnExportSession.addEventListener('click', exportSessionAsTxt);

// ── Replay Player ─────────────────────────────────────────────────────────────
$('replay-prev').addEventListener('click', () => { updateReplayDisplay(replayIndex - 1); });
$('replay-next').addEventListener('click', () => { updateReplayDisplay(replayIndex + 1); });
$('replay-play-pause').addEventListener('click', () => {
  if (replayPlaying) stopReplay(); else startReplay();
});
$('replay-slider').addEventListener('input', e => { updateReplayDisplay(parseInt(e.target.value, 10)); });
$('replay-session-select').addEventListener('change', e => { replaySessionId = e.target.value; loadReplayData(); });
$('replay-speed').addEventListener('change', e => {
  replaySpeed = parseFloat(e.target.value) || 1;
  if (replayPlaying) { stopReplay(); startReplay(); } // re-arm timer at new cadence
});
// Keyboard transport — only while the Replay view is active.
document.addEventListener('keydown', e => {
  if (currentView !== 'replay') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); replayPlaying ? stopReplay() : startReplay(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); updateReplayDisplay(replayIndex - 1); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); updateReplayDisplay(replayIndex + 1); }
});

// "Open in Replay ↗" from the analytics overlay → deep-link into the Replay view.
$('btn-open-replay').addEventListener('click', () => {
  pendingReplaySessionId = currentAnalyticsSessionId;
  const overlay = $('analytics-overlay');
  if (overlay) overlay.style.display = 'none';
  stopReplay();
  showView('replay');
});

// Populate the Replay view's session picker and load the (deep-linked or first) session.
async function onShowReplay() {
  const sel = $('replay-session-select');
  if (!sel) return;
  try {
    const sessions = await api('GET', '/sessions/mine');
    if (!sessions.length) { sel.innerHTML = `<option value="">${escHtml(t('noSessionsOption'))}</option>`; replaySessionId = null; showReplayNoData(); return; }
    sel.innerHTML = sessions.map(s =>
      `<option value="${s.id}">${escHtml(s.name)} — ${new Date(s.startTime).toLocaleDateString()}</option>`).join('');
    const target = pendingReplaySessionId || replaySessionId || sessions[0].id;
    pendingReplaySessionId = null;
    if (sessions.some(s => String(s.id) === String(target))) sel.value = String(target);
    replaySessionId = sel.value;
    await loadReplayData();
  } catch (err) {
    showReplayNoData();
  }
}

function startReplay() {
  if (!replayEpochs.length) return;
  // If parked at the end, restart from the top instead of dead-stopping.
  if (replayIndex >= replayEpochs.length - 1) updateReplayDisplay(0);
  replayPlaying = true;
  $('replay-play-pause').textContent = t('pauseLabel');
  replayTimer = setInterval(() => {
    if (replayIndex >= replayEpochs.length - 1) { stopReplay(); return; }
    updateReplayDisplay(replayIndex + 1);
  }, 1500 / replaySpeed);
}

function stopReplay() {
  replayPlaying = false;
  clearInterval(replayTimer); replayTimer = null;
  $('replay-play-pause').textContent = t('playLabel');
}

async function loadReplayData() {
  stopReplay();
  replayEpochs = [];
  replayIndex = 0;
  const noData = $('replay-no-data');
  const stateDisplay = $('replay-state-display');
  const slider = $('replay-slider');
  const sid = replaySessionId;

  if (!sid) { showReplayNoData(); return; }

  try {
    const data = await api('GET', '/sessions/' + sid + '/epochs');
    replayEpochs = Array.isArray(data) ? data : (data.epochs || []);
  } catch {
    showReplayNoData();
    return;
  }

  // Session-level readout: phase scrubber + honest metrics strip from /analytics.
  try {
    const a = await api('GET', '/sessions/' + sid + '/analytics');
    lastReplaySummary = a.summary || null;
    lastReplayPhases = a.phases || [];
    renderReplayScrubber(lastReplayPhases, a.summary?.durationSeconds || 0);
    renderReplayMetrics(a.summary || {});
    renderReplayViewMeta(a.summary || null);
  } catch {
    lastReplaySummary = null;
    lastReplayPhases = [];
    /* scrubber/metrics are enrichments — replay still works without them */
  }

  if (!replayEpochs.length) { showReplayNoData(); return; }

  if (noData) noData.style.display = 'none';
  if (stateDisplay) stateDisplay.style.display = '';
  if (slider) {
    slider.max = replayEpochs.length - 1;
    slider.value = 0;
  }
  updateReplayDisplay(0);
}

// Phase-colored track behind the scrubber, positioned by each phase's time span.
function renderReplayScrubber(phases, totalSeconds) {
  const track = $('replay-scrubber');
  if (!track) return;
  const colors = { Mudha:'#8A8F98', Kshipta:'var(--kshipta)', Vikshipta:'var(--vikshipta)', Ekagra:'var(--ekagra)', Niruddha:'var(--niruddha)' };
  const total = totalSeconds > 0 ? totalSeconds : null;
  if (!phases.length || !total) { track.innerHTML = ''; return; }
  track.innerHTML = phases.map(p => {
    const from = p.fromSeconds ?? 0, to = p.toSeconds ?? from;
    const left = Math.max(0, Math.min(100, from / total * 100));
    const width = Math.max(0.5, Math.min(100 - left, (to - from) / total * 100));
    const col = colors[p.state] || 'var(--text-muted)';
    return `<span class="scrubber__phase" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${col}" title="${escHtml(translateState(p.state))}"></span>`;
  }).join('');
}

// Honest session metrics — only real /analytics fields (no fabricated coherence/σ).
function renderReplayMetrics(s) {
  const strip = $('replay-metrics');
  if (!strip) return;
  const cells = [
    [t('dominantStateLabel'), s.dominantState ? translateState(s.dominantState) : '—'],
    [t('dominantGunaLabel'), s.dominantGuna ? t(s.dominantGuna.toLowerCase()) : '—'],
    [t('avgSpo2Label'), s.avgSpo2 != null ? localizeNumber(s.avgSpo2.toFixed(1)) + '%' : '—'],
    [t('avgHrLabel'), s.avgHr != null ? localizeNumber(Math.round(s.avgHr)) + ' bpm' : '—'],
    [t('epochsLabel'), s.totalEpochs != null ? localizeNumber(s.totalEpochs) : '—'],
  ];
  strip.innerHTML = cells.map(([k, v]) =>
    `<div class="metrics-strip__cell"><span class="metrics-strip__label">${k}</span><span class="metrics-strip__value">${escHtml(String(v))}</span></div>`).join('');
}

function renderReplayViewMeta(summary) {
  const metaEl = $('replay-view-meta');
  if (!metaEl) return;
  metaEl.textContent = summary && summary.totalEpochs
    ? tf('replayViewMetaTemplate', { epochs: localizeNumber(summary.totalEpochs), duration: formatDuration(summary.durationSeconds || 0) })
    : '';
}

function showReplayNoData() {
  const noData = $('replay-no-data');
  const stateDisplay = $('replay-state-display');
  if (noData) noData.style.display = '';
  if (stateDisplay) stateDisplay.style.display = 'none';
  const epochLbl = $('replay-epoch-label');
  const timeLbl = $('replay-time-label');
  if (epochLbl) epochLbl.textContent = '—';
  if (timeLbl) timeLbl.textContent = '—';
}

function updateReplayDisplay(idx) {
  if (!replayEpochs.length) return;
  idx = Math.max(0, Math.min(idx, replayEpochs.length - 1));
  replayIndex = idx;
  const ep = replayEpochs[idx];
  const slider = $('replay-slider');
  if (slider) slider.value = idx;

  const epochLbl = $('replay-epoch-label');
  const timeLbl = $('replay-time-label');
  if (epochLbl) epochLbl.textContent = `${idx + 1} / ${replayEpochs.length}`;
  if (timeLbl) timeLbl.textContent = ep.elapsedSeconds != null ? formatTime(ep.elapsedSeconds) : '—';

  // Replay into the main display
  const ch = ep.chittaBhumi ? { state: ep.chittaBhumi, depth: ep.contemplativeDepth, confidence: ep.chittaConfidence, probabilities: {} } : {};
  const sw = ep.swara ? { state: ep.swara, confidence: ep.swaraConfidence, note: '' } : {};
  applyReading({
    epoch: ep.epochNum,
    chitta_bhumi: ch,
    swara: sw,
    band_powers: { relative: ep.bands || {} },
    eeg_spectrum: ep.bands || {},
    tattva_flags: ep.tattvaFlags || [],
    contemplative_depth: ep.contemplativeDepth,
    alpha_asymmetry: 0,
    gunas: ep.gunas || null,
    blood_oxygen: ep.bloodOxygen,
    heart_rate: ep.heartRate,
    vritti_index: ep.vrittiIndex ?? null,
    nirodha_state: ep.nirodhaState || null,
    complexity: ep.complexity ? {
      lziv: ep.complexity.lziv,
      higuchi_fd: ep.complexity.higuchiFd,
      sample_entropy: ep.complexity.sampleEntropy,
      perm_entropy: ep.complexity.permEntropy,
    } : null,
    aperiodic: ep.aperiodic || null,
    latency_ms: null,
    data_quality: '⏪ replay',
  });

  // Replay state summary panel
  const stateValEl = $('replay-state-val');
  const swaraValEl = $('replay-swara-val');
  const gunaValEl = $('replay-guna-val');
  const alphaValEl = $('replay-alpha-val');
  const spo2ValEl = $('replay-spo2-val');
  const hrValEl = $('replay-hr-val');
  if (stateValEl) stateValEl.textContent = ep.chittaBhumi ? translateState(ep.chittaBhumi) : '—';
  if (swaraValEl) swaraValEl.textContent = ep.swara ? translateSwaraNadi(ep.swara) : '—';
  if (gunaValEl) gunaValEl.textContent = ep.gunas?.label ? translateGunaLabel(ep.gunas.label) : '—';
  if (alphaValEl) alphaValEl.textContent = ep.bands?.alpha != null ? Math.round(ep.bands.alpha * 100) + '%' : '—';
  if (spo2ValEl) spo2ValEl.textContent = ep.bloodOxygen != null ? ep.bloodOxygen.toFixed(1) + '%' : '—';
  if (hrValEl) hrValEl.textContent = ep.heartRate != null ? ep.heartRate.toFixed(0) + ' bpm' : '—';
  localizeDom(document.querySelector('.replay-view'));
}

// ── Session management ────────────────────────────────────────────────────────
$('btn-start-session').addEventListener('click', async () => {
  const name = prompt(t('sessionNamePrompt'), t('sessionDefaultPrefix') + new Date().toLocaleDateString());
  if (name === null) return;

  try {
    const clientSel = $('session-client-select');
    const clientId = clientSel && clientSel.value ? clientSel.value : null;
    const sess = await api('POST', '/sessions/start', { name: name.trim() || t('newSessionFallbackName'), client_id: clientId });
    activeSession = sess;
    sessionStartTimestamp = new Date();
    sessionEpochCounter = 0;

    $('session-name-display').textContent = sess.name;
    $('session-status').style.display = '';
    $('btn-start-session').style.display = 'none';
    $('btn-end-session').style.display = '';
    $('session-notes').value = '';
    $('session-notes').disabled = false;

    clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTimestamp) / 1000);
      $('session-timer').textContent = localizeNumber(formatTime(elapsed));
    }, 1000);
    $('session-timer').textContent = localizeNumber('0:00');
  } catch (err) {
    alert(t('failedToStartSessionPrefix') + err.message);
  }
});

$('btn-end-session').addEventListener('click', async () => {
  if (!activeSession) return;
  try {
    await api('POST', '/sessions/' + activeSession.id + '/end');
  } catch { /* ignore */ }
  clearInterval(sessionTimerInterval);
  activeSession = null;
  $('session-status').style.display = 'none';
  $('btn-start-session').style.display = '';
  $('btn-end-session').style.display = 'none';
  $('session-notes').disabled = true;
  await loadSessionHistory();
});

// ── Session notes autosave (debounced) ────────────────────────────────────────
$('session-notes').disabled = true;
$('session-notes').addEventListener('input', () => {
  if (!activeSession) return;
  clearTimeout(notesSaveTimeout);
  notesSaveTimeout = setTimeout(async () => {
    try {
      await api('PUT', '/sessions/' + activeSession.id + '/notes', { content: $('session-notes').value });
    } catch { /* ignore — will retry on next keystroke */ }
  }, 800);
});

async function loadSessionHistory() {
  const list = $('history-list');
  if (!list) return;
  try {
    const sessions = await api('GET', '/sessions/mine');
    list.innerHTML = '';
    if (!sessions.length) {
      list.innerHTML = `<div id="history-empty" class="history-empty">${escHtml(t('noSessionsYet'))}</div>`;
      return;
    }
    sessions.slice(0, 5).forEach(s => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = `${s.name} — ${formatDate(s.startTime)}`;
      list.appendChild(item);
    });
  } catch { /* ignore */ }
}

$('btn-toggle-history').addEventListener('click', () => {
  const list = $('history-list');
  const btn = $('btn-toggle-history');
  const isHidden = list.style.display === 'none';
  list.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? t('hide') : t('show');
});

// Store epoch to database (fire-and-forget)
function storeEpochToSession(r) {
  if (!activeSession || !r) return;
  sessionEpochCounter++;
  const elapsedSeconds = sessionStartTimestamp
    ? (Date.now() - sessionStartTimestamp.getTime()) / 1000
    : null;

  const ch = r.chitta_bhumi || {};
  const sw = r.swara || {};
  const spectrum = r.eeg_spectrum || (r.band_powers && r.band_powers.relative) || {};
  const gunas = r.gunas || {};
  const flags = r.tattva_flags || [];
  const swaraSimple = (sw.state || '').split(' ')[0] || null;

  const epochBody = {
    epochNum: sessionEpochCounter,
    elapsedSeconds: elapsedSeconds ? +elapsedSeconds.toFixed(2) : null,
    chittaBhumi: ch.state || null,
    chittaConfidence: ch.confidence || null,
    contemplativeDepth: ch.depth || null,
    swara: swaraSimple,
    swaraConfidence: sw.confidence || null,
    bands: {
      delta: spectrum.delta ?? null,
      theta: spectrum.theta ?? null,
      alpha: spectrum.alpha ?? null,
      beta: spectrum.beta ?? null,
      gamma: spectrum.gamma ?? null,
    },
    gunas: {
      sattva: gunas.sattva ?? null,
      rajas: gunas.rajas ?? null,
      tamas: gunas.tamas ?? null,
      label: gunas.label || null,
    },
    tattvaFlags: flags || [],
    bloodOxygen: r.blood_oxygen != null ? r.blood_oxygen : null,
    heartRate: r.heart_rate != null ? r.heart_rate : null,
    // Inner Texture (v3 deep-state features) — previously dropped here, so
    // Replay/Analyze always showed them empty even on a live epoch with data.
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
    // Full-fidelity fields for offline classifier calibration — all of these
    // were already computed live in the reading object but silently dropped
    // here before now, so Replay/Analyze and any future export only ever saw
    // the winning state, never the full picture behind it.
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

  api('POST', '/sessions/' + activeSession.id + '/epoch', epochBody)
    .catch(err => console.warn('[Epoch store] failed:', err.message));
}

// ── Local FFT + classification ────────────────────────────────────────────────
function fft(signal) {
  let size = 1;
  while (size < signal.length) size <<= 1;
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i];
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i],re[j]]=[re[j],re[i]]; [im[i],im[j]]=[im[j],im[i]]; }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < size; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i+j], uIm = im[i+j], h = i+j+(len>>1);
        const vRe = re[h]*cRe - im[h]*cIm, vIm = re[h]*cIm + im[h]*cRe;
        re[i+j]=uRe+vRe; im[i+j]=uIm+vIm; re[h]=uRe-vRe; im[h]=uIm-vIm;
        const nRe = cRe*wRe - cIm*wIm; cIm = cRe*wIm + cIm*wRe; cRe = nRe;
      }
    }
  }
  const half = size >> 1, mags = new Array(half);
  for (let i = 0; i < half; i++) mags[i] = Math.sqrt(re[i]*re[i]+im[i]*im[i]) / size;
  return mags;
}

// Band edges match the .NET analyser's FeatureExtractor exactly (delta 0.5-4,
// theta 4-8, alpha 8-13, low_beta 13-18, high_beta 18-30, gamma 30-50) so the
// local fallback's Rajas marker (high-beta) lines up with the real classifier.
function bandPowers(mags, sr, sz) {
  const res = sr / sz;
  const bin = hz => Math.round(hz / res);
  const sum = (lo, hi) => {
    let s = 0;
    for (let b = bin(lo); b <= Math.min(bin(hi), mags.length-1); b++) s += mags[b]*mags[b];
    return s;
  };
  const d=sum(0.5,4), t=sum(4,8), a=sum(8,13), lb=sum(13,18), hb=sum(18,30), g=sum(30,50);
  const tot = d+t+a+lb+hb+g || 1;
  return { delta:d/tot, theta:t/tot, alpha:a/tot, low_beta:lb/tot, high_beta:hb/tot, beta:(lb+hb)/tot, gamma:g/tot };
}

// ── Local Guna classifier — faithful port of the backend's GunaClassifier +
// GunaBlend (eeg-backend/src/NeuroYogic.Analysis/Classification/GunaClassifier.cs,
// GunaBlend.cs). Used only when the .NET analyser is unreachable, so this fallback
// no longer silently drops Gunas/vṛtti — see IMPLEMENTATION_PLAN.md guardrails.
function classifyGunasLocal(bp, faa, plv, swaraNadi) {
  const relu = x => Math.max(0, x);
  // v4 fix: coherence bonus gated by alpha (see GunaClassifier.cs) — a flat
  // bonus let low-alpha/high-beta readings score falsely Sattvic off PLV alone.
  let sat = bp.alpha*4.5 + bp.theta*2.5 + bp.low_beta*0.8 + relu(plv-0.50)*bp.alpha*7.0 + relu(0.20-Math.abs(faa))*1.5;
  let raj = bp.high_beta*5.5 + relu(0.20-bp.alpha)*2.0 + relu(faa)*1.8 + relu(bp.gamma-0.10)*0.8;
  let tam = bp.delta*4.5 + relu(0.15-bp.alpha)*2.5 + relu(0.06-bp.gamma)*2.0 + relu(0.45-plv)*1.0;

  if (swaraNadi === 'sushumna') { sat += 0.20; raj = Math.max(0, raj-0.10); }
  else if (swaraNadi === 'pingala') { raj += 0.15; sat = Math.max(0, sat-0.05); }
  else if (swaraNadi === 'ida') { if (bp.delta > 0.30) tam += 0.10; else sat += 0.08; }

  sat = Math.max(sat, 0.01); raj = Math.max(raj, 0.01); tam = Math.max(tam, 0.01);
  const total = sat + raj + tam;
  const sattva = sat/total, rajas = raj/total, tamas = tam/total;

  const ranked = [['Sattva', sattva], ['Rajas', rajas], ['Tamas', tamas]].sort((a,b) => b[1]-a[1]);
  const [g1, v1] = ranked[0], [g2] = ranked[1], [, v3] = ranked[2];
  const adj = { Sattva: 'Sattvic', Rajas: 'Rajasic', Tamas: 'Tamasic' };
  let label;
  if (v1 - v3 < 0.12) label = 'Balanced (all three)';
  else if (ranked[1][1] >= 0.50 * v1) label = `${adj[g1]}-predominant, ${adj[g2]}-secondary`;
  else label = adj[g1];

  return { sattva, rajas, tamas, label };
}

function pearsonCorr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma=0, mb=0;
  for (let i=0;i<n;i++){ ma+=a[i]; mb+=b[i]; }
  ma/=n; mb/=n;
  let num=0, da=0, db=0;
  for (let i=0;i<n;i++){ const xa=a[i]-ma, xb=b[i]-mb; num+=xa*xb; da+=xa*xa; db+=xb*xb; }
  return num / (Math.sqrt(da*db) || 1e-9);
}

function softmax(logits) {
  const m = Math.max(...logits), ex = logits.map(l=>Math.exp(l-m)), s = ex.reduce((a,b)=>a+b,0);
  return ex.map(e=>e/s);
}

// `faa` and `plv` are computed by the caller from the real left/right channel
// pair (see processBluetoothEEG) — this used to be `Math.random()`, which made
// Swara AND every guna/vṛtti figure derived from it meaningless noise.
function classifyLocal(bp, faa, plv) {
  const states = ['Kshipta','Vikshipta','Ekagra','Niruddha'];
  const logits = [
    bp.beta*3.0 + bp.gamma*1.5 - bp.alpha*1.5,
    bp.alpha*1.5 + bp.beta*1.5 - bp.theta*0.5,
    bp.alpha*3.5 + bp.theta*1.0 - bp.beta*2.0,
    bp.theta*3.0 + bp.delta*2.0 - bp.beta*2.5,
  ];
  const probs = softmax(logits);
  const maxI = probs.indexOf(Math.max(...probs));
  const state = states[maxI];
  const probMap = {};
  states.forEach((s,i) => { probMap[s] = (probs[i]*100).toFixed(1)+'%'; });

  // ─────────────────────────────────────────────────────────────────────────
  // DO NOT TOUCH — Swara/Nadi. Restored to its original form on request: this
  // is the one reading users have confirmed feels right, so it's kept exactly
  // as it was (random-jitter asym, ±0.04 threshold) rather than wired to the
  // real per-channel FAA computed above. If you're tempted to "fix" this to
  // use real FAA again, don't — ask first.
  // ─────────────────────────────────────────────────────────────────────────
  const asym = (Math.random()-0.5) * 0.3;
  const isIda = asym < -0.04, isPingala = asym > 0.04;
  const swaraState = isIda ? 'Ida Nadi — right hemisphere dominant'
    : isPingala ? 'Pingala Nadi — left hemisphere dominant'
    : 'Sushumna — both nadis balanced';
  const swaraNote = isIda ? SWARA_NOTES.ida : isPingala ? SWARA_NOTES.pingala : SWARA_NOTES.sushumna;

  // Gunas/vṛtti still use the REAL per-channel FAA (not the display-only `asym`
  // above) — the swara-secondary term in the guna formula needs the accurate
  // nadi, since the user asked for the guna classification to be 100% accurate.
  const swaraNadi = faa < -0.15 ? 'ida' : faa > 0.15 ? 'pingala' : 'sushumna';

  const tattva = [];
  if (bp.gamma > 0.12) tattva.push('Gamma Spike');
  if (bp.theta > 0.25 && bp.high_beta < 0.10) tattva.push('Pratyahara Window');
  if (bp.delta > 0.35 && bp.alpha > 0.15) tattva.push('Turiya Approach');
  if (plv > 0.80 && Math.abs(faa) < 0.10) tattva.push('Sushumna Activated');
  if (bp.high_beta > 0.30) tattva.push('High-Beta Agitation');
  if (bp.delta > 0.40 && bp.alpha < 0.10) tattva.push('Tamasic State');

  const gunas = classifyGunasLocal(bp, faa, plv, swaraNadi);
  // Same formula as VedanticAnalyzer.VrittiIndex.
  const vritti = Math.max(0, Math.min(1, 1.6*bp.high_beta + 0.35*(1-plv) - 0.15));
  const nirodhaState = vritti < 0.20 ? 'Nirodha (still)' : vritti < 0.45 ? 'Settling'
    : vritti < 0.70 ? 'Active' : 'Vikshepa (scattered)';

  epoch++;
  const depth = CHITTA_DEPTHS[state];
  return {
    epoch, latency_ms: 20 + Math.random()*10,
    data_quality: '✓ local FFT',
    chitta_bhumi: { state, depth, confidence: probMap[state], probabilities: probMap },
    swara: { state: swaraState, confidence: Math.abs(asym)>0.12 ? 'High' : 'Moderate', note: swaraNote },
    band_powers: { relative: bp },
    eeg_spectrum: bp,
    alpha_asymmetry: asym,
    // DO NOT TOUCH note above applies to alpha_asymmetry (drives the swara
    // display/asym-thumb, deliberately the jittered value) — `faa` is a
    // separate field carrying the REAL per-channel asymmetry already used
    // for the actual guna/vritti math above, kept distinct so epoch export
    // gets accurate data without changing anything about the swara display.
    faa,
    connectivity: { plv },
    tattva_flags: tattva,
    contemplative_depth: depth,
    gunas,
    vritti_index: vritti,
    nirodha_state: nirodhaState,
  };
}

// ── Demo mode ─────────────────────────────────────────────────────────────────
// All 5 Chitta Bhumis (v2 adds Mudha). Cycle through them in demo.
const DEMO_STATES = ['Kshipta','Vikshipta','Ekagra','Niruddha'];
const DEMO_SWARA = [
  'Ida (Parasympathetic / Lunar)',
  'Pingala (Sympathetic / Solar)',
  'Sushumna (Balanced / Central)',
];
// Band powers aligned with paper's exact EEG signatures (see data_generator.py)
// high_beta (18-30 Hz) is the PRIMARY Rajas marker — shown separately from low_beta.
const DEMO_BANDS = {
  Mudha:    { delta:0.44, theta:0.17, alpha:0.07, low_beta:0.15, high_beta:0.10, gamma:0.04, beta:0.25 },
  Kshipta:  { delta:0.09, theta:0.12, alpha:0.12, low_beta:0.22, high_beta:0.33, gamma:0.10, beta:0.55 },
  Vikshipta:{ delta:0.14, theta:0.17, alpha:0.26, low_beta:0.21, high_beta:0.14, gamma:0.08, beta:0.35 },
  Ekagra:   { delta:0.08, theta:0.29, alpha:0.37, low_beta:0.12, high_beta:0.07, gamma:0.07, beta:0.19 },
  Niruddha: { delta:0.05, theta:0.18, alpha:0.30, low_beta:0.10, high_beta:0.05, gamma:0.32, beta:0.15 },
};
// Approximate gunas from paper's specifications for each state (for demo accuracy)
const DEMO_GUNAS = {
  Mudha:    { sattva:0.20, rajas:0.15, tamas:0.65, label:'Tamasic',  note:'Tamas predominates — heaviness and dullness. Stimulating pranayama recommended.' },
  Kshipta:  { sattva:0.12, rajas:0.73, tamas:0.15, label:'Rajasic',  note:'Rajas predominates — high-beta desynchronization, prefrontal hyperarousal.' },
  Vikshipta:{ sattva:0.52, rajas:0.32, tamas:0.16, label:'Balanced', note:'The three Gunas are in relative equilibrium — a balanced, transitional state.' },
  Ekagra:   { sattva:0.78, rajas:0.12, tamas:0.10, label:'Sattvic',  note:'Sattva predominates — alpha synchrony and Fm-θ. Optimal for contemplative practice.' },
  Niruddha: { sattva:0.88, rajas:0.07, tamas:0.05, label:'Sattvic',  note:'Deep Sattva — global gamma coherence. Gunatita: beyond the three Gunas.' },
};

// Deep-state features per bhūmi for demo mode — values mirror the backend golden
// fixtures so the demo behaves like the real model (see generate_golden.py).
const DEMO_TEXTURE = {
  Mudha:    { vritti:0.24, complexity:{ lziv:0.14, higuchi_fd:1.05, sample_entropy:0.21, perm_entropy:0.61 }, aperiodic:{ exponent:3.42, offset:3.3 } },
  Kshipta:  { vritti:0.69, complexity:{ lziv:0.43, higuchi_fd:1.88, sample_entropy:0.52, perm_entropy:0.73 }, aperiodic:{ exponent:1.16, offset:0.95 } },
  Vikshipta:{ vritti:0.26, complexity:{ lziv:0.38, higuchi_fd:1.30, sample_entropy:0.45, perm_entropy:0.66 }, aperiodic:{ exponent:2.30, offset:2.1 } },
  Ekagra:   { vritti:0.07, complexity:{ lziv:0.35, higuchi_fd:1.10, sample_entropy:0.49, perm_entropy:0.57 }, aperiodic:{ exponent:3.22, offset:3.27 } },
  Niruddha: { vritti:0.00, complexity:{ lziv:0.50, higuchi_fd:1.72, sample_entropy:0.94, perm_entropy:0.85 }, aperiodic:{ exponent:1.36, offset:1.16 } },
};

// Signed-corroboration fixtures per bhūmi for demo mode — hand-authored to match
// what the backend `corroborate` produces on the DEMO_TEXTURE values above, so
// clicking ▶ Demo shows a representative "WHAT THE SIGNALS SAY" card with no
// backend or headband. (Live/Bluetooth+backend paths get the real thing.)
const DEMO_CORROB = {
  Mudha: { concord:'corroborated', indeterminate:false, caveat:'', axes:[
    { axis:'neural_complexity', reading:'low richness (0.23)', agrees:true, note:'low complexity is consistent with tāmasic dullness' },
    { axis:'cortical_quietude', reading:'steep 1/f slope (exponent 3.42)', agrees:true, note:'steep 1/f fits low-arousal heaviness' },
    { axis:'mental_chatter', reading:'moderate vṛtti (0.24)', agrees:null, note:'' },
  ]},
  Kshipta: { concord:'corroborated', indeterminate:false, caveat:'', axes:[
    { axis:'neural_complexity', reading:'moderate richness (0.58)', agrees:null, note:'' },
    { axis:'cortical_quietude', reading:'moderate 1/f slope (exponent 1.16)', agrees:null, note:'' },
    { axis:'mental_chatter', reading:'high vṛtti (0.69)', agrees:true, note:'elevated high-β chatter fits Kṣipta' },
  ]},
  Vikshipta: { concord:'corroborated', indeterminate:false, caveat:'', axes:[
    { axis:'neural_complexity', reading:'moderate richness (0.39)', agrees:true, note:'mid-range complexity fits an oscillating mind' },
    { axis:'cortical_quietude', reading:'steep 1/f slope (exponent 2.30)', agrees:null, note:'' },
    { axis:'mental_chatter', reading:'moderate vṛtti (0.26)', agrees:true, note:'some restlessness fits an oscillating mind' },
  ]},
  Ekagra: { concord:'corroborated', indeterminate:false, caveat:'', axes:[
    { axis:'neural_complexity', reading:'high richness (0.63)', agrees:true, note:'retained complexity — genuine stillness, not drowsiness' },
    { axis:'cortical_quietude', reading:'steep 1/f slope (exponent 3.22)', agrees:true, note:'steep 1/f — a quiet, inhibition-weighted cortex' },
    { axis:'mental_chatter', reading:'low vṛtti (0.07)', agrees:true, note:'stilled fluctuations — citta-vṛtti-nirodha' },
    { axis:'absorption_signature', reading:'present', agrees:true, note:'Fm-θ + α synchrony — the focused-attention absorption signature' },
    { axis:'effortlessness', reading:'effortless', agrees:true, note:'effortless — the flow-like signature of dhyāna, not strained holding' },
  ]},
  Niruddha: { concord:'corroborated', indeterminate:false, caveat:'', axes:[
    { axis:'neural_complexity', reading:'high richness (0.68)', agrees:true, note:'retained complexity — genuine stillness, not drowsiness' },
    { axis:'cortical_quietude', reading:'moderate 1/f slope (exponent 1.36)', agrees:null, note:'' },
    { axis:'mental_chatter', reading:'low vṛtti (0.00)', agrees:true, note:'stilled fluctuations — citta-vṛtti-nirodha' },
    { axis:'effortlessness', reading:'effortless', agrees:true, note:'effortless — the flow-like signature of dhyāna, not strained holding' },
  ]},
};

$('btn-demo').addEventListener('click', () => {
  if (mode === 'demo') {
    clearInterval(demoTimer); demoTimer = null;
    mode = 'idle'; setStatus('', t('disconnected'));
    $('btn-demo').textContent = t('demoLabel');
    return;
  }
  if (mode === 'bluetooth') disconnectBluetooth();
  mode = 'demo';
  resetSmoothing();
  setStatus('demo', t('statusDemoMode'));
  $('btn-demo').textContent = t('stopDemoLabel');

  const ALL_DEMO_STATES = ['Mudha','Kshipta','Vikshipta','Ekagra','Niruddha'];
  const runDemo = () => {
    demoEpoch++;
    const state = ALL_DEMO_STATES[demoStateIdx % ALL_DEMO_STATES.length];
    const swara = DEMO_SWARA[demoSwaraIdx % DEMO_SWARA.length];
    const bp = { ...DEMO_BANDS[state] };

    // Add realistic jitter to band powers
    Object.keys(bp).forEach(k => { bp[k] = Math.max(0.01, bp[k] + (Math.random()-0.5)*0.03); });

    const faa = swara.includes('Ida') ? -(0.15+Math.random()*0.25)
      : swara.includes('Pingala') ? (0.15+Math.random()*0.25)
      : (Math.random()-0.5)*0.10;
    const isIda = faa < -0.15, isPingala = faa > 0.15;

    // Build probabilities using paper's scoring logic (simplified)
    const rawScores = {
      Mudha:    Math.max(0, bp.delta - 0.30) * 3.0 + Math.max(0, 0.10 - bp.alpha) * 2.0,
      Kshipta:  Math.max(0, bp.high_beta - 0.15) * 4.0 + Math.max(0, 0.15 - bp.alpha) * 2.0,
      Vikshipta:Math.max(0, bp.alpha - 0.10) * 2.0 + 0.8,
      Ekagra:   Math.max(0, bp.theta - 0.20) * 3.0 + Math.max(0, bp.alpha - 0.25) * 3.0,
      Niruddha: Math.max(0, bp.gamma - 0.15) * 4.0,
    };
    const scoreTotal = Object.values(rawScores).reduce((a,b) => a+b, 1e-6);
    const probs = {};
    ALL_DEMO_STATES.forEach(s => { probs[s] = rawScores[s] / scoreTotal; });
    // Bias winner toward current state
    probs[state] = Math.max(probs[state], 0.45);
    const biasTotal = Object.values(probs).reduce((a,b) => a+b, 0);
    ALL_DEMO_STATES.forEach(s => { probs[s] /= biasTotal; });

    const tattva = [];
    if (bp.alpha > 0.35 && bp.high_beta < 0.10) tattva.push('Pratyahara Window');
    if (bp.theta  > 0.28) tattva.push('Fm-θ Activation (Frontal Midline Theta)');
    if (bp.gamma  > 0.15) tattva.push('Gamma Surge — Ajna/Sahasrara activation');
    if (bp.delta  > 0.40 && bp.alpha < 0.10) tattva.push('Tamasic State — Kapalabhati recommended');
    if (bp.high_beta > 0.30) tattva.push('High-Beta Agitation — Nadi Shodhana recommended');

    epoch++;
    const depth = CHITTA_DEPTHS[state];
    const gunas = { ...DEMO_GUNAS[state] };
    const swaraKey = isIda ? 'ida' : isPingala ? 'pingala' : 'sushumna';
    const tex = DEMO_TEXTURE[state] || DEMO_TEXTURE.Vikshipta;
    const vritti = clamp01(tex.vritti + (Math.random() - 0.5) * 0.05);
    const r = {
      epoch, latency_ms: 18 + Math.random() * 8,
      data_quality: '✓ demo',
      chitta_bhumi: { state, depth, confidence: probs[state].toFixed(3), probabilities: probs, corroboration: DEMO_CORROB[state] },
      swara: {
        state:      swara,
        confidence: 'Moderate',
        note:       SWARA_NOTES[swaraKey],
      },
      band_powers:  { relative: bp },
      eeg_spectrum: bp,
      alpha_asymmetry: faa,
      faa,
      tattva_flags: tattva,
      contemplative_depth: depth,
      gunas,
      // Deep-state features (v3) — so the INNER TEXTURE gauges animate in demo.
      vritti_index:  vritti,
      nirodha_state: nirodhaLabel(vritti),
      complexity:    tex.complexity,
      aperiodic:     tex.aperiodic,
      blood_oxygen: +(96 + Math.random() * 3).toFixed(1),
      heart_rate:   Math.round(60 + Math.random() * 25),
    };
    applyReading(smoothReading(r));
    storeEpochToSession(r);
    if (demoEpoch % 3 === 0) demoStateIdx++;
    if (demoEpoch % 7 === 0) demoSwaraIdx++;
  };

  runDemo();
  demoTimer = setInterval(runDemo, DEMO_INTERVAL);
});

// ── Bluetooth mode ────────────────────────────────────────────────────────────
$('btn-bluetooth').addEventListener('click', () => {
  if (mode === 'bluetooth') {
    disconnectBluetooth();
  } else {
    connectBluetooth();
  }
});

// ── Headband drivers ──────────────────────────────────────────────────────────
// Each driver isolates ONE headband's BLE quirks (service/characteristic UUIDs,
// start handshake, packet→µV decoding, sample rate). Everything downstream only
// ever sees normalised µV samples via ctx.pushSamples(channelIndex, µV[]), so the
// entire analyse/render/store pipeline is device-agnostic. To support a new
// headband, add a driver object to DRIVERS — nothing else needs to change.

// Generic device-battery readout — drivers call this via ctx.reportBattery(pct).
function updateBattery(pct) {
  const tile = $('metric-battery');
  const val = $('val-battery');
  if (pct == null || Number.isNaN(pct)) {
    if (tile) tile.style.display = 'none';
    return;
  }
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (val) val.textContent = p + '%';
  if (tile) tile.style.display = '';
}

// Show the HR/SpO2 vitals cards only when the connected driver streams PPG.
// The HR/SpO2 cards are always visible (index.html — no display:none), even
// before a headband is ever connected. What's gated on real data is the
// VALUE inside each card (applyReading below): "—" / "awaiting signal" until
// a real reading exists, a real number once one does. Kept as a no-op (rather
// than deleting) so its call sites don't need touching.
function updateVitalsVisibility(driver) {}

// Generic sink: all drivers funnel decoded µV samples through here.
function pushSamples(ch, samples) {
  if (!bleChannels[ch]) return;
  bleChannels[ch].push(...samples);
  bleSamTick += samples.length;

  // Each channel is pushed to independently as its own BLE notifications
  // arrive, so channels don't necessarily fill at the same rate. Gate on the
  // SLOWEST channel (not just channel 0) — triggering as soon as channel 0
  // alone reached COLLECT_N let processBluetoothEEG() snapshot the other
  // channels while they were still short, producing mismatched channel
  // lengths that the backend correctly rejects with a 400.
  const minLen = Math.min(...bleChannels.map(c => c.length));
  const buf = Math.min(minLen, COLLECT_N);
  const bufEl = $('val-buffer');
  if (bufEl) bufEl.textContent = buf + ' / ' + COLLECT_N;

  if (minLen >= COLLECT_N) processBluetoothEEG();
}

const MuseDriver = {
  id: 'muse',
  name: 'Muse',
  sampleRate: 256,
  channelCount: 4,
  hasPPG: true,  // Muse S streams PPG → heart-rate + SpO2 vitals

  // Advertised by the scan filter and identifies the device after connect.
  filters: [{ services: [MUSE_SERVICE_UUID] }],
  optionalServices: [MUSE_SERVICE_UUID],
  async isMatch(server) {
    return server.getPrimaryService(MUSE_SERVICE_UUID).then(() => true).catch(() => false);
  },
  async start(server, ctx) {
    const service = await server.getPrimaryService(MUSE_SERVICE_UUID);

    const controlChar = await service.getCharacteristic(MUSE_CONTROL_UUID).catch(() => null);
    if (controlChar) {
      // CRITICAL: Muse protocol requires a 1-byte length prefix before every command.
      // Without the prefix the headband silently ignores the command and never streams EEG.
      const museCmd = (s) => {
        const payload = new TextEncoder().encode(s + '\n');
        const buf = new Uint8Array(payload.length + 1);
        buf[0] = payload.length; // length prefix byte — this is mandatory
        buf.set(payload, 1);
        return buf;
      };
      // Preset 21 is EEG-only and never turns the optical (PPG) sensors on —
      // confirmed against the reference muse-js implementation (urish/muse-js
      // src/muse.ts): preset 50 is the one that enables EEG + PPG together.
      // p21 was why heart rate/SpO2 never streamed even though the PPG
      // characteristics were subscribed below. Also matches muse-js's exact
      // command sequence: halt -> preset -> 's' -> resume (the 's' write was
      // previously missing here).
      await controlChar.writeValue(museCmd('h'));    // halt any prior streaming
      await new Promise(r => setTimeout(r, 300));
      await controlChar.writeValue(museCmd('p50'));  // preset 50 = EEG + PPG
      await new Promise(r => setTimeout(r, 150));
      await controlChar.writeValue(museCmd('s'));    // apply preset
      await new Promise(r => setTimeout(r, 150));
      await controlChar.writeValue(museCmd('d'));    // start streaming
      await new Promise(r => setTimeout(r, 500));    // let stream initialise before subscribing
    }

    for (let c = 0; c < MUSE_EEG_UUIDS.length; c++) {
      const char = await service.getCharacteristic(MUSE_EEG_UUIDS[c]).catch(() => null);
      if (!char) continue;
      await char.startNotifications();
      const ch = c;
      char.addEventListener('characteristicvaluechanged', ev => {
        const data = ev.target.value;
        const samples = [];
        // Safe loop — always leaves 2 bytes to read (i and i+1).
        for (let i = 2; i + 1 < data.byteLength; i += 2) {
          // Raw int16 → microvolts (Muse scale: 0.48828125 µV/LSB).
          samples.push(data.getInt16(i, false) * 0.48828125e-6);
        }
        ctx.pushSamples(ch, samples);
      });
    }

    // Muse S PPG subscription for heart rate + SpO2 (absent on plain Muse — best effort).
    for (const [key, uuid] of Object.entries(MUSE_PPG_UUIDS)) {
      const ppgChar = await service.getCharacteristic(uuid).catch(() => null);
      if (!ppgChar) continue;
      await ppgChar.startNotifications();
      ppgChar.addEventListener('characteristicvaluechanged', ev => onMusePPG(ev, key));
    }
  },
};

const BrainBitDriver = {
  id: 'brainbit',
  name: 'BrainBit',
  sampleRate: 250,
  channelCount: 4,
  hasPPG: false, // EEG only — no optical pulse sensor, so no HR/SpO2

  // BrainBit does not reliably advertise its service UUID, so scan by name.
  filters: [{ namePrefix: 'BrainBit' }],
  optionalServices: [BRAINBIT_SERVICE_UUID],
  async isMatch(server) {
    return server.getPrimaryService(BRAINBIT_SERVICE_UUID).then(() => true).catch(() => false);
  },
  async start(server, ctx) {
    const service = await server.getPrimaryService(BRAINBIT_SERVICE_UUID);

    // Subscribe to the signal (EEG) characteristic BEFORE starting the stream.
    const signalChar = await service.getCharacteristic(BRAINBIT_SIGNAL_UUID);
    await signalChar.startNotifications();
    signalChar.addEventListener('characteristicvaluechanged', ev => {
      const b = new Uint8Array(ev.target.value.buffer);
      if (b.length < 20) return; // each signal packet is 20 bytes → 4 ch × 2 samples
      const m = BRAINBIT_SIGNAL_MULT;
      // Sample 0 of each channel: a 20-bit value, bit-packed and left-aligned into
      // a signed 32-bit int so JS's signed << sign-extends it, then /2048.
      const v0 = (((b[1] & 0x0F) << 28) | (b[2] << 20) | (b[3] << 12) | (b[4] << 4)) / 2048;
      const v1 = (((b[4] & 0x7F) << 25) | (b[5] << 17) | (b[6] << 9)  | (b[7] << 1)) / 2048;
      const v2 = (((b[6] & 0x03) << 30) | (b[7] << 22) | (b[8] << 14) | (b[9] << 6)) / 2048;
      const v3 = (((b[9] & 0x1F) << 27) | (b[10] << 19) | (b[11] << 11)) / 2048;
      // Sample 1 of each channel: a 16-bit signed delta added to sample 0.
      const d0 = ((b[12] << 24) | (b[13] << 16)) / 65536 + v0;
      const d1 = ((b[14] << 24) | (b[15] << 16)) / 65536 + v1;
      const d2 = ((b[16] << 24) | (b[17] << 16)) / 65536 + v2;
      const d3 = ((b[18] << 24) | (b[19] << 16)) / 65536 + v3;
      // Push ch0 LAST so the COLLECT_N trigger never fires with ch1–3 still short.
      ctx.pushSamples(1, [v1 * m, d1 * m]);
      ctx.pushSamples(2, [v2 * m, d2 * m]);
      ctx.pushSamples(3, [v3 * m, d3 * m]);
      ctx.pushSamples(0, [v0 * m, d0 * m]);
    });

    // Status characteristic: battery % lives in byte[2] (value >> 1 = percent).
    const statusChar = await service.getCharacteristic(BRAINBIT_STATUS_UUID).catch(() => null);
    if (statusChar) {
      const readBattery = dv => {
        if (dv && dv.byteLength > 2 && ctx.reportBattery) ctx.reportBattery(dv.getUint8(2) >> 1);
      };
      await statusChar.startNotifications().catch(() => {});
      statusChar.addEventListener('characteristicvaluechanged', ev => readBattery(ev.target.value));
      readBattery(await statusChar.readValue().catch(() => null)); // seed immediately
    }

    // Command characteristic: halt anything prior, then start signal streaming.
    const commandChar = await service.getCharacteristic(BRAINBIT_COMMAND_UUID);
    await commandChar.writeValue(BRAINBIT_CMD_STOP);
    await new Promise(r => setTimeout(r, 200));
    await commandChar.writeValue(BRAINBIT_CMD_SIGNAL);
  },
};

// Registry of supported headbands. Add a driver here to support a new device —
// the generic connect/consume pipeline needs nothing else.
const DRIVERS = [MuseDriver, BrainBitDriver];

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    alert(t('webBluetoothUnavailable'));
    return;
  }
  try {
    // Offer every supported headband in one scan.
    const filters = DRIVERS.flatMap(d => d.filters);
    const optionalServices = [...new Set(DRIVERS.flatMap(d => d.optionalServices))];
    const device = await navigator.bluetooth.requestDevice({ filters, optionalServices });
    btDevice = device;
    device.addEventListener('gattserverdisconnected', onBtDisconnected);

    // gatt.connect() is flaky on Windows ("Connection attempt failed") and often
    // succeeds on a retry — attempt up to 4 times with a short backoff.
    let server = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        setStatus('bluetooth', t('statusConnecting') + ' (' + attempt + '/4)');
        server = await device.gatt.connect();
        break;
      } catch (e) {
        if (attempt === 4) throw e;
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Identify which driver owns the connected device.
    let driver = null;
    for (const d of DRIVERS) {
      if (await d.isMatch(server)) { driver = d; break; }
    }
    if (!driver) throw new Error(t('noCompatibleDriver'));

    activeDriver = driver;
    activeSampleRate = driver.sampleRate;
    updateVitalsVisibility(driver); // HR/SpO2 only for PPG-capable devices
    // Size the channel buffers for this device.
    bleChannels.length = 0;
    for (let i = 0; i < driver.channelCount; i++) bleChannels.push([]);
    ppgBuf.ambient.length = 0; ppgBuf.ir.length = 0; ppgBuf.red.length = 0;
    latestHeartRate = null; latestSpO2 = null; resetPpgSmoothing();

    await driver.start(server, { pushSamples, reportBattery: updateBattery });

    btDisconnect = () => { if (device.gatt.connected) device.gatt.disconnect(); };

    // Stop backend URL polling — BT mode handles data directly.
    if (backendPollTimer) { clearInterval(backendPollTimer); backendPollTimer = null; }
    mode = 'bluetooth';
    resetSmoothing();
    setStatus('bluetooth', driver.name + ' ' + t('statusConnected'));
    $('btn-bluetooth').classList.add('bt-active');
    $('bt-device-name').textContent = device.name || (driver.name + ' device');
    $('bt-device-row').style.display = '';
    $('val-buffer').textContent = '0 / ' + COLLECT_N;
  } catch (err) {
    if (!err.message?.includes('cancelled')) {
      console.warn('BT connect failed:', err.message);
      setStatus('error', t('statusBluetoothFailed') + ': ' + err.message);
    }
  }
}

async function processBluetoothEEG() {
  const snapshot = bleChannels.map(ch => {
    const s = ch.slice(-COLLECT_N);
    ch.length = 0;
    return s;
  });
  const bufEl = $('val-buffer');
  if (bufEl) bufEl.textContent = '0 / ' + COLLECT_N;
  blePhase++;
  const t0 = performance.now();

  if (backendUrl) {
    try {
      const res = await fetch(backendUrl.replace(/\/$/, '') + '/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            eeg_data: snapshot,
            sample_rate: activeSampleRate,
            ...(latestSpO2 !== null     && { blood_oxygen: +latestSpO2.toFixed(1) }),
            ...(latestHeartRate !== null && { heart_rate:  +latestHeartRate.toFixed(1) }),
          }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'HTTP ' + res.status);
      }
      const data = await res.json();
      const latency = (performance.now() - t0).toFixed(1);
      epoch++;
      const r = {
        epoch, latency_ms: parseFloat(latency),
        data_quality: '✓ BLE → Render',
        timestamp: new Date().toISOString().slice(11,22) + ' UTC',
        chitta_bhumi: {
          state: data.chitta_bhumi?.state || '—',
          depth: data.chitta_bhumi?.depth || data.depth || '—',
          confidence: data.chitta_bhumi?.confidence || '—',
          probabilities: data.chitta_bhumi?.probabilities || {},
          // "WHAT THE SIGNALS SAY" — the backend always sends this, but it was
          // dropped here, so it only ever showed in Demo mode (hand-authored
          // DEMO_CORROB fixtures), never on a real headband run.
          corroboration: data.chitta_bhumi?.corroboration || null,
        },
        swara: {
          state: data.swara?.state || '—',
          confidence: data.swara?.confidence || '—',
          // Use backend note, fall back to our SWARA_NOTES lookup
          note: data.swara?.note || SWARA_NOTES[(data.swara?.state||'').toLowerCase().split(' ')[0]] || '',
        },
        // Backend may return tattva_flags or tattva; check both
        tattva_flags: data.tattva_flags || data.tattva || [],
        contemplative_depth: data.chitta_bhumi?.depth || data.depth || '—',
        // Use hemispheric asymmetry from backend if available
        alpha_asymmetry: data.hemispheric_asymmetry?.asymmetry ?? data.alpha_asymmetry ?? 0,
        faa: data.hemispheric_asymmetry?.asymmetry ?? data.alpha_asymmetry ?? null,
        // Backend returns eeg_spectrum or band_relative
        eeg_spectrum: data.eeg_spectrum || data.band_relative || null,
        gunas: data.gunas || null,
        // Deep-state features (v3) — rendered as plain-language gauges.
        vritti_index: data.vritti_index ?? null,
        nirodha_state: data.nirodha_state || null,
        complexity: data.complexity || null,
        aperiodic: data.aperiodic || null,
        connectivity: data.connectivity || null,
        blood_oxygen: data.blood_oxygen ?? null,
        heart_rate: data.heart_rate ?? null,
      };
      applyReading(smoothReading(r));
      storeEpochToSession(r);
      return;
    } catch (err) {
      console.warn('Backend /analyze failed, falling back to local FFT:', err.message);
    }
  }

  // Local FFT fallback — per-channel bands so FAA/PLV/Gunas aren't guesswork.
  // Previously only channel 0 was used and FAA was `Math.random()`, which made
  // Swara and every guna/vṛtti figure derived from it meaningless noise.
  const chBp = [];
  for (let c = 0; c < snapshot.length; c++) {
    const sig = snapshot[c] || [];
    if (sig.length < 64) continue;
    const sz = Math.pow(2, Math.floor(Math.log2(sig.length)));
    chBp.push({ ch: c, bp: bandPowers(fft(sig.slice(-sz)), activeSampleRate, sz) });
  }
  if (!chBp.length) return;

  // Whole-head average band powers (same convention as the .NET analyser).
  const bp = {};
  for (const k of ['delta','theta','alpha','low_beta','high_beta','beta','gamma']) {
    bp[k] = chBp.reduce((s, x) => s + x.bp[k], 0) / chBp.length;
  }

  // Left = channels 0,1 (TP9,AF7); Right = channels 2,3 (AF8,TP10) — same
  // hemisphere assignment as the analyser's FeatureExtractor default indices.
  const leftCh = chBp.filter(x => x.ch < 2), rightCh = chBp.filter(x => x.ch >= 2);
  const leftAlpha = leftCh.length ? leftCh.reduce((s,x) => s+x.bp.alpha, 0) / leftCh.length : bp.alpha;
  const rightAlpha = rightCh.length ? rightCh.reduce((s,x) => s+x.bp.alpha, 0) / rightCh.length : bp.alpha;
  const faa = Math.max(-2, Math.min(2, Math.log(rightAlpha + 1e-9) - Math.log(leftAlpha + 1e-9)));

  // PLV proxy: |correlation| between a left- and a right-hemisphere channel's raw
  // signal — not a true Hilbert-phase PLV (that always comes from the analyser),
  // but a reasonable coherence stand-in for this degraded fallback path.
  const plv = snapshot.length >= 3
    ? Math.max(0, Math.min(1, Math.abs(pearsonCorr(snapshot[0], snapshot[2]))))
    : 0.5;

  const r = classifyLocal(bp, faa, plv);
  r.latency_ms = parseFloat((performance.now() - t0).toFixed(1));
  applyReading(smoothReading(r));
  storeEpochToSession(r);
}

function disconnectBluetooth() {
  if (btDisconnect) { btDisconnect(); btDisconnect = null; }
  btDevice = null;
  activeDriver = null;
  activeSampleRate = SAMPLE_RATE;
  updateBattery(null); // hide the battery tile
  updateVitalsVisibility(null); // hide HR/SpO2 cards
  const btRow = $('bt-device-row');
  if (btRow) btRow.style.display = 'none';
  bleChannels.forEach(ch => { ch.length = 0; });
  ppgBuf.ambient.length = 0; ppgBuf.ir.length = 0; ppgBuf.red.length = 0;
  latestHeartRate = null; latestSpO2 = null; resetPpgSmoothing();
  mode = 'idle';
  setStatus('', t('disconnected'));
  $('btn-bluetooth').classList.remove('bt-active');
  const bufEl = $('val-buffer');
  if (bufEl) bufEl.textContent = '0 / ' + COLLECT_N;
}

function onBtDisconnected() {
  if (mode === 'bluetooth') disconnectBluetooth();
}

// ── Muse S PPG processing (heart rate + SpO2) ─────────────────────────────────
// Forehead PPG (no chest strap, no clip) is inherently noisier than a
// dedicated pulse oximeter — any head movement, jaw tension, or imperfect
// skin contact shows up as artifact. That's a real hardware/placement limit
// we can't fully engineer around. But the previous pipeline made it worse:
// it recomputed on every single BLE notification (many times/second) from a
// sliding window with no outlier rejection and no temporal smoothing, so one
// spurious noise-peak could swing the reading by 50+ BPM between frames. The
// fixes below (detrend, outlier-reject RR intervals, EMA smoothing, throttled
// recompute) don't require better hardware — they make the estimate honest
// about what a noisy signal actually supports.
let hrEma = null, spo2Ema = null, lastPpgComputeAt = 0;
let lastValidHrAt = 0, lastValidSpo2At = 0;
const PPG_RECOMPUTE_MS = 1000;  // real HR doesn't need updating faster than 1/s
// If nothing's been confirmed in this long, the number on screen is no
// longer "live" — but per explicit feedback, don't blank it out either
// (that read as flicker); keep showing the last known value and just change
// the status label so it's honest about being a last-known reading, not a
// fresh one.
const PPG_STALE_MS = 8000;

function resetPpgSmoothing() {
  hrEma = null; spo2Ema = null; lastPpgComputeAt = 0;
  lastValidHrAt = 0; lastValidSpo2At = 0;
}
function isHrStale()   { return hrEma == null   || performance.now() - lastValidHrAt   > PPG_STALE_MS; }
function isSpo2Stale() { return spo2Ema == null || performance.now() - lastValidSpo2At > PPG_STALE_MS; }

// Diagnostic logging for computeHeartRate() internals (peak count, RR
// intervals, autocorrelation score, and whether the harmonic-doubling
// correction below fired). Off by default so normal use stays quiet; flip
// to true here and redeploy if a real-hardware mismatch needs diagnosing.
const HR_DEBUG = false;

function onMusePPG(ev, channel) {
  const data = ev.target.value;
  // Muse PPG: 2-byte header + 6 samples × 3 bytes uint24 big-endian
  const buf = ppgBuf[channel];
  for (let i = 2; i + 2 < data.byteLength; i += 3) {
    buf.push((data.getUint8(i) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i + 2));
  }
  if (buf.length > PPG_WINDOW_SAMPLES) buf.splice(0, buf.length - PPG_WINDOW_SAMPLES);

  const now = performance.now();
  if (channel === 'ir' && buf.length >= PPG_WINDOW_SAMPLES && now - lastPpgComputeAt >= PPG_RECOMPUTE_MS) {
    lastPpgComputeAt = now;
    const rawHr = HR_DEBUG ? computeHeartRateDebug(ppgBuf.ir) : computeHeartRate(ppgBuf.ir);
    if (rawHr != null) {
      hrEma = hrEma == null ? rawHr : hrEma + 0.3 * (rawHr - hrEma);
      lastValidHrAt = now;
    }
    latestHeartRate = hrEma;

    if (ppgBuf.red.length >= PPG_WINDOW_SAMPLES) {
      const rawSpo2 = computeSpO2(ppgBuf.ir, ppgBuf.red);
      if (rawSpo2 != null) {
        spo2Ema = spo2Ema == null ? rawSpo2 : spo2Ema + 0.3 * (rawSpo2 - spo2Ema);
        lastValidSpo2At = now;
      }
      latestSpO2 = spo2Ema;
    }

    const hrEl = $('val-hr'), spo2El = $('val-spo2');
    const hrSt = $('hr-status'), spo2St = $('spo2-status');
    if (hrEl)  { hrEl.textContent  = latestHeartRate != null ? localizeNumber(latestHeartRate.toFixed(0)) : '—'; if (hrSt)  hrSt.textContent  = latestHeartRate == null ? t('awaitingSignal') : (isHrStale()   ? t('lastKnownReading') : t('liveReading')); }
    if (spo2El){ spo2El.textContent = latestSpO2 != null      ? localizeNumber(latestSpO2.toFixed(1))      : '—'; if (spo2St) spo2St.textContent = latestSpO2 == null      ? t('awaitingSignal') : (isSpo2Stale() ? t('lastKnownReading') : t('liveReading')); }
  }
}

// Real Muse S captures (via HR_DEBUG logging) showed the dicrotic notch
// sometimes registering as its own peak strongly enough to survive
// threshold+refractory detection — not on every cycle (amplitude varies too
// much cycle-to-cycle for a clean, always-present split), but often enough
// within an 8s window that the resulting RR-interval list becomes bimodal:
// a cluster near the true beat-to-beat interval, and a cluster near half of
// it (beat-to-notch / notch-to-beat). When the notch-driven cluster happens
// to be the majority (or ties), the plain median vote in computeHeartRate
// picks the WRONG (fast) cluster, reporting ~2x the true rate. Detect that
// bimodal ~2x pattern directly and prefer the slower cluster — a real
// dicrotic notch cannot occur more often than the heartbeat it's part of, so
// the longer interval is always the physiologically correct one to trust.
//
// Tuned and validated against 9 RR sequences captured live from a real
// device during an actual bad episode (see scratchpad/hr_test/real_data_v5.js):
// 0 false positives across every accurately-reported window, and an exact
// fix on the cleanest reproduction (raw 137.1bpm -> corrected 78.4bpm,
// matching the reference device's ~80bpm). Deliberately conservative — the
// minimum-cluster-size requirement means it won't catch every messy window
// (some have extra contaminating outliers, likely missed-beat artifacts,
// that break a clean 2-cluster split), but it never overrides an
// already-correct reading.
function detectHarmonicDoubling(rrs) {
  if (rrs.length < 6) return null;
  const sortedAll = [...rrs].sort((a, b) => a - b);
  const med = sortedAll[Math.floor(sortedAll.length / 2)];
  // Strip extreme single-interval outliers (e.g. one missed-beat gap) before
  // clustering — they're unrelated to the notch/beat alternation and would
  // otherwise contaminate the split search.
  const cleaned = rrs.filter(rr => rr <= med * 2.0);
  if (cleaned.length < 6) return null;

  const sorted = [...cleaned].sort((a, b) => a - b);
  const minN = Math.max(4, Math.ceil(0.35 * cleaned.length));
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const cv = (arr, m) => Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) / m;

  let best = null;
  for (let i = minN; i <= sorted.length - minN; i++) {
    const lowCluster = sorted.slice(0, i), highCluster = sorted.slice(i);
    const lowMean = mean(lowCluster), highMean = mean(highCluster);
    const ratio = highMean / lowMean;
    if (ratio < 1.6 || ratio > 2.4) continue; // not a clean ~2x split
    const lowCv = cv(lowCluster, lowMean), highCv = cv(highCluster, highMean);
    if (lowCv > 0.25 || highCv > 0.25) continue; // clusters too noisy to trust
    const combinedCv = (lowCv * lowCluster.length + highCv * highCluster.length) / (lowCluster.length + highCluster.length);
    if (!best || combinedCv < best.combinedCv) {
      best = { period: highMean, lowMean, highMean, lowN: lowCluster.length, highN: highCluster.length, combinedCv };
    }
  }
  return best;
}

/** BPM from PPG IR: detrend -> smooth -> peak-detect -> outlier-reject RR intervals. */
function computeHeartRate(signal) {
  if (signal.length < PPG_SAMPLE_RATE * 2) return null;

  // Detrend against a ~1s moving-average baseline instead of one global mean
  // over the whole 8s window — removes slow drift (breathing, slight movement)
  // that a single mean can't track.
  const baseWin = PPG_SAMPLE_RATE;
  const ac = new Array(signal.length);
  let baseSum = 0;
  for (let i = 0; i < signal.length; i++) {
    baseSum += signal[i];
    if (i >= baseWin) baseSum -= signal[i - baseWin];
    const baseline = baseSum / Math.min(i + 1, baseWin);
    ac[i] = signal[i] - baseline;
  }
  // Light smoothing to knock down high-frequency noise before peak-picking.
  const sm = new Array(ac.length);
  for (let i = 0; i < ac.length; i++) {
    const lo = Math.max(0, i - 1), hi = Math.min(ac.length - 1, i + 1);
    sm[i] = (ac[lo] + ac[i] + ac[hi]) / 3;
  }

  const std = Math.sqrt(sm.reduce((s, v) => s + v * v, 0) / sm.length);
  const thr = std * 0.5;
  // Refractory period between accepted peaks — this app is for meditation,
  // not sprints, and capping the search window itself (not just the final
  // result) stops double-counting one true beat as two spurious close peaks.
  // Widened from 0.4s (max ~150bpm) to ~0.44s (max ~137bpm) after real
  // device captures showed the dicrotic notch landing 26-32 samples
  // (400-500ms) after the systolic peak often enough to survive the old,
  // tighter refractory and get counted as its own beat — re-filtering those
  // exact captured peak positions with this wider spacing (before any other
  // correction) took reported rates from ~130-137bpm down to ~63-76bpm
  // against a true rate of ~78-80bpm, with no measurable cost to correctly
  // read windows in the same captures (see scratchpad/hr_test/refractory_resim.js).
  const minDist = Math.round(60 * PPG_SAMPLE_RATE / 137);
  const peaks = []; let lastPeak = -minDist;
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > thr && sm[i] > sm[i - 1] && sm[i] > sm[i + 1] && (i - lastPeak) >= minDist) {
      peaks.push(i); lastPeak = i;
    }
  }
  if (peaks.length < 6) return null; // need >=5 RR intervals before trusting an estimate

  const rrs = peaks.slice(1).map((p, i) => p - peaks[i]);

  // Try the harmonic-doubling correction first — when it fires, a bimodal
  // ~2x split was found and the slower cluster is trusted over the plain
  // median vote (see detectHarmonicDoubling for why). Otherwise fall back to
  // the original median-based outlier rejection.
  let meanRR;
  const doubling = detectHarmonicDoubling(rrs);
  if (doubling) {
    meanRR = doubling.period;
  } else {
    const sortedRr = [...rrs].sort((a, b) => a - b);
    const medianRr = sortedRr[Math.floor(sortedRr.length / 2)];
    // Reject any RR interval more than 25% off the median — one artifact peak
    // shouldn't be able to swing the whole estimate.
    const kept = rrs.filter(rr => Math.abs(rr - medianRr) / medianRr <= 0.25);
    if (kept.length < 4) return null;

    meanRR = kept.reduce((a, b) => a + b, 0) / kept.length;
    // Periodicity gate: a real pulse is regularly spaced; a noise-driven false
    // trigger (e.g. no skin contact) tends to still be irregular even after
    // outlier-rejection above. Reject if the surviving intervals are still too
    // scattered (coefficient of variation) rather than reporting a number that
    // isn't really a heartbeat.
    const rrStd = Math.sqrt(kept.reduce((s, v) => s + (v - meanRR) ** 2, 0) / kept.length);
    if (rrStd / meanRR > 0.18) return null;
  }

  // Autocorrelation confirmation — the checks above only verify that the
  // greedily-picked peak *gaps* are self-consistent, which is weaker than it
  // looks: once the 0.4s refractory floor forces picks into a narrow band,
  // pure noise satisfies it too. Confirmed empirically (synthetic white-noise
  // PPG windows, no pulse at all): the pre-fix version reported a confident
  // ~120-137 BPM on essentially every trial, because noise has so many local
  // maxima that the refractory spacing alone quantizes them into a
  // deceptively regular ~26-32-sample rhythm. Confirm the candidate period
  // actually corresponds to periodic energy in the signal itself via
  // normalized autocorrelation at lag = meanRR — a real pulse train has
  // strong self-similarity one period later; noise doesn't, regardless of
  // how its greedily-detected peaks happen to space out. (0.45 threshold:
  // 0/100 false positives on synthetic noise, 100% accurate on synthetic
  // clean pulses 45-115bpm and on dicrotic-notch-heavy pulses, while still
  // correctly returning null rather than a fabricated number when the pulse
  // is too weak relative to noise to trust — see scratchpad/hr_test/.)
  const lag = Math.round(meanRR);
  if (lag < 1 || lag >= sm.length) return null;
  let acNum = 0, acDen = 0;
  for (let i = 0; i + lag < sm.length; i++) {
    acNum += sm[i] * sm[i + lag];
    acDen += sm[i] * sm[i];
  }
  if (acDen <= 0 || acNum / acDen < 0.45) return null;

  const hr = (60 * PPG_SAMPLE_RATE) / meanRR;
  return (hr >= 35 && hr <= 160) ? hr : null;
}

/** Verbatim copy of computeHeartRate() with console.log diagnostics at every
 * stage/rejection point — TEMPORARY, for chasing a real-device mismatch that
 * synthetic test signals haven't reproduced. Remove once resolved. */
function computeHeartRateDebug(signal) {
  const tag = '[HR]';
  if (signal.length < PPG_SAMPLE_RATE * 2) { console.log(tag, 'too short:', signal.length); return null; }

  const baseWin = PPG_SAMPLE_RATE;
  const ac = new Array(signal.length);
  let baseSum = 0;
  for (let i = 0; i < signal.length; i++) {
    baseSum += signal[i];
    if (i >= baseWin) baseSum -= signal[i - baseWin];
    const baseline = baseSum / Math.min(i + 1, baseWin);
    ac[i] = signal[i] - baseline;
  }
  const sm = new Array(ac.length);
  for (let i = 0; i < ac.length; i++) {
    const lo = Math.max(0, i - 1), hi = Math.min(ac.length - 1, i + 1);
    sm[i] = (ac[lo] + ac[i] + ac[hi]) / 3;
  }

  const rawMin = Math.min(...signal), rawMax = Math.max(...signal);
  const std = Math.sqrt(sm.reduce((s, v) => s + v * v, 0) / sm.length);
  console.log(tag, `rawRange=[${rawMin},${rawMax}] detrendedStd=${std.toFixed(1)}`);

  const thr = std * 0.5;
  const minDist = Math.round(60 * PPG_SAMPLE_RATE / 137);
  const peaks = []; let lastPeak = -minDist;
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > thr && sm[i] > sm[i - 1] && sm[i] > sm[i + 1] && (i - lastPeak) >= minDist) {
      peaks.push(i); lastPeak = i;
    }
  }
  console.log(tag, `peaks=${peaks.length} positions=[${peaks.join(',')}] heights=[${peaks.map(p => sm[p].toFixed(0)).join(',')}]`);
  if (peaks.length < 6) { console.log(tag, 'REJECT: too few peaks'); return null; }

  const rrs = peaks.slice(1).map((p, i) => p - peaks[i]);
  console.log(tag, `rrs(samples)=[${rrs.join(',')}]`);

  let meanRR;
  const doubling = detectHarmonicDoubling(rrs);
  if (doubling) {
    meanRR = doubling.period;
    console.log(tag, `HARMONIC-DOUBLING CORRECTION: lowMean=${doubling.lowMean.toFixed(1)}(n=${doubling.lowN}) highMean=${doubling.highMean.toFixed(1)}(n=${doubling.highN}) -> using period=${meanRR.toFixed(2)} instead of median vote`);
  } else {
    const sortedRr = [...rrs].sort((a, b) => a - b);
    const medianRr = sortedRr[Math.floor(sortedRr.length / 2)];
    const kept = rrs.filter(rr => Math.abs(rr - medianRr) / medianRr <= 0.25);
    console.log(tag, `median=${medianRr} kept=[${kept.join(',')}]`);
    if (kept.length < 4) { console.log(tag, 'REJECT: too few kept RRs'); return null; }

    meanRR = kept.reduce((a, b) => a + b, 0) / kept.length;
    const rrStd = Math.sqrt(kept.reduce((s, v) => s + (v - meanRR) ** 2, 0) / kept.length);
    const cv = rrStd / meanRR;
    console.log(tag, `meanRR=${meanRR.toFixed(2)}samples cv=${cv.toFixed(3)} -> naiveHr=${(60 * PPG_SAMPLE_RATE / meanRR).toFixed(1)}`);
    if (cv > 0.18) { console.log(tag, 'REJECT: cv too high'); return null; }
  }

  const lag = Math.round(meanRR);
  if (lag < 1 || lag >= sm.length) { console.log(tag, 'REJECT: bad lag', lag); return null; }
  let acNum = 0, acDen = 0;
  for (let i = 0; i + lag < sm.length; i++) {
    acNum += sm[i] * sm[i + lag];
    acDen += sm[i] * sm[i];
  }
  const acScore = acDen > 0 ? acNum / acDen : 0;
  console.log(tag, `autocorrelation@lag${lag}=${acScore.toFixed(3)} (threshold 0.45)`);
  if (acDen <= 0 || acScore < 0.45) { console.log(tag, 'REJECT: autocorrelation too low'); return null; }

  const hr = (60 * PPG_SAMPLE_RATE) / meanRR;
  const finalHr = (hr >= 35 && hr <= 160) ? hr : null;
  console.log(tag, `RESULT: ${finalHr == null ? 'null (out of range ' + hr.toFixed(1) + ')' : finalHr.toFixed(1) + ' bpm'}`);
  return finalHr;
}

/** SpO2 % from red/IR ratio-of-ratios: SpO2 ≈ 110 − 25 × R */
function computeSpO2(ir, red) {
  if (ir.length < 64 || red.length < 64) return null;
  const len = Math.min(ir.length, red.length);
  const irS = ir.slice(-len), redS = red.slice(-len);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const acRms = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const dcIr = mean(irS), dcRed = mean(redS);
  if (dcIr < 1 || dcRed < 1) return null;
  const acIr = acRms(irS), acRed = acRms(redS);
  if (acIr < 1 || acRed < 1) return null;
  const R = (acRed / dcRed) / (acIr / dcIr);
  return Math.min(100, Math.max(85, 110 - 25 * R));
}

// ── Backend URL mode ──────────────────────────────────────────────────────────
// Lightweight status ping that does NOT change mode (safe to call on login)
async function pingBackendStatus(url) {
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/status', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const boardEl = $('val-board');
      const modeEl = $('val-mode');
      if (boardEl) boardEl.textContent = t('renderBackendLabel');
      if (modeEl) modeEl.textContent = data.model_ready ? t('statusReady') : t('statusLoadingModelDots');
    }
  } catch {
    const boardEl = $('val-board');
    if (boardEl) boardEl.textContent = t('statusBackendWaking');
  }
}

async function connectBackendUrl(url) {
  if (backendPollTimer) { clearInterval(backendPollTimer); backendPollTimer = null; }
  mode = 'backend';
  setStatus('waking', t('statusWakingUp'));
  const boardEl = $('val-board');
  const modeEl = $('val-mode');
  if (boardEl) boardEl.textContent = t('renderBackendLabel');
  if (modeEl) modeEl.textContent = t('modeBleRender');

  let attempts = 0;
  const MAX = 40;
  let modelConfirmedReady = false;

  const poll = async () => {
    attempts++;
    try {
      const res = await fetch(url.replace(/\/$/, '') + '/status', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.model_ready) {
          modelConfirmedReady = true;
          clearInterval(backendPollTimer); backendPollTimer = null;
          setStatus('connected', t('statusBackendReady'));
        } else {
          setStatus('waking', t('statusModelLoading'));
        }
      } else {
        setStatus('waking', t('statusWakingUp'));
      }
    } catch {
      if (attempts >= MAX) {
        modelConfirmedReady = true; // stop retrying
        clearInterval(backendPollTimer); backendPollTimer = null;
        setStatus('error', t('statusBackendOffline'));
      }
    }
  };

  await poll();
  // Do not start interval if: BT connected during first poll, or model already confirmed ready
  if (mode !== 'backend' || modelConfirmedReady) return;
  backendPollTimer = setInterval(poll, 1500);
}

// ── Stop everything ───────────────────────────────────────────────────────────
function stopAll() {
  clearInterval(demoTimer); demoTimer = null;
  clearInterval(pollTimer); pollTimer = null;
  clearInterval(backendPollTimer); backendPollTimer = null;
  if (sseSource) { sseSource.close(); sseSource = null; }
  if (mode === 'bluetooth') disconnectBluetooth();
  mode = 'idle';
  setStatus('', t('disconnected'));
  const demoBtn = $('btn-demo');
  if (demoBtn) demoBtn.textContent = t('demoLabel');
}

// ── Canvas / waveform ─────────────────────────────────────────────────────────
function resizeCanvas() {
  const canvas = $('eeg-canvas');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

window.addEventListener('resize', resizeCanvas);

// ── Band colour table for wave visualization (yogic chakra associations) ─────
function drawWave() {
  const canvas = $('eeg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cy = H / 2; // vertical centre of canvas

  if (mode === 'bluetooth' && bleSamTick > 0) {
    // ── Live BLE: draw EEG samples, lightly smoothed for display only ──────
    // Raw per-sample EEG at 256 Hz plotted point-to-point is visually chaotic
    // (blink/muscle artifacts alone can dwarf the underlying rhythm) even
    // when the signal itself is fine. This is a display-only trailing
    // moving-average + soft amplitude cap — bleChannels (what actually gets
    // analysed) is read here but never mutated, so classification accuracy
    // is unaffected.
    const ch0 = bleChannels[0];
    const len = Math.min(ch0.length, WAVE_LEN);
    if (len > 1) {
      const raw = ch0.slice(ch0.length - len);
      const win = 6;
      const smoothed = new Array(len);
      let sum = 0;
      for (let i = 0; i < len; i++) {
        sum += raw[i];
        if (i >= win) sum -= raw[i - win];
        smoothed[i] = sum / Math.min(i + 1, win);
      }
      const cap = H * 0.42; // keep artifact spikes on-canvas instead of jumping off it
      ctx.beginPath();
      ctx.strokeStyle = 'var(--accent, #56A67A)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < len; i++) {
        const x = (i / (len - 1)) * W;
        const y = cy - Math.max(-cap, Math.min(cap, smoothed[i] * H * 400));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    // ── Demo / idle: one smooth slow wave ───────────────────────────────
    // Advance phase slowly so the wave scrolls at a calm, readable pace.
    wavePhase += 0.015;
    const bp = lastBandPowers;

    // Two gentle sinusoids — a slow swell (alpha-shaped) and a subtle
    // faster ripple (beta-shaped) — blended into one single line.
    const swell  = (bp.alpha || 0.28) * (H * 0.30); // large slow component
    const ripple = ((bp.low_beta || 0.18) + (bp.high_beta || 0.13)) * (H * 0.06);

    ctx.beginPath();
    ctx.strokeStyle = 'var(--accent, #56A67A)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= WAVE_LEN; i++) {
      const x = (i / WAVE_LEN) * W;
      const t = (i / WAVE_LEN) * Math.PI * 4 + wavePhase; // ~2 full cycles across canvas
      const y = cy
        + Math.sin(t)          * swell          // slow primary swell
        + Math.sin(t * 2.6)    * ripple;        // subtle faster ripple on top
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  requestAnimationFrame(drawWave);
}

// ── Status indicator ──────────────────────────────────────────────────────────
function setStatus(cls, text) {
  const dot = $('status-dot');
  const lbl = $('status-text');
  if (dot) dot.className = 'status-dot' + (cls ? ' ' + cls : '');
  if (lbl) lbl.textContent = text;
  const cmdDot = $('cmd-conn-dot'); // command-bar mirror
  if (cmdDot) cmdDot.className = 'status-dot' + (cls ? ' ' + cls : '');
}

// ── Apply reading to UI ───────────────────────────────────────────────────────
// ── Inner Texture: turn the backend's deep-state features into plain-language
// gauges. Vṛtti is backend-computed; Richness (complexity) and Stillness
// (aperiodic 1/f) are rolled up here. These are RELATIVE gauges — absolute
// low/med/high needs per-user calibration (backend Phase 4), so they read as a
// live trend within the session, not a clinical verdict. ──
function renderInnerTexture(r) {
  // Vṛtti — mental activity, 0 (still / nirodha) → 100 (scattered).
  setTextureBar('vritti', r.vritti_index != null ? r.vritti_index * 100 : null);
  const nir = $('nirodha-state');
  if (nir) nir.textContent = r.nirodha_state ? translateNirodha(r.nirodha_state) : '—';

  // Mind Richness — roll the four complexity metrics into one gauge.
  const cx = r.complexity;
  let richness = null;
  if (cx) {
    const parts = [
      clamp01(cx.lziv),                    // normalised LZ, ~0..1
      clamp01(cx.perm_entropy),            // normalised, 0..1
      clamp01(cx.sample_entropy / 1.5),    // ~0..1.5 → 0..1
      clamp01((cx.higuchi_fd - 1) / 1),    // ~1..2 → 0..1
    ];
    richness = parts.reduce((a, b) => a + b, 0) / parts.length;
  }
  setTextureBar('richness', richness != null ? richness * 100 : null);

  // Background Stillness — steeper aperiodic 1/f exponent = more settled.
  const ap = r.aperiodic;
  const stillness = (ap && ap.exponent != null)
    ? clamp01((ap.exponent - 1.0) / (3.5 - 1.0)) : null;
  setTextureBar('stillness', stillness != null ? stillness * 100 : null);
}

// ── Signed corroboration ────────────────────────────────────────────────────
// The bhūmi is the primary (śāstric) reading; these Western neuromarkers sit
// UNDER it as plain-language witnesses that either back it up or gently question
// it. No backend jargon reaches the screen — axis keys map to lay names, the
// `agrees` flag becomes a ✓ / ~ / – marker, and a divergence shows an honest
// caveat rather than being hidden. Mirrors the backend `corroborate` output.
// Translated via t('axis_' + key) / t('concord_' + key) — see i18n.js.

function corrTone(agrees)  { return agrees === true ? 'support' : agrees === false ? 'tension' : 'neutral'; }
function corrGlyph(agrees) { return agrees === true ? '✓'       : agrees === false ? '~'       : '–'; }

function renderCorroboration(r) {
  const host = $('corrob');
  if (!host) return;
  const co = r.chitta_bhumi && r.chitta_bhumi.corroboration;
  if (!co || !co.axes || !co.axes.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
  host.style.display = '';

  const concordTone = co.concord === 'corroborated' ? 'support'
    : co.concord === 'tension' ? 'tension' : 'neutral';

  const rows = co.axes.map(a => {
    const tone = corrTone(a.agrees);
    const chip = (a.reading || '').split(/[\s(]/)[0];   // qualitative word only, no raw value
    return `<div class="corrob-row">
        <span class="corrob-mark ${tone}">${corrGlyph(a.agrees)}</span>
        <div class="corrob-text">
          <span class="corrob-name">${escHtml(t('axis_' + a.axis) || a.axis)}</span>
          <span class="corrob-note">${escHtml(translateCorrobNote(a.note) || '')}</span>
        </div>
        <span class="corrob-reading">${escHtml(translateCorrobReading(chip))}</span>
      </div>`;
  }).join('');

  const tentative = co.indeterminate ? `<span class="corrob-tentative">${escHtml(t('corrobHeldGently'))}</span>` : '';
  const caveat = co.caveat
    ? `<div class="corrob-caveat"><span class="corrob-caveat-glyph">~</span><span>${escHtml(translateCorrobCaveat(co.caveat))}</span></div>`
    : '';

  host.innerHTML = `
    <div class="corrob-head">
      <span class="card-label">${escHtml(t('corrobTitle'))}</span>
      <span class="corrob-concord ${concordTone}">${escHtml(t('concord_' + co.concord) || co.concord)}</span>
    </div>
    ${tentative}
    <div class="corrob-rows">${rows}</div>
    ${caveat}`;
}

function setTextureBar(key, pct, prefix) {
  const p = prefix || '';
  const bar = $(p + 'bar-' + key);
  const val = $(p + 'val-' + key);
  if (bar) bar.style.width = (pct != null ? Math.round(pct) : 0) + '%';
  if (val) val.textContent = pct != null ? Math.round(pct) + '%' : '—';
}

// Session-level Inner Texture — same derivation as renderInnerTexture, but
// driven by the /analytics summary's session averages (an-* ids) rather than
// a single live epoch. Previously the Analyze view had no Inner Texture card
// at all, so this was permanently blank regardless of what the analyser sent.
function renderAnalyzeTexture(s) {
  setTextureBar('vritti', s.avgVritti != null ? s.avgVritti * 100 : null, 'an-');
  const nir = $('an-nirodha-state');
  if (nir) nir.textContent = s.avgVritti != null ? translateNirodha(nirodhaLabel(s.avgVritti)) : '—';

  const cx = s.avgComplexity;
  let richness = null;
  if (cx) {
    const parts = [
      clamp01(cx.lziv),
      clamp01(cx.permEntropy),
      clamp01(cx.sampleEntropy / 1.5),
      clamp01((cx.higuchiFd - 1) / 1),
    ];
    richness = parts.reduce((a, b) => a + b, 0) / parts.length;
  }
  setTextureBar('richness', richness != null ? richness * 100 : null, 'an-');

  const ap = s.avgAperiodic;
  const stillness = (ap && ap.exponent != null) ? clamp01((ap.exponent - 1.0) / (3.5 - 1.0)) : null;
  setTextureBar('stillness', stillness != null ? stillness * 100 : null, 'an-');
}

// Session-level Tattva/Chakra Correlates — frequency of each flag across all
// epochs. Previously the Analyze view had no card and /analytics never
// aggregated tattva_flags, so this was permanently blank/absent.
function renderAnalyzeTattva(flags) {
  const el = $('an-tattva-flags');
  if (!el) return;
  el.innerHTML = (flags && flags.length)
    ? flags.map(f => `<span class="tattva-tag">${escHtml(translateTattvaFlag(f.flag))} <em>(${localizeNumber(f.count)})</em></span>`).join('')
    : `<span class="tattva-tag muted">${escHtml(t('noneDetected'))}</span>`;
}

function clamp01(x) { return (x == null || isNaN(x)) ? 0 : Math.max(0, Math.min(1, x)); }

// Chitta-bhumi confidence arrives as a raw 0-1 fraction from smoothReading on
// every live path (demo/BLE/local-FFT all funnel through it), but as a
// DB-stored string from Replay — this normalizes either into "NN%" instead of
// showing a bare decimal like "0.6045".
function formatConfidencePct(c) {
  if (c == null || c === '') return null;
  if (typeof c === 'string' && c.trim().endsWith('%')) return c;
  const n = typeof c === 'string' ? parseFloat(c) : c;
  if (isNaN(n)) return String(c);
  return Math.round((n <= 1 ? n * 100 : n)) + '%';
}

const DATA_QUALITY_KEYS = {
  '⏪ replay': 'qualityReplay',
  '✓ local FFT': 'qualityLocalFft',
  '✓ demo': 'qualityDemo',
  '✓ BLE → Render': 'qualityBleRender',
};
function translateDataQuality(q) {
  if (!q) return q;
  const key = DATA_QUALITY_KEYS[q];
  return key ? t(key) : q;
}

const ROLE_KEYS = { user: 'adminRoleUser', 'co-admin': 'adminRoleCoAdmin', admin: 'adminRoleAdmin' };
function translateRole(role) {
  const key = ROLE_KEYS[role];
  return key ? t(key) : role;
}

// Plain-language band over the vṛtti index — mirrors the backend thresholds.
function nirodhaLabel(v) {
  return v < 0.20 ? 'Nirodha (still)'
    : v < 0.45 ? 'Settling'
    : v < 0.70 ? 'Active'
    : 'Vikshepa (scattered)';
}

// ── Temporal smoothing ─────────────────────────────────────────────────────
// A single 4-second epoch is a noisy snapshot; meditative states unfold over
// tens of seconds, and Vikshipta is *defined* as oscillating — so raw per-epoch
// labels flicker meaninglessly. We therefore smooth the live DISPLAY only:
// continuous quantities (gunas, vṛtti, bands, complexity, aperiodic, the 5
// probabilities) are EMA-filtered; the discrete labels (bhūmi, swara) use
// hysteresis — they switch only when a new candidate persists. Raw epochs are
// still persisted to the DB unchanged (storeEpochToSession gets the raw reading).
const SMOOTH_ALPHA  = 0.2;   // EMA factor (~18 s time constant at 4 s epochs)
const STATE_DWELL   = 2;     // epochs a new label must persist before switching
const CHITTA_STATES = ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];

let smooth = null;
function resetSmoothing() { smooth = null; }

function _ema(key, value) {
  const prev = smooth.ema[key];
  if (value == null || isNaN(value)) return prev == null ? null : prev;
  smooth.ema[key] = (prev == null) ? value : prev + SMOOTH_ALPHA * (value - prev);
  return smooth.ema[key];
}

function numify(x) {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : parseFloat(x);
  return isNaN(n) ? null : n;
}

function coarseGunaLabel(s, r, t) {
  const max = Math.max(s, r, t), min = Math.min(s, r, t);
  if (max - min < 0.12) return 'Balanced (all three)';
  return max === s ? 'Sattvic' : max === r ? 'Rajasic' : 'Tamasic';
}

function smoothReading(r) {
  if (!smooth) smooth = { ema: {}, epochs: 0, state: null, cand: null, candN: 0,
                          swara: null, swaraFull: null, swCand: null, swN: 0 };
  smooth.epochs++;

  // ── Continuous scalars (EMA) ──
  const vritti = _ema('vritti', r.vritti_index);
  const asym   = _ema('asym', numify(r.alpha_asymmetry));

  const spectrum = {};
  ['delta', 'theta', 'alpha', 'low_beta', 'high_beta', 'beta', 'gamma'].forEach(b => {
    const v = _ema('band_' + b, numify(r.eeg_spectrum?.[b]));
    if (v != null) spectrum[b] = v;
  });

  const g = r.gunas || {};
  const sattva = _ema('sattva', numify(g.sattva));
  const rajas  = _ema('rajas',  numify(g.rajas));
  const tamas  = _ema('tamas',  numify(g.tamas));

  const lz  = _ema('lziv', r.complexity?.lziv);
  const hfd = _ema('hfd',  r.complexity?.higuchi_fd);
  const se  = _ema('se',   r.complexity?.sample_entropy);
  const pe  = _ema('pe',   r.complexity?.perm_entropy);
  const cx  = lz != null ? { lziv: lz, higuchi_fd: hfd, sample_entropy: se, perm_entropy: pe } : null;

  const apx = _ema('apx', r.aperiodic?.exponent);
  const apo = _ema('apo', r.aperiodic?.offset);
  const ap  = apx != null ? { exponent: apx, offset: apo } : null;

  // ── Smoothed, renormalised probabilities ──
  const raw = r.chitta_bhumi?.probabilities || {};
  const probs = {}; let tot = 0;
  CHITTA_STATES.forEach(s => { const v = _ema('p_' + s, numify(raw[s])); probs[s] = v == null ? 0 : v; tot += probs[s]; });
  if (tot > 0) CHITTA_STATES.forEach(s => probs[s] /= tot);

  // ── Discrete bhūmi via hysteresis over the smoothed probabilities ──
  const winner = CHITTA_STATES.reduce((a, b) => (probs[b] > probs[a] ? b : a), CHITTA_STATES[0]);
  if (smooth.state == null) smooth.state = winner;
  else if (winner !== smooth.state) {
    smooth.candN = (winner === smooth.cand) ? smooth.candN + 1 : 1;
    smooth.cand = winner;
    if (smooth.candN >= STATE_DWELL) { smooth.state = winner; smooth.cand = null; smooth.candN = 0; }
  } else { smooth.cand = null; smooth.candN = 0; }
  const state = smooth.state;

  // ── Swara zone via hysteresis ──
  const zone = (r.swara?.state || '').split(' ')[0] || null;
  if (zone) {
    if (smooth.swara == null) { smooth.swara = zone; smooth.swaraFull = r.swara; }
    else if (zone !== smooth.swara) {
      smooth.swN = (zone === smooth.swCand) ? smooth.swN + 1 : 1;
      smooth.swCand = zone;
      if (smooth.swN >= STATE_DWELL) { smooth.swara = zone; smooth.swaraFull = r.swara; smooth.swCand = null; smooth.swN = 0; }
    } else { smooth.swCand = null; smooth.swN = 0; smooth.swaraFull = r.swara; }
  }

  return {
    ...r,
    chitta_bhumi: {
      state,
      depth: CHITTA_DEPTHS[state] || r.chitta_bhumi?.depth || '—',
      confidence: probs[state],
      probabilities: probs,
      // Carried through unsmoothed — it's the latest epoch's signed corroboration.
      // Keyed to the backend's per-epoch state; may briefly lag the hysteresis label.
      corroboration: r.chitta_bhumi?.corroboration,
    },
    contemplative_depth: CHITTA_DEPTHS[state] || r.contemplative_depth,
    swara: smooth.swaraFull || r.swara,
    alpha_asymmetry: asym != null ? asym : r.alpha_asymmetry,
    eeg_spectrum: Object.keys(spectrum).length ? spectrum : r.eeg_spectrum,
    gunas: sattva != null ? { sattva, rajas, tamas, label: coarseGunaLabel(sattva, rajas, tamas) } : r.gunas,
    vritti_index: vritti != null ? vritti : r.vritti_index,
    nirodha_state: vritti != null ? nirodhaLabel(vritti) : r.nirodha_state,
    complexity: cx || r.complexity,
    aperiodic: ap || r.aperiodic,
  };
}

let lastAppliedReading = null;

function applyReading(r) {
  lastAppliedReading = r; // so switching language can instantly re-render this same reading
  // ── Epoch / quality / latency ──
  const epochEl = $('val-epoch');
  const qualEl = $('val-quality');
  const latEl = $('val-latency');
  if (epochEl) epochEl.textContent = r.epoch ?? epoch;
  if (qualEl) qualEl.textContent = translateDataQuality(r.data_quality) || '—';
  if (latEl) latEl.textContent = r.latency_ms != null ? r.latency_ms.toFixed(1) : '—';

  // ── Chitta Bhumi ──
  const ch = r.chitta_bhumi || {};
  const state = ch.state || '—';
  const chittaEl = $('chitta-state');
  const chittaSubEl = $('chitta-sub');
  if (chittaEl) chittaEl.textContent = translateState(state);
  if (chittaSubEl) chittaSubEl.textContent = (ch.depth ? translateDepth(ch.depth) : null) || formatConfidencePct(ch.confidence) || '—';

  const depth = ch.depth || CHITTA_DEPTHS[state] || 'Surface';
  const depthPct = DEPTH_PCT[depth] ?? 12;
  const depthFill = $('depth-fill');
  const depthColor = state === 'Mudha'     ? '#4A3060'       // deep inertia — dark purple
    : state === 'Kshipta'   ? 'var(--kshipta)'
    : state === 'Vikshipta' ? 'var(--vikshipta)'
    : state === 'Ekagra'    ? 'var(--ekagra)' : 'var(--niruddha)';
  if (depthFill) {
    depthFill.style.width = depthPct + '%';
    depthFill.style.background = depthColor;
  }

  const confEl = $('val-confidence');
  const depthEl = $('val-depth');
  if (confEl) confEl.textContent = formatConfidencePct(ch.confidence);
  if (depthEl) depthEl.textContent = translateDepth(depth);

  const probs = ch.probabilities || {};
  // All 5 Chitta Bhumis (v2 adds Mudha)
  ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'].forEach(s => {
    const raw = probs[s] ?? '0%';
    const pct = typeof raw === 'number' ? raw * 100 : parseFloat(raw);
    const key = s.toLowerCase();
    const el = $('prob-' + key);
    const bar = $('bar-' + key);
    if (el) el.textContent = isNaN(pct) ? raw : pct.toFixed(1) + '%';
    if (bar) bar.style.width = (isNaN(pct) ? parseFloat(raw) : pct) + '%';
  });

  // ── Swara ──
  const sw = r.swara || {};
  const sst = (sw.state || '').toLowerCase();
  const isIda = /ida/.test(sst);
  const isPingala = /pingala/.test(sst);
  const isSushumna = !isIda && !isPingala;

  const swaraNote = $('swara-note');
  const swaraConf = $('swara-confidence');
  // In Gujarati, prefer the translated fallback note over the backend's own
  // (DO-NOT-TOUCH, English-only) note text — a frontend rendering choice
  // only, nothing about how the backend classifies Swara changes.
  const swaraFallback = isIda ? SWARA_NOTES.ida : isPingala ? SWARA_NOTES.pingala : SWARA_NOTES.sushumna;
  if (swaraNote) swaraNote.textContent = getLang() === 'gu' ? swaraFallback : (sw.note || swaraFallback);
  if (swaraConf) swaraConf.textContent = sw.confidence ? translateConfidenceWord(sw.confidence) : '—';

  const glIda = $('glyph-ida');
  const glSus = $('glyph-sushumna');
  const glPin = $('glyph-pingala');
  if (glIda) glIda.className = 'swara-glyph' + (isIda ? ' active-ida' : '');
  if (glSus) glSus.className = 'swara-glyph' + (isSushumna ? ' active-sushumna' : '');
  if (glPin) glPin.className = 'swara-glyph' + (isPingala ? ' active-pingala' : '');

  const asym = r.alpha_asymmetry || 0;
  const clamped = Math.max(-0.5, Math.min(0.5, asym));
  const pct = (clamped / 0.5) * 50;
  const thumbL = (50 + pct) + '%';
  const fillBg = isIda ? 'var(--ida)' : isPingala ? 'var(--pingala)' : 'var(--sushumna)';
  const thumb = $('asym-thumb');
  const fillEl = $('asym-fill');
  if (thumb) { thumb.style.left = thumbL; thumb.style.background = fillBg; }
  if (fillEl) {
    if (pct > 0) {
      fillEl.style.left = '50%';
      fillEl.style.right = (100 - (50 + pct)) + '%';
      fillEl.style.background = fillBg;
    } else if (pct < 0) {
      fillEl.style.left = (50 + pct) + '%';
      fillEl.style.right = '50%';
      fillEl.style.background = fillBg;
    } else {
      fillEl.style.left = fillEl.style.right = '50%';
    }
  }

  // ── Spectral Band Powers ──
  const spectrum = r.eeg_spectrum || (r.band_powers && r.band_powers.relative) || {};
  // Show all 6 bands (high_beta and low_beta are new in v2; beta = combined fallback)
  const allBands = ['delta', 'theta', 'alpha', 'low_beta', 'high_beta', 'beta', 'gamma'];
  allBands.forEach(b => {
    const raw = spectrum[b] ?? null;
    const pctVal = raw != null ? Math.round(raw * 100) : null;
    const barEl = $('bar-' + b);
    const valEl = $('val-' + b);
    if (barEl) barEl.style.width = (pctVal ?? 0) + '%';
    if (valEl) valEl.textContent = pctVal != null ? pctVal + '%' : '—';
  });

  // Update band power state for canvas visualization
  lastBandPowers = {
    delta:    spectrum.delta     ?? lastBandPowers.delta,
    theta:    spectrum.theta     ?? lastBandPowers.theta,
    alpha:    spectrum.alpha     ?? lastBandPowers.alpha,
    low_beta: spectrum.low_beta  ?? (spectrum.beta != null ? spectrum.beta * 0.55 : lastBandPowers.low_beta),
    high_beta:spectrum.high_beta ?? (spectrum.beta != null ? spectrum.beta * 0.45 : lastBandPowers.high_beta),
    gamma:    spectrum.gamma     ?? lastBandPowers.gamma,
  };

  // ── Tattva flags ──
  const flags = r.tattva_flags || [];
  const tattvaEl = $('tattva-flags');
  if (tattvaEl) {
    tattvaEl.innerHTML = flags.length
      ? flags.map(f => `<span class="tattva-tag">${escHtml(translateTattvaFlag(f))}</span>`).join('')
      : `<span class="tattva-tag muted">${escHtml(t('noneDetected'))}</span>`;
  }

  // ── Trigunas ──
  const gunas = r.gunas || {};
  const gunaKeys = ['sattva', 'rajas', 'tamas'];
  gunaKeys.forEach(g => {
    const val = gunas[g] ?? null;
    const pctVal = val != null ? Math.round(val * 100) : null;
    const barEl = $('bar-' + g);
    const valEl = $('val-' + g);
    if (barEl) barEl.style.width = (pctVal ?? 0) + '%';
    if (valEl) valEl.textContent = pctVal != null ? pctVal + '%' : '—';
  });

  const gunaLabel = gunas.label || (gunas.sattva > gunas.rajas && gunas.sattva > gunas.tamas ? 'Sattvic'
    : gunas.rajas > gunas.tamas ? 'Rajasic' : gunas.tamas ? 'Tamasic' : '—');
  const gunaDominantEl = $('gunas-dominant');
  const gunaNoteEl = $('gunas-note');
  if (gunaDominantEl) gunaDominantEl.textContent = translateGunaLabel(gunaLabel) || '—';
  if (gunaNoteEl) {
    gunaNoteEl.textContent = gunaLabel === 'Sattvic' ? t('gunaNoteSattvic')
      : gunaLabel === 'Rajasic' ? t('gunaNoteRajasic')
      : gunaLabel === 'Tamasic' ? t('gunaNoteTamasic') : '';
  }

  // ── Inner Texture (vṛtti / richness / stillness) ──
  renderInnerTexture(r);

  // ── Signed corroboration folded under the bhūmi ──
  renderCorroboration(r);

  // ── Blood oxygen / heart rate — the card stays visible whenever the device
  // supports it (see updateVitalsVisibility); only the VALUE reflects whether
  // a real reading exists yet ("—" / "awaiting signal" until it does). ──
  const spo2El = $('val-spo2');
  const hrEl = $('val-hr');
  const spo2StatusEl = $('spo2-status');
  const hrStatusEl = $('hr-status');
  // In live Bluetooth mode, blood_oxygen/heart_rate reflect the same
  // hrEma/spo2Ema tracked in onMusePPG — use its staleness state so a
  // momentary bad window doesn't blank the card (per explicit feedback),
  // just marks the number as "last known" rather than live. Demo/backend-URL
  // /replay modes don't populate that PPG-specific state, so they keep the
  // simpler null-check ("no reading yet" vs "have one").
  const hrIsBleTracked = mode === 'bluetooth';
  if (spo2El) spo2El.textContent = r.blood_oxygen != null ? r.blood_oxygen.toFixed(1) : '—';
  if (hrEl) hrEl.textContent = r.heart_rate != null ? r.heart_rate.toFixed(0) : '—';
  if (spo2StatusEl) spo2StatusEl.textContent = r.blood_oxygen == null ? t('awaitingSignal') : (hrIsBleTracked && isSpo2Stale() ? t('lastKnownReading') : t('liveReading'));
  if (hrStatusEl) hrStatusEl.textContent = r.heart_rate == null ? t('awaitingSignal') : (hrIsBleTracked && isHrStale() ? t('lastKnownReading') : t('liveReading'));

  localizeDom(document.querySelector('.dashboard-grid'));
}

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();


// ── AI Baba state ─────────────────────────────────────────────────────────────
let aiBabaSessionId   = null;
let aiBabaSessionName = '';
let aiBabaChatHistory = [];
let aiBabaSending     = false;

function aiBabaShowStep(step) {
  ['pick', 'loading', 'chat'].forEach(s => {
    const el = $(`ai-baba-step-${s}`);
    if (el) el.style.display = s === step ? '' : 'none';
  });
}

function aiBabaAddMessage(role, text, isError = false) {
  const msgs = $('ai-baba-messages');
  if (!msgs) return;
  const wrap   = document.createElement('div');
  wrap.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}${isError ? ' ai-msg-error' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function aiBabaSetTyping(show) {
  const el      = $('ai-baba-typing');
  const sendBtn = $('btn-ai-baba-send');
  if (el)      el.style.display = show ? 'flex' : 'none';
  if (sendBtn) sendBtn.disabled = show;
}

async function openAiBaba() {
  const overlay = $('ai-baba-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  aiBabaSessionId = null; aiBabaSessionName = ''; aiBabaChatHistory = [];
  aiBabaShowStep('pick');
  const msgs = $('ai-baba-messages'), loadingEl = $('ai-baba-sessions-loading'),
        listEl = $('ai-baba-sessions-list'), emptyEl = $('ai-baba-sessions-empty');
  if (msgs)      msgs.innerHTML = '';
  if (loadingEl) loadingEl.style.display = 'flex';
  if (listEl)    listEl.style.display    = 'none';
  if (emptyEl)   emptyEl.style.display   = 'none';
  try {
    const sessions = await api('GET', '/ai/sessions');
    if (loadingEl) loadingEl.style.display = 'none';
    if (!sessions || sessions.length === 0) { if (emptyEl) emptyEl.style.display = ''; return; }
    if (listEl) {
      listEl.innerHTML = sessions.map(s => {
        const date = s.start_time ? new Date(s.start_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
        const time = s.start_time ? new Date(s.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
        const dur  = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : '—';
        const epochs = s.epoch_count || 0, hasData = epochs > 0;
        return `<div class="ai-baba-session-item" data-id="${escHtml(String(s.id))}" data-name="${escHtml(s.name || t('aiBabaSessionFallbackName'))}"
                     ${!hasData ? 'style="opacity:0.5;pointer-events:none" aria-disabled="true"' : 'tabindex="0" role="button"'}>
          <div class="ai-baba-session-item-name">${escHtml(s.name || t('untitledSession'))}</div>
          <div class="ai-baba-session-item-meta">
            <span>${escHtml(date)}${time ? ' · ' + escHtml(time) : ''}</span>
            <span>${escHtml(dur)}</span>
            <span>${localizeNumber(epochs)} ${epochs !== 1 ? t('aiBabaEpochPlural') : t('aiBabaEpochSingular')}</span>
          </div>
          ${!hasData ? `<div class="ai-baba-session-item-nodata">${escHtml(t('noEegDataRecorded'))}</div>` : ''}
        </div>`;
      }).join('');
      listEl.style.display = '';
      listEl.querySelectorAll('.ai-baba-session-item[tabindex="0"]').forEach(item => {
        item.addEventListener('click', () => aiBabaSelectSession(item.dataset.id, item.dataset.name));
        item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aiBabaSelectSession(item.dataset.id, item.dataset.name); } });
      });
      localizeDom(listEl);
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.textContent = t('aiBabaFailedToLoadSessions') + (err.message || t('aiBabaUnknownErrorLower')) + t('aiBabaPleaseTryAgainSuffix');
      emptyEl.style.display = '';
    }
  }
}

async function aiBabaSelectSession(sessionId, sessionName) {
  aiBabaSessionId = sessionId; aiBabaSessionName = sessionName; aiBabaChatHistory = [];
  const msgs = $('ai-baba-messages'); if (msgs) msgs.innerHTML = '';
  const label = $('ai-baba-session-label'); if (label) label.textContent = sessionName;
  aiBabaShowStep('loading');
  try {
    const data = await api('POST', '/ai/start', { session_id: sessionId, lang: getLang() });
    aiBabaShowStep('chat');
    const summary = data.summary || t('aiBabaDefaultSummary');
    aiBabaAddMessage('assistant', summary);
    aiBabaChatHistory.push({ role: 'assistant', content: summary });
    setTimeout(() => { const inp = $('ai-baba-input'); if (inp) inp.focus(); }, 100);
  } catch (err) {
    aiBabaShowStep('chat');
    aiBabaAddMessage('assistant',
      t('aiBabaTroubleLoading') + '\n\n' +
      t('aiBabaErrorPrefix') + (err.message || t('unknownErrorLabel')) + '\n\n' +
      t('aiBabaTryAgainDifferent'), true);
  }
}

async function aiBabaSendMessage() {
  if (aiBabaSending || !aiBabaSessionId) return;
  const input = $('ai-baba-input'); if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = ''; aiBabaSending = true;
  aiBabaAddMessage('user', text);
  aiBabaChatHistory.push({ role: 'user', content: text });
  aiBabaSetTyping(true);
  const msgs = $('ai-baba-messages'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  try {
    const data = await api('POST', '/ai/chat', { session_id: aiBabaSessionId, message: text, history: aiBabaChatHistory.slice(-20), lang: getLang() });
    aiBabaSetTyping(false);
    const reply = data.reply || t('aiBabaCouldNotProcess');
    aiBabaAddMessage('assistant', reply);
    aiBabaChatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    aiBabaSetTyping(false);
    aiBabaAddMessage('assistant', t('aiBabaSomethingWentWrong') + (err.message || t('aiBabaUnknownErrorLower')) + t('aiBabaPleaseTryAgainSuffix'), true);
  }
  aiBabaSending = false;
}

function closeAiBaba() {
  const overlay = $('ai-baba-overlay'); if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = ''; aiBabaSending = false;
}

(function initAiBaba() {
  const openBtn = $('btn-ai-baba'), closeBtn = $('btn-ai-baba-close'),
        overlay = $('ai-baba-overlay'), changeBtn = $('btn-ai-baba-change'),
        sendBtn = $('btn-ai-baba-send'), input = $('ai-baba-input');
  if (openBtn)   openBtn.addEventListener('click', openAiBaba);
  if (closeBtn)  closeBtn.addEventListener('click', closeAiBaba);
  if (changeBtn) changeBtn.addEventListener('click', openAiBaba);
  if (sendBtn)   sendBtn.addEventListener('click', aiBabaSendMessage);
  if (overlay)   overlay.addEventListener('click', e => { if (e.target === overlay) closeAiBaba(); });
  if (input)     input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiBabaSendMessage(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const ov = $('ai-baba-overlay'); if (ov && ov.style.display !== 'none') closeAiBaba(); } });
})();

// Button visibility — syncs with the app shell (shown only when authed).
(function aiBabaButtonVisibility() {
  const shell = $('app-shell'), btn = $('btn-ai-baba');
  if (!shell || !btn) return;
  function syncVisibility() {
    btn.style.display = window.getComputedStyle(shell).display !== 'none' ? '' : 'none';
  }
  new MutationObserver(syncVisibility).observe(shell, { attributes: true, attributeFilter: ['style', 'class'] });
  syncVisibility();
})();

// ════════════════════════════════════════════════════════════════════════════
// P3 — ANALYZE VIEW: inline-SVG instruments driven by REAL session analytics.
// Muse/BrainBit = 4 channels → epochs store whole-head band AVERAGES, not per-
// electrode values, so the sensor schematic is deliberately symmetric (no faked
// topography). Every instrument coerces null → 0 for geometry and shows "—"/empty
// states for missing data.
// ════════════════════════════════════════════════════════════════════════════
const AN_BAND_COLORS  = { delta:'#9B6FBE', theta:'#5B8DB8', alpha:'#56A67A', beta:'#D4973A', gamma:'#C75C5C' };
const BAND_NAME_KEYS  = { delta:'bandDelta', theta:'bandTheta', alpha:'bandAlpha', beta:'bandBeta', gamma:'bandGamma' };
const AN_GUNA_COLORS  = { sattva:'#C9A84C', rajas:'#C75C5C', tamas:'#5A6DAA' };
const AN_BHUMI_COLORS = { Mudha:'#8A8F98', Kshipta:'#E08030', Vikshipta:'#D97757', Ekagra:'#5B8DB8', Niruddha:'#7C68A8' };
const AN_SWARA_COLORS = { ida:'#5B8DB8', pingala:'#D97757', sushumna:'#56A67A' };
const AN_DEPTH_COLORS = { 'Deep Inertia':'#8A8F98', Surface:'#E08030', Emerging:'#D4973A', Deep:'#5B8DB8', Profound:'#7C68A8' };
const AN_BHUMI_ORDER  = ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];
const AN_DEPTH_ORDER  = ['Deep Inertia', 'Surface', 'Emerging', 'Deep', 'Profound'];

let analyzeSessionId = null;

const anNum = v => (v == null || Number.isNaN(+v)) ? 0 : +v;
const anPol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
function anArcSeg(cx, cy, rO, rI, a0, a1) {
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  const [x0, y0] = anPol(cx, cy, rO, a0), [x1, y1] = anPol(cx, cy, rO, a1);
  const [x2, y2] = anPol(cx, cy, rI, a1), [x3, y3] = anPol(cx, cy, rI, a0);
  const f = n => n.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${rO} ${rO} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${rI} ${rI} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}
function anSetEmpty(msg) {
  $('analyze-empty').style.display = '';
  $('analyze-body').style.display = 'none';
  const p = $('analyze-empty').querySelector('p'); if (p) p.textContent = msg;
}

async function onShowAnalyze() {
  const picker = $('analyze-session-picker');
  if (!picker) return;
  try {
    const sessions = await api('GET', '/sessions/mine');
    if (!sessions.length) { picker.innerHTML = `<option value="">${escHtml(t('noSessionsOption'))}</option>`; anSetEmpty(t('recordSessionFirstHint')); return; }
    picker.innerHTML = sessions.map(s =>
      `<option value="${s.id}">${escHtml(s.name)} — ${new Date(s.startTime).toLocaleDateString()}</option>`).join('');
    const preferred = analyzeSessionId
      || (typeof currentAnalyticsSessionId !== 'undefined' && currentAnalyticsSessionId)
      || sessions[0].id;
    if (sessions.some(s => String(s.id) === String(preferred))) picker.value = String(preferred);
    picker.onchange = () => loadAnalyzeSession(picker.value);
    await loadAnalyzeSession(picker.value);
  } catch (err) {
    anSetEmpty(t('couldNotLoadSessions') + err.message);
  }
}

async function loadAnalyzeSession(id) {
  analyzeSessionId = id;
  if (!id) return;
  try {
    const a = await api('GET', '/sessions/' + id + '/analytics');
    if (!a.summary || !a.summary.totalEpochs) { anSetEmpty(t('noEpochDataToAnalyze')); return; }
    const eps = await api('GET', '/sessions/' + id + '/epochs').catch(() => []);
    const s = a.summary;
    $('analyze-empty').style.display = 'none';
    $('analyze-body').style.display = '';
    $('analyze-session-meta').textContent = tf('analyzeSessionMetaTemplate', {
      epochs: localizeNumber(s.totalEpochs),
      duration: formatDuration(s.durationSeconds || 0),
      dominant: s.dominantState ? translateState(s.dominantState) : '—',
    });
    drawBandRadar(s.avgBands || {});
    drawGunaTriangle(s.avgGunas || {});
    drawBhumiRing(s.stateCounts || {});
    drawSwaraGauge(s.swaraCounts || {});
    drawDepthMeter(eps, s);
    drawSensorSchematic(s.avgBands || {});
    renderAnalyzeTexture(s);
    renderAnalyzeTattva(s.tattvaFlags || []);
    localizeDom(document.querySelector('.analyze'));
  } catch (err) {
    anSetEmpty(t('couldNotLoadAnalytics') + err.message);
  }
}

function drawBandRadar(avgBands) {
  const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  const maxR = 100, n = bands.length, ang = i => -90 + i * (360 / n);
  let svg = '';
  for (const fr of [0.25, 0.5, 0.75, 1]) {
    const pts = bands.map((_, i) => anPol(0, 0, maxR * fr, ang(i)).map(v => v.toFixed(1)).join(',')).join(' ');
    svg += `<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="1" opacity="0.6"/>`;
  }
  bands.forEach((b, i) => {
    const [ax, ay] = anPol(0, 0, maxR, ang(i));
    svg += `<line x1="0" y1="0" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="var(--border)" stroke-width="1" opacity="0.5"/>`;
    const [lx, ly] = anPol(0, 0, maxR + 17, ang(i));
    svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${AN_BAND_COLORS[b]}" font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escHtml(t(BAND_NAME_KEYS[b]))}</text>`;
  });
  const dpts = bands.map((b, i) => anPol(0, 0, maxR * Math.max(0, Math.min(1, anNum(avgBands[b]))), ang(i)).map(v => v.toFixed(1)).join(',')).join(' ');
  svg += `<polygon points="${dpts}" fill="var(--accent)" fill-opacity="0.28" stroke="var(--accent)" stroke-width="2"/>`;
  bands.forEach((b, i) => {
    const [px, py] = anPol(0, 0, maxR * Math.max(0, Math.min(1, anNum(avgBands[b]))), ang(i));
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${AN_BAND_COLORS[b]}"/>`;
  });
  $('an-band-radar').innerHTML = svg;
}

function drawGunaTriangle(g) {
  const V = { sattva: [0, -90], rajas: [85, 60], tamas: [-85, 60] };
  let svg = `<polygon points="${V.sattva.join(',')} ${V.rajas.join(',')} ${V.tamas.join(',')}" fill="none" stroke="var(--border)" stroke-width="1.5"/>`;
  for (const k of ['sattva', 'rajas', 'tamas']) {
    const [vx, vy] = V[k], lx = vx * 1.16, ly = vy === -90 ? vy - 9 : vy + 18;
    svg += `<circle cx="${vx}" cy="${vy}" r="4" fill="${AN_GUNA_COLORS[k]}"/>`;
    svg += `<text x="${lx}" y="${ly}" fill="${AN_GUNA_COLORS[k]}" font-size="11" font-weight="600" text-anchor="middle">${escHtml(t(k))}</text>`;
  }
  const s = anNum(g.sattva), r = anNum(g.rajas), tm = anNum(g.tamas), sum = s + r + tm;
  if (sum > 0) {
    const px = (s * V.sattva[0] + r * V.rajas[0] + tm * V.tamas[0]) / sum;
    const py = (s * V.sattva[1] + r * V.rajas[1] + tm * V.tamas[1]) / sum;
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="var(--accent)" stroke="#fff" stroke-width="1.5"/>`;
  } else {
    svg += `<text x="0" y="0" fill="var(--text-muted)" font-size="11" text-anchor="middle">${escHtml(t('noGunaData'))}</text>`;
  }
  $('an-guna-tri').innerHTML = svg;
}

function drawBhumiRing(counts) {
  const rO = 95, rI = 58;
  const entries = AN_BHUMI_ORDER.filter(k => counts[k]).map(k => [k, counts[k]]);
  Object.keys(counts).forEach(k => { if (!AN_BHUMI_ORDER.includes(k) && counts[k]) entries.push([k, counts[k]]); });
  const sum = entries.reduce((a, [, c]) => a + c, 0);
  let svg = '';
  if (!sum) {
    svg += `<circle cx="0" cy="0" r="${(rO + rI) / 2}" fill="none" stroke="var(--bg-card-2)" stroke-width="${rO - rI}"/>`;
    svg += `<text x="0" y="0" fill="var(--text-muted)" font-size="12" text-anchor="middle" dominant-baseline="middle">${escHtml(t('noDataLower'))}</text>`;
  } else if (entries.length === 1) {
    const [k] = entries[0];
    svg += `<circle cx="0" cy="0" r="${(rO + rI) / 2}" fill="none" stroke="${AN_BHUMI_COLORS[k] || 'var(--accent)'}" stroke-width="${rO - rI}"/>`;
    svg += `<text x="0" y="-4" fill="var(--text)" font-size="13" font-weight="700" text-anchor="middle">${escHtml(translateState(k))}</text>`;
    svg += `<text x="0" y="14" fill="var(--text-muted)" font-size="10" text-anchor="middle">${localizeNumber(100)}%</text>`;
  } else {
    let a0 = -90;
    entries.forEach(([k, c]) => {
      const sweep = c / sum * 360, a1 = a0 + sweep, col = AN_BHUMI_COLORS[k] || 'var(--text-muted)';
      svg += `<path d="${anArcSeg(0, 0, rO, rI, a0, a1)}" fill="${col}"/>`;
      if (sweep > 26) { const [lx, ly] = anPol(0, 0, (rO + rI) / 2, (a0 + a1) / 2); svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle">${localizeNumber(Math.round(c / sum * 100))}%</text>`; }
      a0 = a1;
    });
    const dom = entries.slice().sort((a, b) => b[1] - a[1])[0][0];
    svg += `<text x="0" y="-4" fill="var(--text)" font-size="13" font-weight="700" text-anchor="middle">${escHtml(translateState(dom))}</text>`;
    svg += `<text x="0" y="14" fill="var(--text-muted)" font-size="10" text-anchor="middle">${escHtml(t('dominantSuffix'))}</text>`;
  }
  $('an-bhumi-ring').innerHTML = svg;
}

function drawSwaraGauge(counts) {
  const cx = 120, cy = 100, r = 90, rI = 58, order = ['ida', 'sushumna', 'pingala'];
  const sum = order.reduce((a, k) => a + anNum(counts[k]), 0);
  let svg = '';
  if (!sum) {
    svg += `<path d="${anArcSeg(cx, cy, r, rI, 180, 360)}" fill="var(--bg-card-2)"/>`;
    svg += `<text x="${cx}" y="${cy - 20}" fill="var(--text-muted)" font-size="12" text-anchor="middle">${escHtml(t('noSvaraData'))}</text>`;
  } else {
    let a0 = 180;
    order.forEach(k => { const frac = anNum(counts[k]) / sum; if (frac <= 0) return; const a1 = a0 + frac * 180; svg += `<path d="${anArcSeg(cx, cy, r, rI, a0, a1)}" fill="${AN_SWARA_COLORS[k]}"/>`; a0 = a1; });
    const t = (anNum(counts.pingala) + 0.5 * anNum(counts.sushumna)) / sum;
    const [nx, ny] = anPol(cx, cy, r - 6, 180 + t * 180);
    svg += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="var(--text)"/>`;
  }
  const lx = [24, 108, 188];
  order.forEach((k, i) => {
    svg += `<circle cx="${lx[i]}" cy="118" r="4" fill="${AN_SWARA_COLORS[k]}"/>`;
    svg += `<text x="${lx[i] + 9}" y="122" fill="var(--text-muted)" font-size="10">${escHtml(translateSwaraNadi(capitalize(k)))} ${localizeNumber(anNum(counts[k]))}</text>`;
  });
  $('an-swara-gauge').innerHTML = svg;
}

function drawDepthMeter(eps, summary) {
  const counts = {}; AN_DEPTH_ORDER.forEach(d => counts[d] = 0);
  let n = 0;
  (eps || []).forEach(e => { const d = e.contemplativeDepth; if (d != null && counts[d] !== undefined) { counts[d]++; n++; } });
  const x0 = 12, w = 216, y = 34, h = 22;
  let svg = '';
  if (n > 0) {
    let x = x0;
    AN_DEPTH_ORDER.forEach(d => { const segW = counts[d] / n * w; if (segW > 0) { svg += `<rect x="${x.toFixed(1)}" y="${y}" width="${segW.toFixed(1)}" height="${h}" fill="${AN_DEPTH_COLORS[d]}"/>`; x += segW; } });
  } else {
    svg += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="var(--bg-card-2)"/>`;
    svg += `<text x="120" y="${y + h / 2 + 4}" fill="var(--text-muted)" font-size="11" text-anchor="middle">${escHtml(t('noDepthData'))}</text>`;
  }
  ['Surface', 'Emerging', 'Deep', 'Profound'].forEach(dp => { const tx = x0 + (DEPTH_PCT[dp] / 100) * w; svg += `<text x="${tx.toFixed(1)}" y="${y + h + 16}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${escHtml(translateDepth(dp))}</text>`; });
  const domDepth = CHITTA_DEPTHS[summary.dominantState];
  if (domDepth && DEPTH_PCT[domDepth] != null) {
    const mx = x0 + (DEPTH_PCT[domDepth] / 100) * w;
    svg += `<polygon points="${mx.toFixed(1)},${y - 5} ${(mx - 5).toFixed(1)},${y - 13} ${(mx + 5).toFixed(1)},${y - 13}" fill="var(--text)"/>`;
    svg += `<text x="${mx.toFixed(1)}" y="${y - 17}" fill="var(--text)" font-size="9" font-weight="600" text-anchor="middle">${escHtml(translateDepth(domDepth))}</text>`;
  }
  $('an-depth-meter').innerHTML = svg;
}

function drawSensorSchematic(avgBands) {
  const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  let dom = 'alpha', max = -1;
  bands.forEach(b => { const v = anNum(avgBands[b]); if (v > max) { max = v; dom = b; } });
  const col = AN_BAND_COLORS[dom], r = 48;
  let svg = `<circle cx="0" cy="0" r="${r}" fill="none" stroke="var(--border)" stroke-width="2"/>`;
  svg += `<polygon points="0,${-r - 10} -7,${-r} 7,${-r}" fill="none" stroke="var(--border)" stroke-width="2"/>`;
  const dots = { T3: [-34, -6], T4: [34, -6], O1: [-22, 34], O2: [22, 34] };
  Object.entries(dots).forEach(([lbl, [dx, dy]]) => {
    svg += `<circle cx="${dx}" cy="${dy}" r="9" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2"/>`;
    svg += `<text x="${dx}" y="${dy + 3}" fill="var(--text)" font-size="8" font-weight="700" text-anchor="middle">${lbl}</text>`;
  });
  svg += `<text x="0" y="4" fill="${col}" font-size="10" font-weight="600" text-anchor="middle">${max >= 0 ? escHtml(tf('bandDominantTemplate', { band: t(BAND_NAME_KEYS[dom]) })) : escHtml(t('noBandData'))}</text>`;
  $('an-sensor').innerHTML = svg;
}

// ════════════════════════════════════════════════════════════════════════════
// P2 — HOME / COHORT / CLIENT VIEWS (backed by P1's clients endpoints).
// Everything is derived from real /clients + /sessions data — no fabricated KPIs.
// ════════════════════════════════════════════════════════════════════════════
let selectedClientId = null;

const CLIENT_STATUS = {
  plateau:  { get label() { return t('clientStatusPlateau'); }, cls: 'status--plateau' },
  progress: { get label() { return t('clientStatusProgress'); }, cls: 'status--progress' },
  issue:    { get label() { return t('clientStatusIssue'); },    cls: 'status--issue' },
  new:      { get label() { return t('clientStatusNew'); },      cls: 'status--new' },
};

function monthsSince(iso) {
  if (!iso) return '';
  const then = new Date(iso), now = new Date();
  let m = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  m = Math.max(0, m);
  if (m < 1) return t('monthsPracticingLt1');
  if (m < 12) return tf('monthsPracticing', { m, s: m === 1 ? '' : 's' });
  return tf('yearsMonthsPracticing', { y: Math.floor(m / 12), m: m % 12 });
}
function isAttention(c) {
  if (c.status === 'issue' || c.status === 'plateau') return true;
  if (!c.lastSessionAt) return false;
  return (Date.now() - new Date(c.lastSessionAt).getTime()) > 14 * 864e5;
}

// One delegated handler for cohort tiles → client, and session rows/dots → replay.
document.addEventListener('click', e => {
  const sessionEl = e.target.closest('[data-session-id]');
  if (sessionEl) { pendingReplaySessionId = sessionEl.dataset.sessionId; showView('replay'); return; }
  const clientEl = e.target.closest('[data-client-id]');
  if (clientEl) { selectedClientId = clientEl.dataset.clientId; showView('client'); }
});

// ── Home ("This Week") ──
async function onShowHome() {
  try {
    const [clients, sessions] = await Promise.all([
      api('GET', '/clients'),
      api('GET', '/sessions/mine').catch(() => []),
    ]);
    sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    renderHomeKpis(clients, sessions);
    renderHomeAttention(clients);
    renderHomeRecent(sessions, clients);
  } catch (e) { showToast(e.message); }
}
function renderHomeKpis(clients, sessions) {
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = sessions.filter(s => new Date(s.startTime).getTime() >= weekAgo).length;
  const cells = [
    [t('kpiClients'), clients.length],
    [t('kpiSessionsThisWeek'), thisWeek],
    [t('kpiNeedsAttention'), clients.filter(isAttention).length],
    [t('kpiTotalSessions'), sessions.length],
  ];
  $('home-kpis').innerHTML = cells.map(([k, v]) =>
    `<div class="kpi"><span class="kpi__value">${localizeNumber(v)}</span><span class="kpi__label">${k}</span></div>`).join('');
}
function renderHomeAttention(clients) {
  const el = $('home-attention'), flagged = clients.filter(isAttention);
  if (!flagged.length) { el.innerHTML = `<div class="empty-state">${escHtml(t('allClientsOnTrack'))}</div>`; return; }
  el.innerHTML = flagged.map(c => {
    const st = CLIENT_STATUS[c.status];
    const reason = (c.status === 'issue' || c.status === 'plateau') && st ? st.label : t('noRecentSession');
    return `<button class="hub-row" data-client-id="${c.id}"><span class="hub-row__name">${escHtml(c.name)}</span><span class="hub-row__meta">${escHtml(reason)}</span></button>`;
  }).join('');
}
function renderHomeRecent(sessions, clients) {
  const el = $('home-recent');
  if (!sessions.length) { el.innerHTML = `<div class="empty-state">${escHtml(t('homeNoSessionsYet'))}</div>`; return; }
  const byId = Object.fromEntries(clients.map(c => [String(c.id), c.name]));
  el.innerHTML = sessions.slice(0, 8).map(s => {
    const cn = s.clientId != null ? (byId[String(s.clientId)] || t('unknownClientLabel')) : t('unassignedLabel');
    return `<button class="hub-row" data-session-id="${s.id}"><span class="hub-row__name">${escHtml(s.name)}</span><span class="hub-row__meta">${escHtml(cn)} · ${formatDate(s.startTime)}</span></button>`;
  }).join('');
}

// ── Cohort grid ──
async function onShowCohort() {
  const grid = $('cohort-grid');
  try {
    const clients = await api('GET', '/clients');
    $('cohort-title').textContent = tf('cohortTitleWithCount', { n: localizeNumber(clients.length), s: clients.length === 1 ? '' : 's' });
    if (!clients.length) { grid.innerHTML = `<div class="empty-state">${escHtml(t('noClientsYetHint'))}</div>`; return; }
    grid.innerHTML = clients.map(renderClientTile).join('');
  } catch (e) { grid.innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`; }
}
function renderClientTile(c) {
  const st = CLIENT_STATUS[c.status];
  const last = c.lastSessionAt ? formatDate(c.lastSessionAt) : t('noSessionsYetLower');
  const n = c.sessionsCount ?? 0;
  return `<button class="client-tile" data-client-id="${c.id}">
    <div class="client-tile__top"><span class="client-tile__name">${escHtml(c.name)}</span>${st ? `<span class="client-status ${st.cls}">${escHtml(st.label)}</span>` : ''}</div>
    <div class="client-tile__meta">${tf('sessionCountTemplate', { n: localizeNumber(n), s: n === 1 ? '' : 's' })} · ${last}</div>
    ${c.protocol ? `<div class="client-tile__protocol">${escHtml(c.protocol)}</div>` : ''}
  </button>`;
}

// ── Client profile ──
async function onShowClient() {
  const empty = $('client-empty'), body = $('client-body');
  if (!selectedClientId) { empty.style.display = ''; empty.textContent = t('clientEmptyState'); body.style.display = 'none'; return; }
  try {
    const [c, sessions] = await Promise.all([
      api('GET', '/clients/' + selectedClientId),
      api('GET', '/clients/' + selectedClientId + '/sessions').catch(() => []),
    ]);
    empty.style.display = 'none'; body.style.display = '';
    renderClientHeader(c);
    renderClientStats(c);
    renderClientDots(sessions);
    renderClientSessions(sessions);
    renderClientReco(c);
    renderClientNotes(c);
  } catch (e) {
    empty.style.display = ''; body.style.display = 'none';
    empty.textContent = t('couldNotLoadClient') + e.message;
  }
}
function renderClientHeader(c) {
  $('client-name').textContent = c.name;
  const bits = [];
  if (c.age != null) bits.push(localizeNumber(c.age) + t('yrsSuffix'));
  if (c.practicingSince) bits.push(monthsSince(c.practicingSince));
  const st = CLIENT_STATUS[c.status];
  if (st) bits.push(st.label);
  $('client-meta').innerHTML = bits.map(escHtml).join(' · ');
}
function renderClientStats(c) {
  const cells = [
    [t('statSessions'), c.sessionsCount ?? 0],
    [t('statLastSession'), c.lastSessionAt ? formatDate(c.lastSessionAt) : '—'],
    [t('statProtocolSince'), c.protocolSince ? formatDate(c.protocolSince) : '—'],
  ];
  $('client-stats').innerHTML = cells.map(([k, v]) =>
    `<div class="stat"><span class="stat__label">${k}</span><span class="stat__value">${escHtml(typeof v === 'number' ? localizeNumber(v) : String(v))}</span></div>`).join('');
}
function renderClientDots(sessions) {
  const el = $('client-dots');
  if (!sessions.length) { el.innerHTML = `<div class="empty-state">${escHtml(t('noSessionsRecordedClient'))}</div>`; return; }
  const maxDur = Math.max(...sessions.map(s => s.duration || 0), 1);
  el.innerHTML = sessions.slice().reverse().map(s => {
    const d = s.duration || 0, size = 14 + Math.round((d / maxDur) * 22);
    return `<button class="timeline-dot" data-session-id="${s.id}" title="${escHtml(s.name)} · ${d ? formatDuration(d) : t('inProgressLabel')}" style="width:${size}px;height:${size}px"></button>`;
  }).join('');
}
function renderClientSessions(sessions) {
  const el = $('client-sessions');
  if (!sessions.length) { el.innerHTML = `<div class="empty-state">${escHtml(t('noSessionsYet'))}</div>`; return; }
  el.innerHTML = sessions.map(s =>
    `<button class="hub-row" data-session-id="${s.id}"><span class="hub-row__name">${escHtml(s.name)}</span><span class="hub-row__meta">${formatDate(s.startTime)} · ${s.duration ? formatDuration(s.duration) : '—'}</span></button>`).join('');
}
function renderClientReco(c) {
  const el = $('client-reco');
  if (!c.protocol && !c.goal) { el.innerHTML = `<div class="empty-state">${escHtml(t('noProtocolSet'))}</div>`; return; }
  el.innerHTML = (c.protocol ? `<div class="reco__protocol">${escHtml(c.protocol)}</div>` : '') +
    (c.goal ? `<div class="reco__goal">${escHtml(t('goalPrefix'))}${escHtml(c.goal)}</div>` : '');
}
function renderClientNotes(c) {
  $('client-notes').innerHTML = c.notes && c.notes.trim()
    ? escHtml(c.notes).replace(/\n/g, '<br>')
    : `<div class="empty-state">${escHtml(t('noNotesYet'))}</div>`;
}

// ── Add / edit / back actions ──
$('btn-add-client').addEventListener('click', async () => {
  const name = prompt(t('newClientNamePrompt'));
  if (!name || !name.trim()) return;
  try {
    await api('POST', '/clients', { name: name.trim() });
    showToast(t('clientAddedToast'));
    loadClientOptions();
    onShowCohort();
  } catch (e) { showToast(e.message); }
});
$('btn-back-cohort').addEventListener('click', () => showView('cohort'));
$('btn-edit-client').addEventListener('click', async () => {
  if (!selectedClientId) return;
  const protocol = prompt(t('protocolPrompt'));
  if (protocol === null) return;
  const notes = prompt(t('notesPrompt'));
  if (notes === null) return;
  const body = {};
  if (protocol !== '') body.protocol = protocol;
  if (notes !== '') body.notes = notes;
  if (!Object.keys(body).length) return;
  try { await api('PUT', '/clients/' + selectedClientId, body); showToast(t('toastSaved')); onShowClient(); }
  catch (e) { showToast(e.message); }
});
