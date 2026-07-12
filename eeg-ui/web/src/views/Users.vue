<script setup>
// User management view (superadmin only). Ports the legacy admin user panel
// from app.js: list accounts, provision instructors and students, change a
// role, reset a password, delete an account. The router guard (meta.adminOnly)
// keeps non-admins out; the backend enforces requireAdmin regardless.
//
// Role vocabulary (see the role model): 'admin' = superadmin (global),
// 'co-admin' = instructor (owns their clients/students), 'user' = student.
import { reactive, ref, onMounted } from 'vue';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { formatDate } from '@/lib/clients';

const ROLE_OPTIONS = [
  { value: 'user', label: 'Student (user)' },
  { value: 'co-admin', label: 'Instructor (co-admin)' },
  { value: 'admin', label: 'Superadmin (admin)' },
];
const ROLE_LABEL = { user: 'Student', 'co-admin': 'Instructor', admin: 'Superadmin' };

const users = ref([]);
const error = ref('');
const loading = ref(false);

async function load() {
  error.value = '';
  loading.value = true;
  try {
    const rows = await api('GET', '/users');
    users.value = Array.isArray(rows) ? rows : [];
  } catch (e) {
    error.value = 'Could not load users: ' + e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── Create (instructor provisioning) ─────────────────────────────────────────
const form = reactive({ username: '', password: '', role: 'co-admin' });
const creating = ref(false);
const formError = ref('');

async function createUser() {
  if (creating.value) return;
  formError.value = '';
  const username = form.username.trim();
  if (!username) { formError.value = 'Username is required.'; return; }
  if (form.password.length < 6) { formError.value = 'Password must be at least 6 characters.'; return; }
  creating.value = true;
  try {
    await api('POST', '/users', { username, password: form.password, role: form.role });
    form.username = '';
    form.password = '';
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    creating.value = false;
  }
}

// ── Per-row actions ──────────────────────────────────────────────────────────
function isSelf(u) {
  return auth.user && u.id === auth.user.id;
}

async function changeRole(u, role) {
  if (role === u.role) return;
  let failure = '';
  try {
    await api('PUT', '/users/' + u.id + '/role', { role });
  } catch (e) {
    failure = e.message;
  }
  await load(); // re-sync the list either way (reverts the select on failure)
  if (failure) error.value = failure;
}

// Inline reset — an explicit field + Save so a password is only committed when
// you click, never on a stray Enter or mid-typing.
const resettingId = ref(null);
const resetValue = ref('');
const resetError = ref('');
const resetSaving = ref(false);
const resetDone = ref(null);

function openReset(u) {
  resettingId.value = u.id;
  resetValue.value = '';
  resetError.value = '';
  resetDone.value = null;
}
function cancelReset() {
  resettingId.value = null;
  resetValue.value = '';
  resetError.value = '';
}
async function saveReset(u) {
  if (resetSaving.value) return;
  resetError.value = '';
  if (resetValue.value.length < 6) { resetError.value = 'At least 6 characters.'; return; }
  resetSaving.value = true;
  try {
    await api('PUT', '/users/' + u.id + '/password', { password: resetValue.value });
    resettingId.value = null;
    resetValue.value = '';
    resetDone.value = u.id;
    setTimeout(() => { if (resetDone.value === u.id) resetDone.value = null; }, 3000);
  } catch (e) {
    resetError.value = e.message;
  } finally {
    resetSaving.value = false;
  }
}

async function deleteUser(u) {
  if (!confirm(`Delete account "${u.username}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', '/users/' + u.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <section class="view-users">
    <div class="view-header">
      <div>
        <h2 class="view-title">Users</h2>
        <div class="view-sub">Provision instructors and manage every account (superadmin only).</div>
      </div>
    </div>

    <!-- ─ Create form (instructor provisioning) ─ -->
    <div class="card create-card">
      <div class="card-label">CREATE ACCOUNT</div>
      <form class="create-form" @submit.prevent="createUser">
        <input v-model="form.username" class="field" type="text" placeholder="Username" autocomplete="off" />
        <input v-model="form.password" class="field" type="password" placeholder="Password" autocomplete="new-password" />
        <select v-model="form.role" class="field field--select" aria-label="Role">
          <option v-for="r in ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
        <button class="btn btn-primary" type="submit" :disabled="creating">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </form>
      <div v-if="formError" class="form-error">{{ formError }}</div>
      <div class="hint">Instructors (co-admin) manage their own clients and student logins; students (user) only sign in and sit. Creating a student here also adds a linked client record to your cohort.</div>
    </div>

    <!-- ─ User list ─ -->
    <div class="card">
      <div class="card-label">ALL ACCOUNTS</div>
      <div v-if="error" class="empty-state">{{ error }}</div>
      <div v-else-if="loading" class="empty-state">Loading…</div>
      <div v-else-if="!users.length" class="empty-state">No accounts yet.</div>
      <div v-else class="user-list">
        <div v-for="u in users" :key="u.id" class="user-row">
          <div class="user-row__id">
            <span class="user-row__name">{{ u.username }}</span>
            <span class="user-row__meta">
              {{ ROLE_LABEL[u.role] || u.role }} · created {{ formatDate(u.createdAt) }}
              <template v-if="isSelf(u)"> · you</template>
            </span>
          </div>
          <div class="user-row__actions">
            <select
              class="field field--select field--sm"
              :value="u.role"
              :disabled="isSelf(u)"
              :title="isSelf(u) ? 'You cannot change your own role' : 'Change role'"
              aria-label="Role"
              @change="changeRole(u, $event.target.value)"
            >
              <option v-for="r in ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>

            <!-- Inline reset: type the whole password, then click Save. -->
            <template v-if="resettingId === u.id">
              <input
                v-model="resetValue" class="field field--sm" type="password"
                placeholder="New password (min 6)" autocomplete="new-password"
                @keydown.enter.prevent="saveReset(u)" @keydown.esc="cancelReset"
              />
              <button class="btn btn-primary btn-sm" :disabled="resetSaving" @click="saveReset(u)">
                {{ resetSaving ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn btn-ghost btn-sm" @click="cancelReset">Cancel</button>
              <span v-if="resetError" class="reset-error">{{ resetError }}</span>
            </template>
            <template v-else>
              <button class="btn btn-ghost btn-sm" @click="openReset(u)">
                {{ resetDone === u.id ? '✓ Password set' : 'Reset password' }}
              </button>
            </template>

            <button
              class="btn btn-ghost btn-sm btn-danger"
              :disabled="isSelf(u)"
              :title="isSelf(u) ? 'You cannot delete your own account' : 'Delete account'"
              @click="deleteUser(u)"
            >Delete</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Same visual language as Client.vue / Cohort.vue — tokens from @/styles/tokens.css. */
.view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view-title { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.01em; }
.view-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
.create-card { margin-bottom: 16px; }

.create-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.field { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 13px; font-family: var(--font); }
.field:focus { outline: none; border-color: var(--accent); }
.field--select { cursor: pointer; }
.field--sm { padding: 5px 8px; font-size: 12px; }
.form-error { font-size: 12.5px; color: #C75C5C; margin-top: 8px; }
.reset-error { font-size: 12px; color: #C75C5C; align-self: center; }
.hint { font-size: 12px; color: var(--text-muted); margin-top: 12px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 13px; font-family: var(--font); font-weight: 500; transition: background 0.15s, opacity 0.15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #C4673E; }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.btn-ghost { background: transparent; color: var(--text-mid); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--bg-card-2); }
.btn-ghost:disabled { opacity: 0.45; cursor: default; }
.btn-ghost:disabled:hover { background: transparent; }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-danger { color: #C75C5C; border-color: color-mix(in srgb, #C75C5C 40%, var(--border)); }
.btn-danger:hover:not(:disabled) { background: color-mix(in srgb, #C75C5C 10%, transparent); }

.empty-state { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }

.user-list { display: flex; flex-direction: column; gap: 2px; }
.user-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: var(--radius-sm); transition: background 0.15s; }
.user-row:hover { background: var(--bg-card-2); }
.user-row__id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.user-row__name { font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-row__meta { font-size: 12px; color: var(--text-muted); }
.user-row__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }

@media (max-width: 640px) {
  .user-row { flex-direction: column; align-items: stretch; }
  .user-row__actions { justify-content: flex-start; }
}
</style>
