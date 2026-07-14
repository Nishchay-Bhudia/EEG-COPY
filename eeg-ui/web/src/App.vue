<script setup>
// App shell: left sidebar nav + main <router-view/> region.
// Mirrors the legacy .app-shell / .sidebar structure from index.html.
// Nav items map 1:1 to the legacy [data-nav] buttons and their router paths.
import { computed, onMounted, reactive, ref } from 'vue';
import { auth, loadAuth, isElevated, isAdmin, login, logout } from '@/lib/auth';
import { useI18n } from '@/composables/useI18n';
import AiBaba from '@/components/AiBaba.vue';
import Settings from '@/components/Settings.vue';
import { useToast } from '@/composables/useToast';

const { lang, setLang, t } = useI18n();
const { message: toastMessage, visible: toastVisible } = useToast();

// Role model: superadmin (admin) creates instructors; instructors (co-admin)
// admin students; students (user) only sit. Teaching views are instructor-tier;
// a student's sidebar is just the Monitor + Replay of their own sittings.
const navItems = [
  { to: '/monitor', ico: '📡', labelKey: 'navLiveMonitor' },
  { to: '/watch', ico: '👁', labelKey: 'navWatchLive', elevated: true },
  { to: '/home', ico: '◇', labelKey: 'navThisWeek', elevated: true },
  { to: '/cohort', ico: '◎', labelKey: 'navCohort', elevated: true },
  { to: '/client', ico: '○', labelKey: 'navClients', elevated: true },
  { to: '/replay', ico: '↺', labelKey: 'navReplay' },
  { to: '/analyze', ico: '◈', labelKey: 'navAnalyze', elevated: true },
  { to: '/prescribe', ico: '✎', labelKey: 'navPrescribe', elevated: true },
  { to: '/practices', ico: '☸', labelKey: 'navPractices', admin: true },
  { to: '/users', ico: '👥', labelKey: 'navUsers', admin: true },
];

const visibleNav = computed(() => navItems.filter((i) => {
  if (i.admin) return isAdmin();
  if (i.elevated) return isElevated();
  return true;
}));

// ── Login gate ──────────────────────────────────────────────────────────────
const form = reactive({ username: '', password: '' });
const loginError = ref('');
const submitting = ref(false);

async function submitLogin() {
  if (submitting.value) return;
  submitting.value = true;
  loginError.value = '';
  try {
    await login(form.username.trim(), form.password);
    form.password = '';
  } catch (e) {
    loginError.value = e.message || t('loginFailed');
  } finally {
    submitting.value = false;
  }
}

async function signOut() {
  await logout();
}

onMounted(loadAuth);
</script>

