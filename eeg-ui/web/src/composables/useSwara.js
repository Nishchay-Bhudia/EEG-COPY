// ── useSwara.js — Swar Calendar composable ─────────────────────────────────
// Ties geolocation, the swaraEngine math, and the breath-check log together
// for the Swara view. Ported from the standalone add-on's useSwara.ts React
// hook (useState/useEffect/useMemo/useCallback -> ref/onMounted/computed).
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  buildDailyCycle,
  classifySeasonalBand,
  computeSunriseWithFallback,
  computeTithi,
  currentSwaraState,
  favorableNostrilForTravel,
  nextFavorableBlock,
} from '@/lib/swaraEngine';
import {
  currentMismatchStreak,
  getBreathLog,
  getTodaysEntry,
  recordBreathCheck,
} from '@/lib/swaraLog';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const MS_PER_DAY = 86400000;

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Finds the sunrise-to-sunrise cycle that contains `now`: if `now` is
 * before today's local sunrise, the active cycle started at yesterday's
 * sunrise; otherwise it started at today's sunrise and runs to tomorrow's.
 */
function resolveActiveCycle(now, coords) {
  const todaySunrise = computeSunriseWithFallback(
    now,
    coords.latitude,
    coords.longitude,
  );

  let cycleStartInfo = todaySunrise;
  let cycleStartCalendarDay = now;

  if (now.getTime() < todaySunrise.sunrise.getTime()) {
    cycleStartCalendarDay = addDays(now, -1);
    cycleStartInfo = computeSunriseWithFallback(
      cycleStartCalendarDay,
      coords.latitude,
      coords.longitude,
    );
  }

  const nextCycleCalendarDay = addDays(cycleStartCalendarDay, 1);
  const nextSunriseInfo = computeSunriseWithFallback(
    nextCycleCalendarDay,
    coords.latitude,
    coords.longitude,
  );

  const tithi = computeTithi(cycleStartInfo.sunrise);
  return buildDailyCycle(cycleStartInfo.sunrise, nextSunriseInfo.sunrise, tithi);
}

export function useSwara() {
  const now = ref(new Date());
  const coords = ref(null); // { latitude, longitude, label? }
  const locationStatus = ref('idle'); // idle | requesting | granted | denied | unavailable | manual
  const locationError = ref(null);
  const breathLog = ref([]);

  let tickTimer = null;

  onMounted(() => {
    breathLog.value = getBreathLog();
    tickTimer = setInterval(() => { now.value = new Date(); }, 15000);
  });
  onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer);
  });

  function requestLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      locationStatus.value = 'unavailable';
      locationError.value = t('swaraLocationUnavailable');
      return;
    }
    locationStatus.value = 'requesting';
    locationError.value = null;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        coords.value = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: t('swaraYourLocation'),
        };
        locationStatus.value = 'granted';
      },
      (error) => {
        locationStatus.value = 'denied';
        locationError.value =
          error.code === error.PERMISSION_DENIED
            ? t('swaraLocationDenied')
            : t('swaraLocationError');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  function setManualLocation(next) {
    coords.value = next;
    locationStatus.value = 'manual';
    locationError.value = null;
  }

  // `now` intentionally changes rarely enough (15s tick) that recomputing
  // the astronomical cycle each tick is cheap and keeps midnight/sunrise
  // rollovers correct without extra bookkeeping.
  const cycle = computed(() => {
    if (!coords.value) return null;
    return resolveActiveCycle(now.value, coords.value);
  });

  const state = computed(() => {
    if (!cycle.value) return null;
    return currentSwaraState(cycle.value, now.value);
  });

  const seasonalBand = computed(() => {
    if (!coords.value) return null;
    return classifySeasonalBand(coords.value.latitude, now.value);
  });

  const todaysEntry = computed(() => {
    // eslint-disable-next-line no-unused-expressions -- track breathLog for reactivity
    breathLog.value;
    return getTodaysEntry(now.value);
  });
  const mismatchStreak = computed(() => currentMismatchStreak(breathLog.value));

  function logBreathCheck(reported) {
    if (!state.value || state.value.nostril === 'sushumna') return;
    breathLog.value = recordBreathCheck(now.value, state.value.nostril, reported);
  }

  function checkTravelDirection(direction) {
    const favorableNostril = favorableNostrilForTravel(direction);
    const isFavorableNow =
      state.value !== null &&
      state.value.nostril !== 'sushumna' &&
      state.value.nostril === favorableNostril;
    const nextFavorableAt = cycle.value
      ? nextFavorableBlock(cycle.value, now.value, favorableNostril)?.start ?? null
      : null;
    return { favorableNostril, isFavorableNow, nextFavorableAt };
  }

  return {
    now,
    coords,
    locationStatus,
    locationError,
    requestLocation,
    setManualLocation,
    cycle,
    state,
    seasonalBand,
    breathLog,
    todaysEntry,
    mismatchStreak,
    logBreathCheck,
    checkTravelDirection,
  };
}
