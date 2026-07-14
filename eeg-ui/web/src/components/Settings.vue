<script setup>
// Settings overlay — backend (.NET analyser) URL configuration. Ported from
// legacy app.js's btn-settings/btn-test/btn-save handlers + index.html's
// #settings-overlay. This is the ONLY way to change the backend URL Monitor.vue
// uses (localStorage 'controlhub_url') — without it there was no UI path to
// point the app at a non-default analyser deployment.
import { ref } from 'vue';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const open = ref(false);
const urlInput = ref(localStorage.getItem('controlhub_url') || '');
const testMsg = ref('');
const testColor = ref('');
const testing = ref(false);

function openModal() {
  urlInput.value = localStorage.getItem('controlhub_url') || '';
  testMsg.value = '';
  open.value = true;
}
function closeModal() { open.value = false; }
function onOverlayClick(e) { if (e.target === e.currentTarget) closeModal(); }

async function testConnection() {
  const url = urlInput.value.trim().replace(/\/$/, '');
  if (!url) { alert(t('alertEnterUrl')); return; }
  testing.value = true;
  testColor.value = 'muted';
  testMsg.value = t('testingEllipsis');
  try {
    const res = await fetch(url + '/status', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    testColor.value = 'ok';
    testMsg.value = t('connectedBoardPrefix') + (data.board || 'web-bluetooth') + (data.model_ready ? t('modelReadySuffix') : t('modelLoadingSuffix'));
  } catch (e) {
    testColor.value = 'err';
    testMsg.value = '✗ ' + (e.message || t('connectionFailed'));
  } finally {
    testing.value = false;
  }
}

// Saving changes the URL Monitor.vue reads at mount time (a plain localStorage
// read, not a reactive store) — reload so the new value takes effect immediately
// rather than silently keeping the old connection until the next manual refresh.
function saveAndConnect() {
  const url = urlInput.value.trim().replace(/\/$/, '');
  if (!url) { alert(t('alertEnterUrl')); return; }
  localStorage.setItem('controlhub_url', url);
  closeModal();
  window.location.reload();
}
</script>

<template>
  <button class="btn btn-ghost settings-trigger" :title="t('settingsTitle')" @click="openModal">⚙</button>

  <div v-if="open" class="settings-overlay open" @click="onOverlayClick">
    <div class="settings-panel">
      <div class="settings-header">
        <span class="settings-title">{{ t('settingsTitle') }}</span>
        <button class="btn btn-ghost" @click="closeModal">✕</button>
      </div>

      <!-- Bluetooth -->
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settingsBluetoothTitle') }}</div>
        <p class="settings-note">{{ t('settingsBtNote') }}</p>
      </div>

      <!-- Backend URL -->
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settingsBackendTitle') }}</div>
        <div class="settings-field">
          <label class="field-label" for="input-backend-url">{{ t('settingsBackendUrlLabel') }}</label>
          <input id="input-backend-url" v-model="urlInput" class="field-input" type="url" placeholder="http://localhost:5094" />
        </div>
        <p class="settings-note">{{ t('settingsBackendNote') }}</p>
        <div class="settings-actions">
          <button class="btn btn-ghost btn-sm" :disabled="testing" @click="testConnection">{{ t('settingsTestConn') }}</button>
          <button class="btn btn-primary btn-sm" @click="saveAndConnect">{{ t('settingsSaveConn') }}</button>
        </div>
        <div v-if="testMsg" class="test-msg" :class="testColor">{{ testMsg }}</div>
      </div>

      <!-- API reference -->
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settingsRawEndpointTitle') }}</div>
        <pre class="settings-code">POST /analyze
{
  "eeg_data": [[ch0_s0, ch0_s1, ...], [ch1_s0, ...]],
  "sample_rate": 256
}</pre>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settingsBandsEndpointTitle') }}</div>
        <pre class="settings-code">POST /analyze/bands
{ "delta": 0.12, "theta": 0.22, "alpha": 0.41,
  "beta": 0.18, "gamma": 0.07 }</pre>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">{{ t('settingsResponseTitle') }}</div>
        <pre class="settings-code">{
  "chitta_bhumi": { "state": "Ekagra", "confidence": "82.4%" },
  "swara":        { "state": "Ida (Parasympathetic)" },
  "tattva":       ["Pratyahara Window detected"],
  "depth":        "Deep",
  "eeg_spectrum": { "alpha": 41.2, "theta": 28.0, ... },
  "gunas":        { "sattva": 0.52, "rajas": 0.31, "tamas": 0.17,
                    "label": "Sattvic" }
}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-trigger { font-size: 16px; }

.settings-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1150;
  display: flex; align-items: flex-start; justify-content: flex-end;
  padding: 0;
}
.settings-panel {
  background: var(--bg-card); border-left: 1px solid var(--border);
  width: 100%; max-width: 420px; height: 100vh; overflow-y: auto;
  padding: 20px 22px; box-shadow: -8px 0 32px rgba(0,0,0,0.15);
}
.settings-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.settings-title { font-family: var(--font-serif); font-size: 17px; color: var(--text); text-transform: capitalize; }
.settings-section { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid var(--border-light); }
.settings-section:last-child { border-bottom: none; }
.settings-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 10px; }
.settings-note { font-size: 12.5px; color: var(--text-mid); line-height: 1.55; margin: 8px 0 0; }
.settings-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-mid); }
.field-input { padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 13px; font-family: var(--font); }
.field-input:focus { outline: none; border-color: var(--accent); }
.settings-actions { display: flex; gap: 8px; margin-top: 10px; }
.test-msg { font-size: 12px; margin-top: 8px; }
.test-msg.muted { color: var(--text-muted); }
.test-msg.ok { color: #56A67A; }
.test-msg.err { color: #C75C5C; }
.settings-code { font-size: 11px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; overflow-x: auto; color: var(--text-mid); line-height: 1.5; white-space: pre; }
</style>