<template>
  <!-- ─ Language switcher — fixed top-right, above everything (login screen
       included) so it's reachable before and after auth. ─ -->
  <div class="lang-switcher">
    <button type="button" class="lang-btn" :class="{ 'lang-btn--active': lang === 'en' }" @click="setLang('en')">ENG</button>
    <button type="button" class="lang-btn" :class="{ 'lang-btn--active': lang === 'gu' }" @click="setLang('gu')">ગુજ</button>
  </div>

  <!-- ─ Loading auth ─ -->
  <div v-if="!auth.loaded" class="auth-splash">{{ t('loading') }}</div>

  <!-- ─ Login gate ─ -->
  <div v-else-if="!auth.user" class="auth-gate">
    <form class="auth-card" @submit.prevent="submitLogin">
      <div class="auth-brand">{{ t('brandName') }}</div>
      <p class="auth-tagline">{{ t('signIn') }}</p>
      <input v-model="form.username" class="auth-input" type="text" :placeholder="t('username')" autocomplete="username" autofocus />
      <input v-model="form.password" class="auth-input" type="password" :placeholder="t('password')" autocomplete="current-password" />
      <div v-if="loginError" class="auth-error">{{ loginError }}</div>
      <button class="auth-submit" type="submit" :disabled="submitting">{{ submitting ? t('signingIn') : t('signIn') }}</button>
    </form>
  </div>

  <!-- ─ App ─ -->
  <div v-else class="app-shell">
    <!-- ─ Sidebar navigation ─ -->
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-icon">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="30" stroke="currentColor" stroke-width="2.5" />
            <path
              d="M10 32 Q16 20 22 32 Q28 44 34 32 Q40 20 46 32 Q52 44 54 32"
              stroke="currentColor" stroke-width="2.5" fill="none"
              stroke-linecap="round" stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="sidebar__brand-text">
          <span class="sidebar__brand-name">{{ t('brandName') }}</span>
          <span class="sidebar__brand-sub">{{ t('brandSub') }}</span>
        </div>
      </div>

      <nav class="nav" aria-label="Primary">
        <router-link
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="nav__item"
          active-class="is-active"
        >
          <span class="nav__ico">{{ item.ico }}</span>
          <span class="nav__label">{{ item.labelKey ? t(item.labelKey) : item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar__footer">
        <div class="sidebar__tools">
          <AiBaba />
          <Settings />
        </div>
        <div class="sidebar__user">
          <span class="sidebar__user-name">{{ auth.user.username }}</span>
          <span class="sidebar__user-role">{{ auth.user.role }}</span>
        </div>
        <button class="sidebar__signout" @click="signOut">{{ t('signOut') }}</button>
      </div>
    </aside>

    <!-- ─ Main region ─ -->
    <div class="app-main">
      <div class="view-container">
        <router-view />
      </div>
    </div>
  </div>

  <div id="toast" class="toast" :class="{ 'is-show': toastVisible }" role="status" aria-live="polite">{{ toastMessage }}</div>
</template>

<style scoped>
/* Ported from the legacy .app-shell / .sidebar / .nav rules in style.css. */

/* ─── Language selector — fixed top-right, above everything (login screen
   included) so it's reachable before and after auth. ─── */
.lang-switcher {
  position: fixed; top: 14px; right: 16px; z-index: 1200;
  display: flex; gap: 2px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
  box-shadow: var(--shadow-lg);
}
.lang-btn {
  border: none; background: transparent; cursor: pointer;
  font-family: var(--font); font-size: 12px; font-weight: 600;
  padding: 6px 12px; border-radius: calc(var(--radius-sm) - 3px);
  color: var(--text-mid);
  transition: background 0.15s, color 0.15s;
}
.lang-btn:hover { background: var(--bg-card-2); }
.lang-btn--active { background: var(--accent); color: #fff; }

.app-shell { display: flex; min-height: 100vh; align-items: stretch; }
.app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; }
/* Consistent breathing room around every routed view (was the legacy .main-content padding). */
.view-container { padding: 28px 32px 48px; max-width: 1280px; width: 100%; margin: 0 auto; }
@media (max-width: 640px) { .view-container { padding: 20px 16px 40px; } }

.sidebar {
  width: 232px; flex-shrink: 0;
  background: var(--bg);
  border-right: 1px solid var(--border-light);
  display: flex; flex-direction: column;
  padding: 20px 14px;
  position: sticky; top: 0; height: 100vh;
}
.sidebar__brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; }
.sidebar__brand-icon { width: 30px; height: 30px; color: var(--accent); flex-shrink: 0; }
.sidebar__brand-icon svg { width: 100%; height: 100%; }
.sidebar__brand-text { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.sidebar__brand-name { font-family: var(--font-serif); font-size: 15px; color: var(--text); letter-spacing: -0.01em; }
.sidebar__brand-sub { font-size: 10.5px; color: var(--text-muted); font-style: italic; }
.sidebar__footer { margin-top: auto; padding: 12px 8px 4px; border-top: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 8px; }
.sidebar__tools { display: flex; align-items: center; gap: 8px; }
.sidebar__tools :deep(.btn-ai-baba) { flex: 1; }
.sidebar__user { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.sidebar__user-name { font-size: 12.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar__user-role { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.sidebar__signout { align-self: flex-start; padding: 4px 8px; font-size: 11px; color: var(--text-mid); background: transparent; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
.sidebar__signout:hover { background: var(--bg-card-2); color: var(--text); }

/* ─── Auth splash + login gate ─── */
.auth-splash { display: grid; place-items: center; min-height: 100vh; color: var(--text-muted); font-size: 14px; }
.auth-gate { display: grid; place-items: center; min-height: 100vh; padding: 24px; }
.auth-card { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 320px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 28px 24px; box-shadow: var(--shadow-sm); }
.auth-brand { font-family: var(--font-serif); font-size: 20px; color: var(--text); letter-spacing: -0.01em; }
.auth-tagline { font-size: 13px; color: var(--text-muted); margin: -6px 0 6px; }
.auth-input { padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 14px; font-family: var(--font); }
.auth-input:focus { outline: none; border-color: var(--accent); }
.auth-error { font-size: 12.5px; color: #C75C5C; }
.auth-submit { padding: 10px 14px; border: none; border-radius: var(--radius-sm); background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s, opacity 0.15s; }
.auth-submit:hover { background: #C4673E; }
.auth-submit:disabled { opacity: 0.6; cursor: default; }

.nav { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.nav__item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 12px;
  border: none; background: none; border-radius: var(--radius-sm);
  font-family: var(--font); font-size: 13.5px; color: var(--text-mid);
  cursor: pointer; text-align: left; text-decoration: none;
  transition: background 0.12s, color 0.12s;
}
.nav__item:hover { background: var(--bg-card-2); color: var(--text); }
.nav__item.is-active { background: var(--bg-card); color: var(--text); box-shadow: var(--shadow-sm); }
.nav__item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.nav__ico { width: 18px; text-align: center; font-size: 13px; opacity: 0.75; flex-shrink: 0; }
.nav__item.is-active .nav__ico { color: var(--accent); opacity: 1; }
.nav__label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Sidebar collapses to icons on narrow screens. */
@media (max-width: 900px) {
  .sidebar { width: 60px; padding: 16px 8px; }
  .sidebar__brand-text, .nav__label, .sidebar__badge { display: none; }
  .sidebar__brand { justify-content: center; padding: 4px 0 16px; }
  .nav__item { justify-content: center; padding: 10px 0; }
  .nav__ico { width: auto; font-size: 15px; }
}
</style>
