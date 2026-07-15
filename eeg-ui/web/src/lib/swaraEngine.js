// ── swaraEngine.js — Shiva Svarodaya breath-calendar calculation engine ───────
// Ported verbatim (math unchanged, TypeScript types dropped) from a
// standalone add-on built separately. The nostril that should be dominant at
// sunrise is derived from the lunar Tithi (lunar day) and Paksha (fortnight),
// then alternates every ~1 hour (2.5 ghatis) through the 24-hour cycle, with a
// brief Sushumna (central-channel) transition between each hour block.
//
// All astronomical math (sunrise, solar longitude, lunar longitude) is
// computed locally so the tool works for any location on Earth without a
// network call, using the standard low-precision solar/lunar formulas from
// Jean Meeus, "Astronomical Algorithms" (2nd ed.), accurate to about 0.01 deg
// for the Sun and about 10 arcminutes for the Moon. Because a Tithi spans 12
// deg of Sun-Moon elongation, this precision keeps Tithi/Paksha boundary
// times accurate to within roughly a minute.

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86400000;
const SUSHUMNA_MINUTES = 4; // upper end of the scripture's "1 to 4 minutes" transition window
const HOUR_BLOCK_MINUTES = 60; // 2.5 ghatis = 60 minutes

function toJulianDay(date) {
  return date.getTime() / MS_PER_DAY + 2440587.5;
}

function fromJulianDay(jd) {
  return new Date((jd - 2440587.5) * MS_PER_DAY);
}

function deg2rad(d) {
  return (d * Math.PI) / 180;
}

function rad2deg(r) {
  return (r * 180) / Math.PI;
}

