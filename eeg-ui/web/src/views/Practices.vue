<script setup>
// Practices management view (superadmin only). CRUD over the activity_types
// vocabulary that populates the session "practice" picker in the Live Monitor.
// The router guard (meta.adminOnly) keeps non-admins out; the backend enforces
// requireAdmin regardless. Archived practices stay out of the picker but keep
// historical sessions' labels intact (session.activity is stored as text).
import { reactive, ref, onMounted } from 'vue';
import { api } from '@/lib/api';

const activities = ref([]);
const error = ref('');
const loading = ref(false);

async function load() {
  error.value = '';
  loading.value = true;
  try {
    // all=true → include archived so the admin can restore/delete them.
    const rows = await api('GET', '/activities?all=true');
    activities.value = Array.isArray(rows) ? rows : [];
  } catch (e) {
    error.value = 'Could not load practices: ' + e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── Create ───────────────────────────────────────────────────────────────────
const form = reactive({ name: '' });
const creating = ref(false);
const formError = ref('');

async function createActivity() {
  if (creating.value) return;
  formError.value = '';
  const name = form.name.trim();
  if (!name) { formError.value = 'Practice name is required.'; return; }
  creating.value = true;
  try {
    await api('POST', '/activities', { name });
    form.name = '';
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    creating.value = false;
  }
}

// ── Inline rename ─────────────────────────────────────────────────────────────
const editingId = ref(null);
const editValue = ref('');
const editError = ref('');

function openEdit(a) {
  editingId.value = a.id;
  editValue.value = a.name;
  editError.value = '';
}
function cancelEdit() {
  editingId.value = null;
  editValue.value = '';
  editError.value = '';
}
async function saveEdit(a) {
  editError.value = '';
  const name = editValue.value.trim();
  if (!name) { editError.value = 'Name required.'; return; }
  if (name === a.name) { cancelEdit(); return; }
  try {
    await api('PUT', '/activities/' + a.id, { name });
    cancelEdit();
    await load();
  } catch (e) {
    editError.value = e.message;
  }
}

// ── Reorder / archive / delete ────────────────────────────────────────────────
async function move(a, dir) {
  const idx = activities.value.findIndex((x) => x.id === a.id);
  const other = activities.value[idx + dir];
  if (!other) return;
  try {
    await Promise.all([
      api('PUT', '/activities/' + a.id, { sortOrder: other.sortOrder }),
      api('PUT', '/activities/' + other.id, { sortOrder: a.sortOrder }),
    ]);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function toggleArchive(a) {
  try {
    await api('PUT', '/activities/' + a.id, { archived: !a.archived });
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(a) {
  if (!confirm(`Delete practice "${a.name}"? Existing sessions keep their label; it just leaves the picker.`)) return;
  try {
    await api('DELETE', '/activities/' + a.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <section class="view-practices">
    <div class="view-header">
      <div>
        <h2 class="view-title">Practices</h2>
        <div class="view-sub">The vocabulary of contemplative practices offered when starting a sitting (superadmin only).</div>
      </div>
    </div>

    <!-- ─ Create ─ -->
    <div class="card create-card">
      <div class="card-label">ADD PRACTICE</div>
      <form class="create-form" @submit.prevent="createActivity">
        <input
          v-model="form.name" class="field field--grow" type="text"
          placeholder="e.g. Vipassanā, Kīrtan, Breath-count…" autocomplete="off"
        />
        <button class="btn btn-primary" type="submit" :disabled="creating">
          {{ creating ? 'Adding…' : 'Add' }}
        </button>
      </form>
      <div v-if="formError" class="form-error">{{ formError }}</div>
      <div class="hint">New practices appear at the bottom of the picker. Reorder with the arrows; archive to hide one from the picker without losing past sessions' labels.</div>
    </div>

    <!-- ─ List ─ -->
    <div class="card">
      <div class="card-label">ALL PRACTICES</div>
      <div v-if="error" class="empty-state">{{ error }}</div>
      <div v-else-if="loading" class="empty-state">Loading…</div>
      <div v-else-if="!activities.length" class="empty-state">No practices yet. Add the first above.</div>
      <div v-else class="row-list">
        <div v-for="(a, i) in activities" :key="a.id" class="row" :class="{ 'row--archived': a.archived }">
          <div class="row__reorder">
            <button class="reorder-btn" :disabled="i === 0" title="Move up" @click="move(a, -1)">▲</button>
            <button class="reorder-btn" :disabled="i === activities.length - 1" title="Move down" @click="move(a, 1)">▼</button>
          </div>

          <div class="row__id">
            <template v-if="editingId === a.id">
              <input
                v-model="editValue" class="field field--sm field--grow" type="text"
                @keydown.enter.prevent="saveEdit(a)" @keydown.esc="cancelEdit"
              />
              <span v-if="editError" class="inline-error">{{ editError }}</span>
            </template>
            <template v-else>
              <span class="row__name">{{ a.name }}</span>
              <span v-if="a.archived" class="row__badge">archived</span>
            </template>
          </div>

          <div class="row__actions">
            <template v-if="editingId === a.id">
              <button class="btn btn-primary btn-sm" @click="saveEdit(a)">Save</button>
              <button class="btn btn-ghost btn-sm" @click="cancelEdit">Cancel</button>
            </template>
            <template v-else>
              <button class="btn btn-ghost btn-sm" @click="openEdit(a)">Rename</button>
              <button class="btn btn-ghost btn-sm" @click="toggleArchive(a)">
                {{ a.archived ? 'Restore' : 'Archive' }}
              </button>
              <button class="btn btn-ghost btn-sm btn-danger" @click="remove(a)">Delete</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Same visual language as Users.vue — tokens from @/styles/tokens.css. */
.view-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.view-title { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.01em; }
.view-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
.create-card { margin-bottom: 16px; }

.create-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.field { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 13px; font-family: var(--font); }
.field:focus { outline: none; border-color: var(--accent); }
.field--grow { flex: 1 1 260px; min-width: 0; }
.field--sm { padding: 5px 8px; font-size: 12px; }
.form-error { font-size: 12.5px; color: #C75C5C; margin-top: 8px; }
.inline-error { font-size: 12px; color: #C75C5C; align-self: center; }
.hint { font-size: 12px; color: var(--text-muted); margin-top: 12px; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 13px; font-family: var(--font); font-weight: 500; transition: background 0.15s, opacity 0.15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #C4673E; }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.btn-ghost { background: transparent; color: var(--text-mid); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--bg-card-2); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn-danger { color: #C75C5C; border-color: color-mix(in srgb, #C75C5C 40%, var(--border)); }
.btn-danger:hover { background: color-mix(in srgb, #C75C5C 10%, transparent); }

.empty-state { padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }

.row-list { display: flex; flex-direction: column; gap: 2px; }
.row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: var(--radius-sm); transition: background 0.15s; }
.row:hover { background: var(--bg-card-2); }
.row--archived .row__name { color: var(--text-muted); text-decoration: line-through; }
.row__reorder { display: flex; flex-direction: column; gap: 1px; flex: none; }
.reorder-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 9px; line-height: 1; padding: 1px 3px; border-radius: 3px; }
.reorder-btn:hover:not(:disabled) { color: var(--accent); background: var(--border-light); }
.reorder-btn:disabled { opacity: 0.25; cursor: default; }
.row__id { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; }
.row__name { font-size: 13.5px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); background: var(--bg-card-2); padding: 2px 7px; border-radius: 20px; flex: none; }
.row__actions { display: flex; align-items: center; gap: 8px; flex: none; flex-wrap: wrap; justify-content: flex-end; }

@media (max-width: 640px) {
  .row { flex-wrap: wrap; }
  .row__actions { justify-content: flex-start; }
}
</style>
