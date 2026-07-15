<script setup>
// Swar Calendar — Shiva Svarodaya breath calendar. Ported from a standalone
// React add-on (swaraEngine.ts/swaraLog.ts/useSwara.ts/Home.tsx) into this
// app's own Vue + plain-CSS conventions (no Tailwind/shadcn here, so this
// view is a fresh UI built on lib/swaraEngine.js + lib/swaraLog.js +
// composables/useSwara.js, reusing the exact same Ida/Pingala/Sushumna
// glyphs and color tokens already used by ReadingPanel.vue's Swara Nadi
// card for visual consistency with the rest of the app).
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSwara } from '@/composables/useSwara';
import { useI18n } from '@/composables/useI18n';

const swara = useSwara();
const { t, tf, localizeNumber } = useI18n();

// ── Formatting helpers (no date-fns dependency, matching the rest of the app) ──
// Digits routed through localizeNumber(); month/day-of-week names use the
// browser's own locale formatting (Intl), same non-translated approach the
// rest of the app takes for Date.toLocaleString()-derived text.
function pad2(n) { return localizeNumber(String(n).padStart(2, '0')); }
function fmtHHmm(date) { return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`; }
function fmtHeaderDate(date) {
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${localizeNumber(datePart)} · ${fmtHHmm(date)}`;
}
function fmtTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h > 0 ? localizeNumber(h) + ':' : ''}${pad2(m)}:${pad2(s)}`;
}

// ── Live countdown ──
const nowTick = ref(Date.now());
let countdownTimer = null;
onMounted(() => { countdownTimer = setInterval(() => { nowTick.value = Date.now(); }, 1000); });
onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer); });

const countdownMs = computed(() => {
  if (!swara.state.value) return 0;
  const target = swara.now.value.getTime() + swara.state.value.msUntilNextSwitch;
  // eslint-disable-next-line no-unused-expressions
  nowTick.value; // dependency for the 1s tick
  return Math.max(0, target - Date.now());
});

// ── Manual location form ──
const manualLat = ref('');
const manualLon = ref('');
function submitManualLocation() {
  const latitude = parseFloat(manualLat.value);
  const longitude = parseFloat(manualLon.value);
  if (!isNaN(latitude) && !isNaN(longitude)) {
    swara.setManualLocation({ latitude, longitude, label: t('swaraManualEntry') });
  }
}

// ── Current state display ──
const nostrilLabel = computed(() => {
  const n = swara.state.value?.nostril;
  return n === 'left' ? t('swaraLeftIda') : n === 'right' ? t('swaraRightPingala') : t('swaraSushumnaCentral');
});
const nostrilNote = computed(() => {
  const n = swara.state.value?.nostril;
  if (n === 'left') return t('swaraNoteLeft');
  if (n === 'right') return t('swaraNoteRight');
  return t('swaraNoteSushumnaState');
});

// ── Seasonal note ──
const SEASON_TEXT = {
  cold: 'swaraSeasonTextCold',
  'hot-equatorial': 'swaraSeasonTextHot',
  temperate: 'swaraSeasonTextTemperate',
};
const SEASON_LABEL = { cold: 'swaraSeasonCold', 'hot-equatorial': 'swaraSeasonHot', temperate: 'swaraSeasonTemperate' };

// ── Travel guidance ──
const travelDir = ref(null);
const travelResult = computed(() => (travelDir.value ? swara.checkTravelDirection(travelDir.value) : null));
const DIRECTIONS = ['north', 'south', 'east', 'west'];

// ── Timeline ──
const timelineItems = computed(() => {
  if (!swara.cycle.value) return [];
  const arr = [];
  for (const block of swara.cycle.value.blocks) {
    arr.push({ type: 'block', start: block.start, end: block.end, nostril: block.nostril, id: `block-${block.index}` });
    const win = swara.cycle.value.sushumnaWindows.find((w) => w.afterBlockIndex === block.index);
    if (win) arr.push({ type: 'sushumna', start: win.start, end: win.end, id: `win-${block.index}` });
  }
  return arr;
});
function isActiveItem(item) {
  const nowMs = swara.now.value.getTime();
  return nowMs >= item.start.getTime() && nowMs < item.end.getTime();
}
function isPastItem(item) {
  return swara.now.value.getTime() >= item.end.getTime();
}
</script>

<template>
  <div class="swara-view">
    <!-- ─ Location gate: idle ─ -->
    <div v-if="swara.locationStatus.value === 'idle'" class="view-stub">
      <div class="view-stub__card">
        <div class="swara-gate-icon">🧭</div>
        <h2>{{ t('swaraGateTitle') }}</h2>
        <p>{{ t('swaraGateDesc') }}</p>
        <button class="btn btn-primary" @click="swara.requestLocation">{{ t('swaraCalibrateBtn') }}</button>
      </div>
    </div>

    <!-- ─ Location gate: requesting ─ -->
    <div v-else-if="swara.locationStatus.value === 'requesting'" class="view-stub">
      <div class="view-stub__card">
        <div class="swara-spinner"></div>
        <h2>{{ t('swaraAcquiring') }}</h2>
      </div>
    </div>

    <!-- ─ Location gate: denied / unavailable → manual form ─ -->
    <div v-else-if="swara.locationStatus.value === 'denied' || swara.locationStatus.value === 'unavailable'" class="view-stub">
      <div class="view-stub__card swara-manual-card">
        <div class="swara-gate-icon">📍</div>
        <h2>{{ t('swaraManualTitle') }}</h2>
        <p>{{ swara.locationError.value || t('swaraManualDefaultHint') }}</p>
        <form class="swara-manual-form" @submit.prevent="submitManualLocation">
          <label>
            <span>{{ t('swaraLatitude') }}</span>
            <input v-model="manualLat" type="number" step="any" required placeholder="e.g. 34.0522" />
          </label>
          <label>
            <span>{{ t('swaraLongitude') }}</span>
            <input v-model="manualLon" type="number" step="any" required placeholder="e.g. -118.2437" />
          </label>
          <button class="btn btn-primary" type="submit">{{ t('swaraSetLocationBtn') }}</button>
        </form>
      </div>
    </div>

    <!-- ─ Calibrating cycle ─ -->
    <div v-else-if="!swara.cycle.value || !swara.state.value" class="view-stub">
      <div class="view-stub__card">
        <div class="swara-spinner"></div>
        <h2>{{ t('swaraCalibratingCycles') }}</h2>
      </div>
    </div>

    <!-- ─ Dashboard ─ -->
    <div v-else class="swara-dashboard">
      <header class="swara-header">
        <div>
          <h2 class="swara-title">{{ t('swaraTodaysCycle') }}</h2>
          <p class="swara-location">
            📍 {{ swara.coords.value?.label || t('swaraCalibratedLocation') }} · {{ localizeNumber(swara.coords.value?.latitude.toFixed(2)) }}, {{ localizeNumber(swara.coords.value?.longitude.toFixed(2)) }}
          </p>
        </div>
        <div class="swara-clock">{{ fmtHeaderDate(swara.now.value) }}</div>
      </header>

      <div class="swara-grid">
        <div class="swara-col-main">
          <!-- ─ Current state ─ -->
          <div class="card swara-current-card" :class="'nostril-' + swara.state.value.nostril">
            <div class="swara-current-body">
              <div class="swara-current-glyph" :class="'nostril-' + swara.state.value.nostril">
                <span v-if="swara.state.value.nostril === 'left'">🌙</span>
                <span v-else-if="swara.state.value.nostril === 'right'">☀️</span>
                <span v-else>⚖️</span>
              </div>
              <div class="swara-current-text">
                <div class="card-label">{{ t('swaraDominantChannel') }}</div>
                <div class="swara-current-name">{{ nostrilLabel }}</div>
                <p class="swara-current-note">{{ nostrilNote }}</p>
                <div class="swara-countdown">
                  <span class="swara-countdown-time">{{ fmtTimeLeft(countdownMs) }}</span>
                  <span class="swara-countdown-label">{{ swara.state.value.inSushumna ? t('swaraUntilPhaseStarts') : t('swaraUntilTransition') }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="swara-mini-grid">
            <div class="card">
              <div class="card-label">{{ t('swaraLunarPhase') }}</div>
              <div class="swara-mini-title">{{ swara.cycle.value.tithi.paksha === 'shukla' ? t('swaraShuklaPaksha') : t('swaraKrishnaPaksha') }}</div>
              <div class="swara-mini-sub">{{ tf('swaraTithiTemplate', { n: localizeNumber(swara.cycle.value.tithi.tithiDay) }) }}</div>
            </div>
            <div class="card">
              <div class="card-label">{{ t('swaraSeasonalContext') }}</div>
              <div class="swara-mini-title">{{ t(SEASON_LABEL[swara.seasonalBand.value]) }}</div>
              <div class="swara-mini-sub">{{ t(SEASON_TEXT[swara.seasonalBand.value]) }}</div>
            </div>
          </div>

          <!-- ─ Breath logger ─ -->
          <div class="card">
            <div class="swara-card-head">
              <div class="card-label" style="margin-bottom:0">{{ t('swaraAlignmentCheck') }}</div>
              <span class="swara-streak-badge">{{ tf('swaraStreakTemplate', { n: localizeNumber(swara.mismatchStreak.value), day: swara.mismatchStreak.value === 1 ? t('swaraDaySingular') : t('swaraDayPlural') }) }}</span>
            </div>

            <div v-if="swara.mismatchStreak.value >= 3" class="swara-arishta-warning">
              <span class="swara-arishta-icon">⚠️</span>
              <div>
                <strong>{{ t('swaraArishtaTitle') }}</strong>
                <p>{{ t('swaraArishtaDesc') }}</p>
              </div>
            </div>

            <div v-if="swara.todaysEntry.value" class="swara-logged">
              <span class="swara-logged-icon">✓</span>
              <div>
                <p class="swara-logged-title">{{ t('swaraLogCompleted') }}</p>
                <p class="swara-logged-sub">{{ tf('swaraObservedTemplate', { nostril: swara.todaysEntry.value.reported === 'left' ? t('swaraLeftWord') : t('swaraRightWord'), status: swara.todaysEntry.value.match ? t('swaraAligned') : t('swaraMisaligned') }) }}</p>
              </div>
            </div>
            <div v-else>
              <p class="swara-hint">{{ t('swaraLogHint') }}</p>
              <div class="swara-log-buttons">
                <button class="swara-log-btn" :disabled="swara.state.value.nostril === 'sushumna'" @click="swara.logBreathCheck('left')">{{ t('swaraLeftFlowBtn') }}</button>
                <button class="swara-log-btn" :disabled="swara.state.value.nostril === 'sushumna'" @click="swara.logBreathCheck('right')">{{ t('swaraRightFlowBtn') }}</button>
              </div>
            </div>
          </div>

          <!-- ─ Travel guidance ─ -->
          <div class="card">
            <div class="card-label">{{ t('swaraTravelTitle') }}</div>
            <p class="swara-hint">{{ t('swaraTravelHint') }}</p>
            <div class="swara-dir-buttons">
              <button
                v-for="d in DIRECTIONS" :key="d" class="swara-dir-btn"
                :class="{ 'swara-dir-btn--active': travelDir === d }"
                @click="travelDir = d"
              >{{ t('swaraDir' + d.charAt(0).toUpperCase() + d.slice(1)) }}</button>
            </div>
            <div v-if="travelResult" class="swara-travel-result">
              <div class="swara-travel-row">
                <span>{{ t('swaraRequiredDominance') }}</span>
                <strong :class="'nostril-text-' + travelResult.favorableNostril">{{ travelResult.favorableNostril === 'left' ? t('swaraLeftWord') : t('swaraRightWord') }}</strong>
              </div>
              <div class="swara-travel-row">
                <span>{{ t('swaraFavorableNow') }}</span>
                <span :class="travelResult.isFavorableNow ? 'swara-yes' : 'swara-no'">{{ travelResult.isFavorableNow ? t('swaraYes') : t('swaraNo') }}</span>
              </div>
              <div v-if="!travelResult.isFavorableNow && travelResult.nextFavorableAt" class="swara-travel-row">
                <span>{{ t('swaraNextFavorableWindow') }}</span>
                <span class="swara-mono">{{ fmtHHmm(travelResult.nextFavorableAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ─ Timeline ─ -->
        <div class="swara-col-side">
          <div class="card swara-timeline-card">
            <div class="swara-timeline-head">
              <div class="card-label" style="margin-bottom:0">{{ t('swaraDailySchedule') }}</div>
              <div class="swara-timeline-sub">{{ t('swaraSunriseToSunrise') }}</div>
            </div>
            <div class="swara-timeline-body">
              <div
                v-for="item in timelineItems" :key="item.id"
                class="swara-timeline-item"
                :class="[item.type === 'block' ? 'swara-timeline-block' : 'swara-timeline-sushumna', { 'is-past': isPastItem(item), 'is-active': isActiveItem(item) }]"
              >
                <span class="swara-timeline-time">{{ fmtHHmm(item.start) }}</span>
                <span class="swara-timeline-dot" :class="item.type === 'block' ? 'nostril-' + item.nostril : 'nostril-sushumna'"></span>
                <span v-if="item.type === 'block'" class="swara-timeline-label">
                  {{ item.nostril === 'left' ? '🌙' : '☀️' }} {{ tf('swaraFlowTemplate', { nostril: item.nostril === 'left' ? t('swaraLeftWord') : t('swaraRightWord') }) }}
                </span>
                <span v-else class="swara-timeline-label swara-timeline-label--sushumna">⚖️ {{ t('swaraSushumnaWord') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.swara-view { max-width: 1200px; margin: 0 auto; }

.view-stub { display: flex; align-items: center; justify-content: center; min-height: 60vh; padding: 24px; }
.view-stub__card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm); padding: 44px 40px; text-align: center; max-width: 460px;
}
.view-stub__card h2 { font-family: var(--font-serif); font-weight: 400; font-size: 24px; color: var(--text); letter-spacing: -0.01em; margin-bottom: 12px; }
.view-stub__card p { color: var(--text-muted); font-size: 14px; line-height: 1.6; margin: 0 auto 20px; }
.swara-gate-icon { font-size: 40px; margin-bottom: 16px; }
.swara-spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 20px; animation: swara-spin 1s linear infinite; }
@keyframes swara-spin { to { transform: rotate(360deg); } }

.swara-manual-card { max-width: 380px; }
.swara-manual-form { display: flex; flex-direction: column; gap: 14px; text-align: left; }
.swara-manual-form label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-mid); text-transform: uppercase; letter-spacing: 0.04em; }
.swara-manual-form input { padding: 9px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-card-2); color: var(--text); font-size: 14px; font-family: var(--font); }
.swara-manual-form input:focus { outline: none; border-color: var(--accent); }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; border-radius: var(--radius-sm); border: none; cursor: pointer; font-size: 14px; font-family: var(--font); font-weight: 600; transition: background 0.15s, opacity 0.15s; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: #C4673E; }

.swara-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
.swara-title { font-family: var(--font-serif); font-size: 26px; color: var(--text); letter-spacing: -0.01em; margin-bottom: 4px; }
.swara-location { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.swara-clock { font-size: 13px; font-family: var(--font); color: var(--text); background: var(--bg-card-2); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-sm); font-variant-numeric: tabular-nums; }

.swara-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 900px) { .swara-grid { grid-template-columns: 1fr; } }
.swara-col-main { display: flex; flex-direction: column; gap: 18px; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

/* ─── Current state ─── */
.swara-current-card { position: relative; overflow: hidden; }
.swara-current-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--ida), var(--sushumna), var(--pingala)); }
.swara-current-body { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.swara-current-glyph { width: 96px; height: 96px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 42px; border: 3px solid var(--border); flex-shrink: 0; }
.swara-current-glyph.nostril-left { border-color: var(--ida); background: rgba(91,141,184,0.1); }
.swara-current-glyph.nostril-right { border-color: var(--pingala); background: rgba(217,119,87,0.1); }
.swara-current-glyph.nostril-sushumna { border-color: var(--sushumna); background: rgba(86,166,122,0.1); }
.swara-current-text { flex: 1; min-width: 220px; }
.swara-current-name { font-family: var(--font-serif); font-size: 30px; color: var(--text); margin-bottom: 6px; }
.swara-current-note { font-size: 13px; color: var(--text-muted); line-height: 1.55; margin-bottom: 14px; }
.swara-countdown { display: inline-flex; align-items: center; gap: 10px; background: var(--bg-card-2); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius-sm); }
.swara-countdown-time { font-family: var(--font); font-size: 18px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.swara-countdown-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }

/* ─── Mini cards (lunar / seasonal) ─── */
.swara-mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 560px) { .swara-mini-grid { grid-template-columns: 1fr; } }
.swara-mini-title { font-family: var(--font-serif); font-size: 18px; color: var(--text); margin-bottom: 4px; }
.swara-mini-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

/* ─── Breath logger ─── */
.swara-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.swara-streak-badge { font-size: 11px; font-family: var(--font); color: var(--text-muted); background: var(--bg-card-2); border: 1px solid var(--border); padding: 4px 10px; border-radius: var(--radius-sm); }
.swara-arishta-warning { display: flex; gap: 12px; background: rgba(199,92,92,0.08); border: 1px solid rgba(199,92,92,0.25); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px; }
.swara-arishta-icon { font-size: 20px; flex-shrink: 0; }
.swara-arishta-warning strong { color: #A03A3A; display: block; margin-bottom: 4px; }
.swara-arishta-warning p { font-size: 12.5px; color: var(--text-mid); line-height: 1.5; margin: 0; }
.swara-logged { display: flex; align-items: center; gap: 12px; background: var(--bg-card-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; }
.swara-logged-icon { font-size: 20px; color: var(--sushumna); }
.swara-logged-title { font-size: 13px; font-weight: 600; color: var(--text); }
.swara-logged-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; text-transform: capitalize; }
.swara-hint { font-size: 12.5px; color: var(--text-muted); margin-bottom: 14px; }
.swara-log-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.swara-log-btn { padding: 12px; border: 2px solid var(--border); background: var(--bg-card-2); border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer; transition: border-color 0.15s, background 0.15s; text-transform: capitalize; }
.swara-log-btn:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-dim); }
.swara-log-btn:disabled { opacity: 0.5; cursor: default; }

/* ─── Travel guidance ─── */
.swara-dir-buttons { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.swara-dir-btn { flex: 1; min-width: 70px; padding: 9px; border: 2px solid var(--border); background: var(--bg-card-2); border-radius: var(--radius-sm); font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; text-transform: capitalize; transition: all 0.15s; }
.swara-dir-btn:hover { border-color: var(--accent); }
.swara-dir-btn--active { background: var(--text); border-color: var(--text); color: var(--bg-card); }
.swara-travel-result { background: var(--bg-card-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px; }
.swara-travel-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; border-top: 1px solid var(--border-light); font-size: 12.5px; color: var(--text-muted); }
.swara-travel-row:first-child { border-top: none; }
.nostril-text-left { color: var(--ida); text-transform: capitalize; }
.nostril-text-right { color: var(--pingala); text-transform: capitalize; }
.swara-yes { color: #3F8A78; font-weight: 600; }
.swara-no { color: #C75C5C; font-weight: 600; }
.swara-mono { font-family: monospace; background: var(--bg-card); border: 1px solid var(--border); padding: 2px 8px; border-radius: 4px; color: var(--text); }

/* ─── Timeline ─── */
.swara-timeline-card { display: flex; flex-direction: column; max-height: 820px; padding: 0; overflow: hidden; }
.swara-timeline-head { padding: 18px 20px 14px; border-bottom: 1px solid var(--border); background: var(--bg-card-2); flex-shrink: 0; }
.swara-timeline-sub { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
.swara-timeline-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
.swara-timeline-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; transition: opacity 0.3s; }
.swara-timeline-item.is-past { opacity: 0.45; }
.swara-timeline-time { width: 44px; text-align: right; font-size: 11px; font-family: monospace; color: var(--text-muted); flex-shrink: 0; }
.swara-timeline-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; background: var(--border); }
.swara-timeline-block .swara-timeline-dot.nostril-left { background: var(--ida); }
.swara-timeline-block .swara-timeline-dot.nostril-right { background: var(--pingala); }
.swara-timeline-sushumna .swara-timeline-dot { width: 7px; height: 7px; background: var(--sushumna); opacity: 0.6; }
.swara-timeline-item.is-active .swara-timeline-dot { box-shadow: 0 0 0 3px var(--bg-card-2); transform: scale(1.2); }
.swara-timeline-label { flex: 1; font-size: 12.5px; color: var(--text); text-transform: capitalize; padding: 8px 10px; background: var(--bg-card-2); border: 1px solid var(--border-light); border-radius: var(--radius-sm); }
.swara-timeline-item.is-active .swara-timeline-label { border-color: var(--accent); box-shadow: var(--shadow-sm); font-weight: 600; }
.swara-timeline-label--sushumna { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); background: none; border: none; padding: 2px 0; }
</style>
