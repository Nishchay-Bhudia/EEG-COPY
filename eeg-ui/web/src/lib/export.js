// Session export (.txt) — full per-epoch data for offline classifier
// calibration. Ported verbatim from the legacy app.js's buildSessionExportTxt/
// downloadTextFile/fmtExportNum/fmtExportProb.
//
// Deliberately kept in plain, UNTRANSLATED, consistently-formatted terms
// regardless of the app's UI language — this file is meant to be read by a
// person doing careful analysis across states/features and pasted back in
// for calibration, not displayed in the app. Do NOT route these formatters
// through useI18n()/localizeNumber() — that would fragment the file's
// digit/date formatting between exports taken in different languages.
// Includes a blank line per epoch for the user to hand-annotate what they
// were actually doing/experiencing before feeding the file back in.

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString();
}

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtExportNum(v, digits) {
  return (v == null || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(digits ?? 3);
}

// Chitta Bhumi probabilities are inconsistently shaped across the three
// analysis paths — demo and the backend-relay path send raw 0-1 floats,
// the local-FFT fallback sends pre-formatted "82.4%" strings. Normalize both
// into the same percentage display rather than let fmtExportNum silently
// blank out the already-formatted strings (Number("82.4%") is NaN).
function fmtExportProb(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'string') return v.includes('%') ? v : (isNaN(Number(v)) ? v : (Number(v) * 100).toFixed(1) + '%');
  const n = Number(v);
  return isNaN(n) ? '—' : (n * 100).toFixed(1) + '%';
}

export function buildSessionExportTxt(sessionName, epochs, notes) {
  const lines = [];
  const sep = '='.repeat(78);
  const dash = '-'.repeat(78);

  lines.push(sep);
  lines.push('SESSION EXPORT: ' + sessionName);
  lines.push('Exported: ' + new Date().toLocaleString());
  lines.push('Total epochs: ' + epochs.length);
  lines.push(sep);
  lines.push('');
  lines.push('SESSION NOTES:');
  lines.push(notes && notes.trim() ? notes.trim() : '(none)');
  lines.push('');
  lines.push(sep);
  lines.push('EPOCH-BY-EPOCH DATA');
  lines.push('Each epoch below has a blank "MY NOTES" line at the end — fill in what');
  lines.push('you actually experienced/were doing during that epoch, then paste this');
  lines.push('whole file back for classifier calibration analysis.');
  lines.push(sep);

  for (const ep of epochs) {
    lines.push('');
    lines.push(dash);
    const elapsed = ep.elapsedSeconds != null ? formatTime(ep.elapsedSeconds) : '—';
    lines.push(`EPOCH ${ep.epochNum}  |  t=+${elapsed}  |  recorded ${formatDate(ep.recordedAt)}  |  source: ${ep.dataQuality || '—'}`);
    lines.push(dash);

    lines.push('');
    lines.push('CHITTA BHUMI');
    lines.push(`  State: ${ep.chittaBhumi || '—'}   Confidence: ${ep.chittaConfidence || '—'}   Depth: ${ep.contemplativeDepth || '—'}`);
    const probEntries = ep.probabilities && typeof ep.probabilities === 'object' ? Object.entries(ep.probabilities) : [];
    lines.push('  Full probabilities: ' + (probEntries.length ? probEntries.map(([k, v]) => `${k}=${fmtExportProb(v)}`).join('  ') : '—'));

    lines.push('');
    lines.push('SWARA NADI');
    lines.push(`  State: ${ep.swara || '—'}   Confidence: ${ep.swaraConfidence || '—'}`);
    if (ep.swaraNote) lines.push(`  Note: ${ep.swaraNote}`);

    lines.push('');
    lines.push('TRIGUNAS');
    lines.push(`  Sattva=${fmtExportNum(ep.gunas?.sattva)}  Rajas=${fmtExportNum(ep.gunas?.rajas)}  Tamas=${fmtExportNum(ep.gunas?.tamas)}  Label=${ep.gunas?.label || '—'}`);

    lines.push('');
    lines.push('BAND POWERS (relative, 0-1)');
    lines.push(`  Delta=${fmtExportNum(ep.bands?.delta)}  Theta=${fmtExportNum(ep.bands?.theta)}  Alpha=${fmtExportNum(ep.bands?.alpha)}  LowBeta=${fmtExportNum(ep.lowBetaPower)}  HighBeta=${fmtExportNum(ep.highBetaPower)}  Beta(combined)=${fmtExportNum(ep.bands?.beta)}  Gamma=${fmtExportNum(ep.bands?.gamma)}`);

    lines.push('');
    lines.push('KEY DISCRIMINATING FEATURES');
    lines.push(`  FAA (frontal alpha asymmetry): ${fmtExportNum(ep.faa)}`);
    lines.push(`  PLV (phase-locking / coherence): ${fmtExportNum(ep.plv)}`);
    lines.push(`  Vritti index: ${fmtExportNum(ep.vrittiIndex)}   Nirodha state: ${ep.nirodhaState || '—'}`);

    if (ep.complexity) {
      lines.push('');
      lines.push('COMPLEXITY / INNER TEXTURE');
      lines.push(`  LZiv=${fmtExportNum(ep.complexity.lziv)}  HiguchiFD=${fmtExportNum(ep.complexity.higuchiFd)}  SampleEntropy=${fmtExportNum(ep.complexity.sampleEntropy)}  PermEntropy=${fmtExportNum(ep.complexity.permEntropy)}`);
    }
    if (ep.aperiodic) {
      lines.push(`  Aperiodic: exponent=${fmtExportNum(ep.aperiodic.exponent)}  offset=${fmtExportNum(ep.aperiodic.offset)}`);
    }

    lines.push('');
    lines.push('TATTVA FLAGS');
    lines.push('  ' + ((ep.tattvaFlags && ep.tattvaFlags.length) ? ep.tattvaFlags.join(', ') : '(none)'));

    if (ep.corroboration && ep.corroboration.axes && ep.corroboration.axes.length) {
      lines.push('');
      lines.push('CORROBORATION (what the signals say)');
      lines.push(`  Overall: ${ep.corroboration.concord || '—'}${ep.corroboration.indeterminate ? ' (indeterminate)' : ''}`);
      for (const ax of ep.corroboration.axes) {
        const agree = ax.agrees === true ? 'agrees' : ax.agrees === false ? 'disagrees' : 'neutral';
        lines.push(`  - ${ax.axis}: ${ax.reading} (${agree})${ax.note ? ' — ' + ax.note : ''}`);
      }
      if (ep.corroboration.caveat) lines.push(`  Caveat: ${ep.corroboration.caveat}`);
    }

    if (ep.heartRate != null || ep.bloodOxygen != null) {
      lines.push('');
      lines.push('VITALS');
      lines.push(`  Heart rate: ${ep.heartRate != null ? ep.heartRate + ' bpm' : '—'}   SpO2: ${ep.bloodOxygen != null ? ep.bloodOxygen + '%' : '—'}`);
    }

    lines.push('');
    lines.push('MY NOTES FOR THIS EPOCH: ______________________________________________');
  }

  lines.push('');
  lines.push(sep);
  lines.push('END OF EXPORT');
  lines.push(sep);

  return lines.join('\n');
}

export function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
