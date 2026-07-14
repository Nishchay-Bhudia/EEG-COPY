<script setup>
// AI Baba — the GROQ-backed chat assistant that answers questions about a
// recorded session. Ported from the legacy app.js's aiBaba* functions +
// index.html's #ai-baba-overlay modal. Talks to the same shared backend
// endpoints (GET /ai/sessions, POST /ai/start, POST /ai/chat) used by the
// legacy frontend, so no backend changes were needed — this is purely the
// Vue-side UI that never existed here before.
import { ref, nextTick } from 'vue';
import { api } from '@/lib/api';
import { useI18n } from '@/composables/useI18n';

const { t, lang, localizeNumber } = useI18n();

const open = ref(false);
const step = ref('pick'); // 'pick' | 'loading' | 'chat'

const sessionsLoading = ref(false);
const sessions = ref([]);
const sessionsError = ref('');

const babaSessionId = ref(null);
const babaSessionName = ref('');
const messages = ref([]);   // [{ role: 'user'|'assistant', text, isError }]
const chatHistory = ref([]); // [{ role, content }] — sent back to /ai/chat for context
const typing = ref(false);
const sending = ref(false);
const inputText = ref('');
const messagesEl = ref(null);
const inputEl = ref(null);

function scrollToBottom() {
  nextTick(() => { if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight; });
}

function addMessage(role, text, isError = false) {
  messages.value.push({ role, text, isError });
  scrollToBottom();
}

async function openModal() {
  open.value = true;
  document.body.style.overflow = 'hidden';
  babaSessionId.value = null; babaSessionName.value = ''; messages.value = []; chatHistory.value = [];
  step.value = 'pick';
  sessionsLoading.value = true;
  sessionsError.value = '';
  sessions.value = [];
  try {
    const rows = await api('GET', '/ai/sessions');
    sessions.value = Array.isArray(rows) ? rows : [];
  } catch (err) {
    sessionsError.value = t('aiBabaFailedToLoadSessions') + (err.message || t('aiBabaUnknownErrorLower')) + t('aiBabaPleaseTryAgainSuffix');
  } finally {
    sessionsLoading.value = false;
  }
}

function closeModal() {
  open.value = false;
  document.body.style.overflow = '';
  sending.value = false;
}

