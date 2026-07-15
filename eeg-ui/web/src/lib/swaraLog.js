// ── swaraLog.js — daily breath-check log for the Swar Calendar ────────────────
// Local persistence for detecting Arishta (energetic misalignment): the
// scripture warns that three consecutive days of the observed nostril not
// matching the calculated one is a sign of impending trouble, correctable
// with manual breath-forcing techniques. Stored entirely client-side (no
// backend) keyed by calendar date. Ported verbatim from the standalone
// add-on's swaraLog.ts (TypeScript types dropped).

const STORAGE_KEY = 'swar-calendar:breath-log:v1';

function readLog() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeLog(entries) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) - fail silently,
    // the log is a nice-to-have, not a trust-critical feature.
  }
}

export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Records (or overwrites) today's breath check. */
export function recordBreathCheck(now, expected, reported) {
  const entries = readLog();
  const dateKey = localDateKey(now);
  const entry = {
    date: dateKey,
    checkedAt: now.toISOString(),
    expected,
    reported,
    match: expected === reported,
  };
  const withoutToday = entries.filter((e) => e.date !== dateKey);
  const next = [...withoutToday, entry].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  writeLog(next);
  return next;
}

export function getBreathLog() {
  return readLog();
}

export function getTodaysEntry(now) {
  const dateKey = localDateKey(now);
  return readLog().find((e) => e.date === dateKey) ?? null;
}

/**
 * Counts the current run of consecutive mismatched days ending on the most
 * recent logged day (not necessarily today, so a gap in logging doesn't
 * silently reset context, but a gap does break the "consecutive" streak
 * once a day is skipped).
 */
export function currentMismatchStreak(entries) {
  if (entries.length === 0) return 0;
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  let streak = 0;
  let expectedPrevDate = null;

  for (const entry of sorted) {
    const entryDate = new Date(`${entry.date}T00:00:00`);
    if (expectedPrevDate) {
      const dayDiff = Math.round(
        (expectedPrevDate.getTime() - entryDate.getTime()) / 86400000,
      );
      if (dayDiff !== 1) break; // gap in logging breaks the streak
    }
    if (!entry.match) {
      streak++;
      expectedPrevDate = entryDate;
    } else {
      break;
    }
  }
  return streak;
}
