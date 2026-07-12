// Client-domain helpers ported verbatim from the legacy app.js.
// - CLIENT_STATUS maps a client's status enum → display label + CSS class
//   (the .status--* classes are defined in tokens.css / Client.vue scoped CSS).
// - monthsSince turns an ISO "practicing since" date into a human phrase.
// - formatDate / formatDuration mirror the legacy formatters used across views.

export const CLIENT_STATUS = {
  plateau:  { label: 'Plateau',         cls: 'status--plateau' },
  progress: { label: 'Progress',        cls: 'status--progress' },
  issue:    { label: 'Needs attention', cls: 'status--issue' },
  new:      { label: 'New',             cls: 'status--new' },
};

export function monthsSince(iso) {
  if (!iso) return '';
  const then = new Date(iso), now = new Date();
  let m = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  m = Math.max(0, m);
  if (m < 1) return '<1 month practicing';
  if (m < 12) return `${m} month${m === 1 ? '' : 's'} practicing`;
  return `${Math.floor(m / 12)}y ${m % 12}m practicing`;
}

export function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

export function formatDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}