function sessionMeta(s) {
  const date = s.start_time ? new Date(s.start_time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const time = s.start_time ? new Date(s.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
  const secs = s.duration_seconds;
  const dur = secs ? `${localizeNumber(Math.floor(secs / 60))}m ${localizeNumber(secs % 60)}s` : '—';
  const epochs = s.epoch_count || 0;
  return {
    dateTime: date + (time ? ' · ' + time : ''),
    dur,
    epochsLabel: `${localizeNumber(epochs)} ${epochs !== 1 ? t('aiBabaEpochPlural') : t('aiBabaEpochSingular')}`,
    hasData: epochs > 0,
    name: s.name || t('untitledSession'),
  };
}

async function selectSession(s) {
  const meta = sessionMeta(s);
  if (!meta.hasData) return;
  babaSessionId.value = s.id;
  babaSessionName.value = s.name || t('aiBabaSessionFallbackName');
  messages.value = []; chatHistory.value = [];
  step.value = 'loading';
  try {
    const data = await api('POST', '/ai/start', { session_id: s.id, lang: lang.value });
    step.value = 'chat';
    const summary = data.summary || t('aiBabaDefaultSummary');
    addMessage('assistant', summary);
    chatHistory.value.push({ role: 'assistant', content: summary });
    nextTick(() => setTimeout(() => inputEl.value?.focus(), 100));
  } catch (err) {
    step.value = 'chat';
    addMessage('assistant',
      t('aiBabaTroubleLoading') + '\n\n' +
      t('aiBabaErrorPrefix') + (err.message || t('unknownErrorLabel')) + '\n\n' +
      t('aiBabaTryAgainDifferent'), true);
  }
}

async function sendMessage() {
  if (sending.value || !babaSessionId.value) return;
  const text = inputText.value.trim();
  if (!text) return;
  inputText.value = '';
  sending.value = true;
  addMessage('user', text);
  chatHistory.value.push({ role: 'user', content: text });
  typing.value = true;
  scrollToBottom();
  try {
    const data = await api('POST', '/ai/chat', {
      session_id: babaSessionId.value, message: text,
      history: chatHistory.value.slice(-20), lang: lang.value,
    });
    typing.value = false;
    const reply = data.reply || t('aiBabaCouldNotProcess');
    addMessage('assistant', reply);
    chatHistory.value.push({ role: 'assistant', content: reply });
  } catch (err) {
    typing.value = false;
    addMessage('assistant', t('aiBabaSomethingWentWrong') + (err.message || t('aiBabaUnknownErrorLower')) + t('aiBabaPleaseTryAgainSuffix'), true);
  }
  sending.value = false;
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function onOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}
</script>

<template>
  <button class="btn btn-ai-baba" @click="openModal">{{ t('aiBabaBtn') }}</button>

  <div v-if="open" class="ai-baba-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-baba-title" @click="onOverlayClick">
    <div class="ai-baba-modal">
      <div class="ai-baba-header">
        <div class="ai-baba-header-title">
          <span class="ai-baba-icon">🧘</span>
          <span id="ai-baba-title" class="ai-baba-title">{{ t('aiBabaTitle') }}</span>
        </div>
        <button class="ai-baba-close" aria-label="Close AI Baba" @click="closeModal">&times;</button>
      </div>

      <!-- ─ Step: pick a session ─ -->
      <div v-if="step === 'pick'" class="ai-baba-step">
        <div class="ai-baba-intro">
          <p class="ai-baba-intro-text">{{ t('aiBabaIntro') }}</p>
          <p class="ai-baba-intro-sub">{{ t('aiBabaWhichSession') }}</p>
        </div>
        <div v-if="sessionsLoading" class="ai-baba-loading">
          <span class="ai-baba-spinner"></span> <span>{{ t('aiBabaLoadingSessions') }}</span>
        </div>
        <div v-else-if="sessionsError" class="ai-baba-empty">{{ sessionsError }}</div>
        <div v-else-if="!sessions.length" class="ai-baba-empty">{{ t('aiBabaNoSessions') }}</div>
        <div v-else class="ai-baba-sessions-list">
          <div
            v-for="s in sessions" :key="s.id" class="ai-baba-session-item"
            :style="!sessionMeta(s).hasData ? { opacity: 0.5, pointerEvents: 'none' } : {}"
            :aria-disabled="!sessionMeta(s).hasData"
            :tabindex="sessionMeta(s).hasData ? 0 : -1"
            :role="sessionMeta(s).hasData ? 'button' : null"
            @click="selectSession(s)"
            @keydown="(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSession(s); } }"
          >
            <div class="ai-baba-session-item-name">{{ sessionMeta(s).name }}</div>
            <div class="ai-baba-session-item-meta">
              <span>{{ sessionMeta(s).dateTime }}</span>
              <span>{{ sessionMeta(s).dur }}</span>
              <span>{{ sessionMeta(s).epochsLabel }}</span>
            </div>
            <div v-if="!sessionMeta(s).hasData" class="ai-baba-session-item-nodata">{{ t('noEegDataRecorded') }}</div>
          </div>
        </div>
      </div>

      <!-- ─ Step: loading session summary ─ -->
      <div v-else-if="step === 'loading'" class="ai-baba-step">
        <div class="ai-baba-summary-loading">
          <span class="ai-baba-spinner ai-baba-spinner-lg"></span>
          <span>{{ t('aiBabaReadingBrainwaves') }}</span>
        </div>
      </div>

      <!-- ─ Step: chat ─ -->
      <div v-else class="ai-baba-step ai-baba-step-chat">
        <div class="ai-baba-session-bar">
          <span class="ai-baba-session-name">{{ babaSessionName }}</span>
          <button class="ai-baba-change-session" @click="openModal">{{ t('aiBabaChangeSession') }}</button>
        </div>
        <div ref="messagesEl" class="ai-baba-messages" role="log" aria-live="polite">
          <div v-for="(m, i) in messages" :key="i" class="ai-msg" :class="[m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot', { 'ai-msg-error': m.isError }]">
            <div class="ai-msg-bubble">{{ m.text }}</div>
          </div>
        </div>
        <div v-if="typing" class="ai-baba-typing">
          <span></span><span></span><span></span>
        </div>
        <div class="ai-baba-input-row">
          <input
            ref="inputEl" v-model="inputText" class="ai-baba-input" type="text"
            :placeholder="t('aiBabaInputPlaceholder')" maxlength="600" autocomplete="off"
            aria-label="Message AI Baba" @keydown="onInputKeydown"
          />
          <button class="ai-baba-send" aria-label="Send message" :disabled="sending" @click="sendMessage">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
