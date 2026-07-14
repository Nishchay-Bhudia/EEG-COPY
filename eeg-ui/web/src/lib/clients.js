// Client-domain helpers ported verbatim from the legacy app.js.
// - CLIENT_STATUS maps a client's status enum → i18n label key + CSS class
//   (the .status--* classes are defined in tokens.css / Client.vue scoped CSS).
//   Callers translate via t(CLIENT_STATUS[status].labelKey).
// - monthsSince turns an ISO "practicing since" date into a human phrase.
// - formatDate / formatDuration mirror the legacy formatters used across views.
import { useI18n } from '@/composables/useI18n';

const { t, tf, localizeNumber } = useI18n();

export const CLIENT_STATUS = {
  plateau:  { labelKey: 'clientStatusPlateau', cls: 'status--plateau' },
  progress: { labelKey: 'clientStatusProgress', cls: 'status--progress' },
  issue:    { labelKey: 'clientStatusIssue', cls: 'status--issue' },
  new:      { labelKey: 'clientStatusNew', cls: 'status--new' },
};

export function monthsSince(iso) {
  if (!iso) return '';
  const then = new Date(iso), now = new Date();
  let m = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  m = Math.max(0, m);
  if (m < 1) return t('monthsPracticingLt1');
  if (m < 12) return tf('monthsPracticing', { m: localizeNumber(m), s: m === 1 ? '' : 's' });
  return tf('yearsMonthsPracticing', { y: localizeNumber(Math.floor(m / 12)), m: localizeNumber(m % 12) });
}

export function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

export function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${localizeNumber(m)}m ${localizeNumber(s)}s`;
}