function normalizeDegrees(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/** Julian centuries from J2000.0 for a given Julian Day. */
function centuriesJ2000(jd) {
  return (jd - 2451545.0) / 36525;
}

// ---------------------------------------------------------------------------
// Solar position (Meeus ch. 25, low-precision method, ~0.01 deg accuracy)
// ---------------------------------------------------------------------------

/** Geometric (not apparent) ecliptic longitude of the Sun, in degrees. */
export function sunEclipticLongitude(jd) {
  const T = centuriesJ2000(jd);
  const L0 = normalizeDegrees(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = normalizeDegrees(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = deg2rad(M);
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  return normalizeDegrees(L0 + C);
}

// ---------------------------------------------------------------------------
// Lunar position (Meeus ch. 47, abbreviated periodic series, ~10' accuracy)
// ---------------------------------------------------------------------------

/** Geometric ecliptic longitude of the Moon, in degrees. */
export function moonEclipticLongitude(jd) {
  const T = centuriesJ2000(jd);
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  const Lp = normalizeDegrees(
    218.3164477 +
      481267.88123421 * T -
      0.0015786 * T2 +
      T3 / 538841 -
      T4 / 65194000,
  );
  const D = normalizeDegrees(
    297.8501921 +
      445267.1114034 * T -
      0.0018819 * T2 +
      T3 / 545868 -
      T4 / 113065000,
  );
  const M = normalizeDegrees(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000,
  );
  const Mp = normalizeDegrees(
    134.9633964 +
      477198.8675055 * T +
      0.0087414 * T2 +
      T3 / 69699 -
      T4 / 14712000,
  );
  // Moon's argument of latitude (Meeus 47.5).
  const F = normalizeDegrees(
    93.272095 +
      483202.0175233 * T -
      0.0036539 * T2 -
      T3 / 3526000 +
      T4 / 863310000,
  );

  const d = deg2rad(D);
  const m = deg2rad(M);
  const mp = deg2rad(Mp);
  const f = deg2rad(F);

  // Abbreviated series for the longitude correction, in degrees
  // (Meeus Table 47.A, largest ~30 terms of the sine series for Sigma_l).
  let sigmaL = 0;
  sigmaL += 6.288774 * Math.sin(mp);
  sigmaL += 1.274027 * Math.sin(2 * d - mp);
  sigmaL += 0.658314 * Math.sin(2 * d);
  sigmaL += 0.213618 * Math.sin(2 * mp);
  sigmaL += -0.18516 * Math.sin(m);
  sigmaL += -0.114332 * Math.sin(2 * f);
  sigmaL += 0.058793 * Math.sin(2 * d - 2 * mp);
  sigmaL += 0.057066 * Math.sin(2 * d - m - mp);
  sigmaL += 0.053322 * Math.sin(2 * d + mp);
  sigmaL += 0.045758 * Math.sin(2 * d - m);
  sigmaL += -0.040923 * Math.sin(m - mp);
  sigmaL += -0.03472 * Math.sin(d);
  sigmaL += -0.030383 * Math.sin(m + mp);
  sigmaL += 0.015327 * Math.sin(2 * d - 2 * f);
  sigmaL += -0.012528 * Math.sin(2 * f + mp);
  sigmaL += -0.01098 * Math.sin(2 * f - mp);
  sigmaL += 0.010675 * Math.sin(4 * d - mp);
  sigmaL += 0.010034 * Math.sin(3 * mp);
  sigmaL += 0.008548 * Math.sin(4 * d - 2 * mp);
  sigmaL += -0.007888 * Math.sin(2 * d + m - mp);
  sigmaL += -0.006766 * Math.sin(2 * d + m);
  sigmaL += -0.005163 * Math.sin(d - mp);
  sigmaL += 0.004987 * Math.sin(d + m);
  sigmaL += 0.004036 * Math.sin(2 * d - m + mp);
  sigmaL += 0.003994 * Math.sin(2 * d + 2 * mp);
  sigmaL += 0.003861 * Math.sin(4 * d);
  sigmaL += 0.003665 * Math.sin(2 * d - 3 * mp);
  sigmaL += -0.002689 * Math.sin(m - 2 * mp);
  sigmaL += -0.002602 * Math.sin(2 * d - m - 2 * mp);
  sigmaL += 0.00263 * Math.sin(2 * d + m + mp);

  return normalizeDegrees(Lp + sigmaL);
}

// ---------------------------------------------------------------------------
// Tithi / Paksha
// ---------------------------------------------------------------------------

/**
 * Computes the Tithi (lunar day) and Paksha (fortnight) prevailing at a
 * given instant, from the Sun-Moon ecliptic elongation. Each Tithi spans
 * exactly 12 degrees of elongation; Tithi 1-15 is Shukla Paksha (waxing,
 * culminating at the Full Moon), Tithi 16-30 is Krishna Paksha (waning,
 * culminating at the New Moon).
 */
export function computeTithi(date) {
  const jd = toJulianDay(date);
  const sunLon = sunEclipticLongitude(jd);
  const moonLon = moonEclipticLongitude(jd);
  const elongation = normalizeDegrees(moonLon - sunLon);

  const tithiIndex = Math.floor(elongation / 12) + 1; // 1-30
  const paksha = tithiIndex <= 15 ? 'shukla' : 'krishna';
  const tithiDay = paksha === 'shukla' ? tithiIndex : tithiIndex - 15;

  return { tithiIndex, tithiDay, paksha, elongation };
}

// ---------------------------------------------------------------------------
// Sunrise (general sunrise equation, ~1 minute accuracy away from poles)
// ---------------------------------------------------------------------------

const EARTH_OBLIQUITY_DEG = 23.4397;
const SOLAR_ELEVATION_AT_SUNRISE_DEG = -0.833; // atmospheric refraction + solar radius

/**
 * Computes local sunrise (in UTC) for the given calendar date (interpreted
 * as a date at that lat/lon) and coordinates. `date` only needs to carry the
 * correct calendar day; time-of-day is ignored.
 *
 * Longitude is in degrees, positive East. Latitude is in degrees, positive
 * North.
 */
export function computeSunrise(date, latitude, longitude) {
  // Anchor to the UTC calendar date matching the local wall-clock date the
  // caller intends (caller is responsible for passing a Date representing
  // noon-ish local time or the correct UTC day boundary; see useSwara composable).
  const midnightUtc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const jdMidnight = toJulianDay(midnightUtc);

  // BUG FIX: Julian Days at midnight always carry a .5 fractional part (JD's
  // own epoch starts at NOON), so `Math.floor(jdMidnight - J2000 + tiny)`
  // silently drops that half-day and lands one whole day EARLY — every
  // sunrise this returned was actually the PREVIOUS calendar day's sunrise
  // (same time-of-day, wrong date), which cascaded into the whole daily
  // cycle being built from a stale sunrise/next-sunrise pair. Round to the
  // noon-referenced day count instead (equivalently: floor + 1) so `n`
  // lands on the JD-noon that actually falls within the requested date.
  const n = Math.round(jdMidnight - 2451545.0 + 0.5);
  const Jstar = n - longitude / 360;

  const M = normalizeDegrees(357.5291 + 0.98560028 * Jstar);
  const Mr = deg2rad(M);
  const C =
    1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = normalizeDegrees(M + 102.9372 + C + 180);
  const lambdaR = deg2rad(lambda);

  const Jtransit =
    2451545.0 +
    Jstar +
    0.0053 * Math.sin(Mr) -
    0.0069 * Math.sin(2 * lambdaR);

  const sinDelta = Math.sin(deg2rad(EARTH_OBLIQUITY_DEG)) * Math.sin(lambdaR);
  const delta = Math.asin(sinDelta);

  const phi = deg2rad(latitude);
  const cosOmega =
    (Math.sin(deg2rad(SOLAR_ELEVATION_AT_SUNRISE_DEG)) -
      Math.sin(phi) * Math.sin(delta)) /
    (Math.cos(phi) * Math.cos(delta));

  if (cosOmega > 1) {
    return { date: null, polarDay: false, polarNight: true };
  }
  if (cosOmega < -1) {
    return { date: null, polarDay: true, polarNight: false };
  }

  const omega = rad2deg(Math.acos(cosOmega));
  const Jrise = Jtransit - omega / 360;

  return { date: fromJulianDay(Jrise), polarDay: false, polarNight: false };
}

/**
 * Finds the sunrise (UTC Date) for the given local calendar date, falling
 * back to nearby days (and finally to local-noon-as-sunrise) if the
 * location experiences polar day/night on that exact date, so the tool
 * degrades gracefully instead of failing entirely at extreme latitudes.
 */
export function computeSunriseWithFallback(localDate, latitude, longitude) {
  const primary = computeSunrise(localDate, latitude, longitude);
  if (primary.date) {
    return { sunrise: primary.date, approximated: false };
  }

  // Search backwards/forwards up to 190 days for the nearest real sunrise
  // (covers the worst case near the poles, where day/night persist for
  // months at a time).
  for (let offset = 1; offset <= 190; offset++) {
    for (const dir of [1, -1]) {
      const probe = new Date(localDate.getTime() + dir * offset * MS_PER_DAY);
      const result = computeSunrise(probe, latitude, longitude);
      if (result.date) {
        const adjusted = new Date(
          result.date.getTime() - dir * offset * MS_PER_DAY,
        );
        return {
          sunrise: adjusted,
          approximated: true,
          note: primary.polarDay
            ? 'This location currently has continuous daylight (polar day). Showing an approximate cycle anchored to the nearest real sunrise.'
            : 'This location currently has continuous darkness (polar night). Showing an approximate cycle anchored to the nearest real sunrise.',
        };
      }
    }
  }

  // Should not happen in practice, but fall back to local midday.
  const fallback = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      6,
      0,
      0,
    ),
  );
  return {
    sunrise: fallback,
    approximated: true,
    note: 'Could not determine a precise sunrise for this location; using an estimated time.',
  };
}

// ---------------------------------------------------------------------------
// Starting nostril from Paksha + Tithi (the core scripture table)
// ---------------------------------------------------------------------------

const THREE_DAY_BLOCK_IS_LEFT_IN_SHUKLA = new Set([1, 2, 3, 7, 8, 9, 13, 14, 15]);

/**
 * The scripture's table: within Shukla Paksha, Tithi-days 1-3, 7-9, 13-15
 * open with the Left (Ida/Chandra) nostril and 4-6, 10-12 open with the
 * Right (Pingala/Surya) nostril. Krishna Paksha inverts the whole pattern.
 */
export function startingNostrilForTithi(tithi) {
  const isLeftGroupDay = THREE_DAY_BLOCK_IS_LEFT_IN_SHUKLA.has(tithi.tithiDay);
  if (tithi.paksha === 'shukla') {
    return isLeftGroupDay ? 'left' : 'right';
  }
  // Krishna Paksha inverts the pattern.
  return isLeftGroupDay ? 'right' : 'left';
}

// ---------------------------------------------------------------------------
// Full daily cycle: hour blocks + Sushumna transitions from sunrise
// ---------------------------------------------------------------------------

function opposite(n) {
  return n === 'left' ? 'right' : 'left';
}

/**
 * Builds the full 24-hour swara schedule starting at `sunrise`, alternating
 * nostril every hour (2.5 ghatis) as described in the scripture's "24-Hour
 * Ideal Cycle". The next day's Tithi/Paksha determine the following cycle,
 * so this function only covers one sunrise-to-sunrise cycle.
 */
export function buildDailyCycle(sunrise, nextSunrise, tithi) {
  const startingNostril = startingNostrilForTithi(tithi);
  const blocks = [];
  const sushumnaWindows = [];

  let cursor = new Date(sunrise);
  let nostril = startingNostril;
  let index = 0;

  while (cursor.getTime() < nextSunrise.getTime()) {
    const blockEnd = new Date(
      Math.min(
        cursor.getTime() + HOUR_BLOCK_MINUTES * 60000,
        nextSunrise.getTime(),
      ),
    );
    blocks.push({ start: new Date(cursor), end: blockEnd, nostril, index });

    if (blockEnd.getTime() < nextSunrise.getTime()) {
      const transitionEnd = new Date(
        Math.min(
          blockEnd.getTime() + SUSHUMNA_MINUTES * 60000,
          nextSunrise.getTime(),
        ),
      );
      sushumnaWindows.push({
        start: blockEnd,
        end: transitionEnd,
        afterBlockIndex: index,
      });
      cursor = transitionEnd;
    } else {
      cursor = blockEnd;
    }

    nostril = opposite(nostril);
    index++;
  }

  return { sunrise, nextSunrise, tithi, startingNostril, blocks, sushumnaWindows };
}

/** Finds the currently active swara state for `now` within a computed cycle. */
export function currentSwaraState(cycle, now) {
  const t = now.getTime();

  for (const block of cycle.blocks) {
    if (t >= block.start.getTime() && t < block.end.getTime()) {
      return {
        nostril: block.nostril,
        block,
        msUntilNextSwitch: block.end.getTime() - t,
        msUntilSushumnaEnds: 0,
        inSushumna: false,
      };
    }
  }

  for (const win of cycle.sushumnaWindows) {
    if (t >= win.start.getTime() && t < win.end.getTime()) {
      const block =
        cycle.blocks.find((b) => b.index === win.afterBlockIndex) ??
        cycle.blocks[cycle.blocks.length - 1];
      return {
        nostril: 'sushumna',
        block,
        msUntilNextSwitch: win.end.getTime() - t,
        msUntilSushumnaEnds: win.end.getTime() - t,
        inSushumna: true,
      };
    }
  }

  // Fallback: past the last known block (shouldn't normally happen because
  // the cycle spans sunrise to next sunrise); report the last block.
  const last = cycle.blocks[cycle.blocks.length - 1];
  return {
    nostril: last.nostril,
    block: last,
    msUntilNextSwitch: 0,
    msUntilSushumnaEnds: 0,
    inSushumna: false,
  };
}

// ---------------------------------------------------------------------------
// Travel direction guidance (Desha-Vichara)
// ---------------------------------------------------------------------------

/**
 * The scripture instructs: departing North or East should begin with the
 * Left (Ida/Chandra, lunar/cooling) nostril active; departing South or
 * West should begin with the Right (Pingala/Surya, solar/heating) nostril
 * active. Only the four cardinal directions are covered explicitly in the
 * source text, so only those are exposed here.
 */
export function favorableNostrilForTravel(direction) {
  return direction === 'north' || direction === 'east' ? 'left' : 'right';
}

/** Finds the next block (strictly after `from`) whose nostril matches `nostril`. */
export function nextFavorableBlock(cycle, from, nostril) {
  const t = from.getTime();
  for (const block of cycle.blocks) {
    if (block.end.getTime() > t && block.nostril === nostril) {
      return block;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seasonal / hemispheric Tattva note (qualitative, per scripture section 3C)
// ---------------------------------------------------------------------------

/**
 * A coarse, qualitative seasonal classification used only to surface the
 * scripture's Section 3C guidance (Apas/Prithvi Tattva lingering in cold,
 * high-latitude regions; Agni Tattva dominant in hot, equatorial regions).
 * This is descriptive context, not a computed Tattva sub-cycle -- the
 * source text does not give a precise Tattva timing formula.
 */
export function classifySeasonalBand(latitude, date) {
  const absLat = Math.abs(latitude);
  if (absLat < 15) return 'hot-equatorial';

  const month = date.getUTCMonth(); // 0-11
  const isNorthern = latitude >= 0;
  // Meteorological winter: Dec-Feb (N) / Jun-Aug (S).
  const isLocalWinter = isNorthern
    ? month === 11 || month === 0 || month === 1
    : month === 5 || month === 6 || month === 7;

  if (absLat >= 40 && isLocalWinter) return 'cold';
  if (absLat >= 55) return 'cold';
  return 'temperate';
}
