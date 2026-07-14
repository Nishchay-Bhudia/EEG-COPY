// ── analysis.js — pure EEG analysis pipeline (ported from legacy app.js) ──────
// No DOM, no Vue. Everything the Live Monitor needs to turn a completed epoch
// (or a demo tick) into a display-ready "reading" object:
//   • fft / bandPowers / softmax / classifyLocal — local FFT fallback
//   • mapAnalyzeResponse — shape the Render backend's /analyze JSON
//   • createSmoother     — EMA + hysteresis temporal smoothing (display only)
//   • createDemoSource   — synthetic reading generator for Demo mode
// Math is copied verbatim from the legacy functions of the same name; the only
// change is that module-global mutable state (epoch counters, the `smooth`
// object) is encapsulated in the factory closures instead of file globals.

// ── Constants (ported from app.js top-of-file) ────────────────────────────────
export const SAMPLE_RATE   = 256;
export const COLLECT_SECS  = 4;
export const COLLECT_N     = SAMPLE_RATE * COLLECT_SECS;
export const WAVE_LEN      = 300;
export const DEMO_INTERVAL = 1200;

export const DEPTH_PCT = { 'Deep Inertia': 3, Surface: 12, Emerging: 37, Deep: 62, Profound: 94 };
export const CHITTA_DEPTHS = { Mudha: 'Deep Inertia', Kshipta: 'Surface', Vikshipta: 'Emerging', Ekagra: 'Deep', Niruddha: 'Profound' };
export const SWARA_NOTES = {
  ida: 'Parasympathetic dominance. Receptive, creative and introspective state.',
  pingala: 'Sympathetic dominance. Active, analytical and goal-directed focus.',
  sushumna: 'Equilibrium of solar and lunar channels. Gateway to higher contemplative states.',
};

// Default band powers used by the idle/demo waveform before the first reading.
export const DEFAULT_BANDS = { delta: 0.15, theta: 0.18, alpha: 0.28, low_beta: 0.18, high_beta: 0.13, gamma: 0.08 };

// ── small helpers ─────────────────────────────────────────────────────────────
export function clamp01(x) { return (x == null || isNaN(x)) ? 0 : Math.max(0, Math.min(1, x)); }

// Plain-language band over the vṛtti index — mirrors the backend thresholds.
export function nirodhaLabel(v) {
  return v < 0.20 ? 'Nirodha (still)'
    : v < 0.45 ? 'Settling'
    : v < 0.70 ? 'Active'
    : 'Vikshepa (scattered)';
}

// ── Local FFT + classification (verbatim from app.js) ─────────────────────────
function fft(signal) {
  let size = 1;
  while (size < signal.length) size <<= 1;
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < signal.length; i++) re[i] = signal[i];
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < size; i += len) {
      let cRe = 1, cIm = 0;
      for (let j = 0; j < (len >> 1); j++) {
        const uRe = re[i + j], uIm = im[i + j], h = i + j + (len >> 1);
        const vRe = re[h] * cRe - im[h] * cIm, vIm = re[h] * cIm + im[h] * cRe;
        re[i + j] = uRe + vRe; im[i + j] = uIm + vIm; re[h] = uRe - vRe; im[h] = uIm - vIm;
        const nRe = cRe * wRe - cIm * wIm; cIm = cRe * wIm + cIm * wRe; cRe = nRe;
      }
    }
  }
  const half = size >> 1, mags = new Array(half);
  for (let i = 0; i < half; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / size;
  return mags;
}

// Band edges match the .NET analyser's FeatureExtractor exactly (delta 0.5-4,
// theta 4-8, alpha 8-13, low_beta 13-18, high_beta 18-30, gamma 30-50) so the
// local fallback's Rajas marker (high-beta) lines up with the real classifier.
function bandPowers(mags, sr, sz) {
  const res = sr / sz;
  const bin = hz => Math.round(hz / res);
  const sum = (lo, hi) => {
    let s = 0;
    for (let b = bin(lo); b <= Math.min(bin(hi), mags.length - 1); b++) s += mags[b] * mags[b];
    return s;
  };
  const d = sum(0.5, 4), t = sum(4, 8), a = sum(8, 13), lb = sum(13, 18), hb = sum(18, 30), g = sum(30, 50);
  const tot = d + t + a + lb + hb + g || 1;
  return { delta: d / tot, theta: t / tot, alpha: a / tot, low_beta: lb / tot, high_beta: hb / tot, beta: (lb + hb) / tot, gamma: g / tot };
}

function softmax(logits) {
  const m = Math.max(...logits), ex = logits.map(l => Math.exp(l - m)), s = ex.reduce((a, b) => a + b, 0);
  return ex.map(e => e / s);
}

function pearsonCorr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const xa = a[i] - ma, xb = b[i] - mb; num += xa * xb; da += xa * xa; db += xb * xb; }
  return num / (Math.sqrt(da * db) || 1e-9);
}

// Local Guna classifier — faithful port of the backend's GunaClassifier +
// GunaBlend (eeg-backend/src/NeuroYogic.Analysis/Classification/GunaClassifier.cs,
// GunaBlend.cs). Used only when the .NET analyser is unreachable, so this fallback
// no longer silently drops Gunas/vṛtti.
function classifyGunasLocal(bp, faa, plv, swaraNadi) {
  const relu = x => Math.max(0, x);
  // v4 fix: coherence bonus gated by alpha (see GunaClassifier.cs) — a flat
  // bonus let low-alpha/high-beta readings score falsely Sattvic off PLV alone.
  let sat = bp.alpha * 4.5 + bp.theta * 2.5 + bp.low_beta * 0.8 + relu(plv - 0.50) * bp.alpha * 7.0 + relu(0.20 - Math.abs(faa)) * 1.5;
  let raj = bp.high_beta * 5.5 + relu(0.20 - bp.alpha) * 2.0 + relu(faa) * 1.8 + relu(bp.gamma - 0.10) * 0.8;
  let tam = bp.delta * 4.5 + relu(0.15 - bp.alpha) * 2.5 + relu(0.06 - bp.gamma) * 2.0 + relu(0.45 - plv) * 1.0;

  if (swaraNadi === 'sushumna') { sat += 0.20; raj = Math.max(0, raj - 0.10); }
  else if (swaraNadi === 'pingala') { raj += 0.15; sat = Math.max(0, sat - 0.05); }
  else if (swaraNadi === 'ida') { if (bp.delta > 0.30) tam += 0.10; else sat += 0.08; }

  sat = Math.max(sat, 0.01); raj = Math.max(raj, 0.01); tam = Math.max(tam, 0.01);
  const total = sat + raj + tam;
  const sattva = sat / total, rajas = raj / total, tamas = tam / total;

  const ranked = [['Sattva', sattva], ['Rajas', rajas], ['Tamas', tamas]].sort((a, b) => b[1] - a[1]);
  const [g1, v1] = ranked[0], [g2] = ranked[1], [, v3] = ranked[2];
  const adj = { Sattva: 'Sattvic', Rajas: 'Rajasic', Tamas: 'Tamasic' };
  let label;
  if (v1 - v3 < 0.12) label = 'Balanced (all three)';
  else if (ranked[1][1] >= 0.50 * v1) label = `${adj[g1]}-predominant, ${adj[g2]}-secondary`;
  else label = adj[g1];

  return { sattva, rajas, tamas, label };
}

// classifyLocal — returns a reading WITHOUT epoch/latency (the caller assigns
// those, mirroring the legacy global `epoch` counter which now lives in Monitor).
// `faa` and `plv` are computed by the caller from the real left/right channel
// pair (see analyzeLocal below) — this used to be `Math.random()`, which made
// Swara AND every guna/vṛtti figure derived from it meaningless noise.
function classifyLocal(bp, faa, plv) {
  const states = ['Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];
  const logits = [
    bp.beta * 3.0 + bp.gamma * 1.5 - bp.alpha * 1.5,
    bp.alpha * 1.5 + bp.beta * 1.5 - bp.theta * 0.5,
    bp.alpha * 3.5 + bp.theta * 1.0 - bp.beta * 2.0,
    bp.theta * 3.0 + bp.delta * 2.0 - bp.beta * 2.5,
  ];
  const probs = softmax(logits);
  const maxI = probs.indexOf(Math.max(...probs));
  const state = states[maxI];
  const probMap = {};
  states.forEach((s, i) => { probMap[s] = (probs[i] * 100).toFixed(1) + '%'; });

  // ─────────────────────────────────────────────────────────────────────────
  // DO NOT TOUCH — Swara/Nadi. Kept exactly as originally validated (random-
  // jitter asym, ±0.04 threshold) rather than wired to the real per-channel
  // FAA computed below. If tempted to "fix" this to use real FAA again,
  // don't — ask first.
  // ─────────────────────────────────────────────────────────────────────────
  const asym = (Math.random() - 0.5) * 0.3;
  const isIda = asym < -0.04, isPingala = asym > 0.04;
  const swaraState = isIda ? 'Ida Nadi — right hemisphere dominant'
    : isPingala ? 'Pingala Nadi — left hemisphere dominant'
      : 'Sushumna — both nadis balanced';
  const swaraNote = isIda ? SWARA_NOTES.ida : isPingala ? SWARA_NOTES.pingala : SWARA_NOTES.sushumna;

  // Gunas/vṛtti still use the REAL per-channel FAA (not the display-only `asym`
  // above) — the swara-secondary term in the guna formula needs the accurate
  // nadi, since guna classification is meant to be as accurate as the backend's.
  const swaraNadi = faa < -0.15 ? 'ida' : faa > 0.15 ? 'pingala' : 'sushumna';

  const tattva = [];
  if (bp.gamma > 0.12) tattva.push('Gamma Spike');
  if (bp.theta > 0.25 && bp.high_beta < 0.10) tattva.push('Pratyahara Window');
  if (bp.delta > 0.35 && bp.alpha > 0.15) tattva.push('Turiya Approach');
  if (plv > 0.80 && Math.abs(faa) < 0.10) tattva.push('Sushumna Activated');
  if (bp.high_beta > 0.30) tattva.push('High-Beta Agitation');
  if (bp.delta > 0.40 && bp.alpha < 0.10) tattva.push('Tamasic State');

  const gunas = classifyGunasLocal(bp, faa, plv, swaraNadi);
  // Same formula as VedanticAnalyzer.VrittiIndex.
  const vritti = Math.max(0, Math.min(1, 1.6 * bp.high_beta + 0.35 * (1 - plv) - 0.15));
  const nirodhaState = nirodhaLabel(vritti);

  const depth = CHITTA_DEPTHS[state];
  return {
    data_quality: '✓ local FFT',
    chitta_bhumi: { state, depth, confidence: probMap[state], probabilities: probMap },
    swara: { state: swaraState, confidence: Math.abs(asym) > 0.12 ? 'High' : 'Moderate', note: swaraNote },
    band_powers: { relative: bp },
    eeg_spectrum: bp,
    alpha_asymmetry: asym,
    // DO NOT TOUCH note above applies to alpha_asymmetry (drives the swara
    // display/asym-thumb, deliberately the jittered value) — `faa` is a
    // separate field carrying the REAL per-channel asymmetry already used
    // for the actual guna/vritti math above, kept distinct so epoch export
    // gets accurate data without changing anything about the swara display.
    faa,
    connectivity: { plv },
    tattva_flags: tattva,
    contemplative_depth: depth,
    gunas,
    vritti_index: vritti,
    nirodha_state: nirodhaState,
  };
}

// Local FFT fallback over a completed-epoch snapshot. Returns a reading (no
// epoch/latency) or null when there is not enough signal. Ported from the tail
// of legacy processBluetoothEEG() — per-channel bands so FAA/PLV/Gunas aren't
// guesswork. Previously only channel 0 was used and FAA was `Math.random()`,
// which made Swara and every guna/vṛtti figure derived from it meaningless.
export function analyzeLocal(snapshot, sampleRate) {
  const chBp = [];
  for (let c = 0; c < (snapshot ? snapshot.length : 0); c++) {
    const sig = snapshot[c] || [];
    if (sig.length < 64) continue;
    const sz = Math.pow(2, Math.floor(Math.log2(sig.length)));
    chBp.push({ ch: c, bp: bandPowers(fft(sig.slice(-sz)), sampleRate, sz) });
  }
  if (!chBp.length) return null;

  // Whole-head average band powers (same convention as the .NET analyser).
  const bp = {};
  for (const k of ['delta', 'theta', 'alpha', 'low_beta', 'high_beta', 'beta', 'gamma']) {
    bp[k] = chBp.reduce((s, x) => s + x.bp[k], 0) / chBp.length;
  }

  // Left = channels 0,1 (TP9,AF7); Right = channels 2,3 (AF8,TP10) — same
  // hemisphere assignment as the analyser's FeatureExtractor default indices.
  const leftCh = chBp.filter(x => x.ch < 2), rightCh = chBp.filter(x => x.ch >= 2);
  const leftAlpha = leftCh.length ? leftCh.reduce((s, x) => s + x.bp.alpha, 0) / leftCh.length : bp.alpha;
  const rightAlpha = rightCh.length ? rightCh.reduce((s, x) => s + x.bp.alpha, 0) / rightCh.length : bp.alpha;
  const faa = Math.max(-2, Math.min(2, Math.log(rightAlpha + 1e-9) - Math.log(leftAlpha + 1e-9)));

  // PLV proxy: |correlation| between a left- and a right-hemisphere channel's raw
  // signal — not a true Hilbert-phase PLV (that always comes from the analyser),
  // but a reasonable coherence stand-in for this degraded fallback path.
  const plv = snapshot.length >= 3
    ? Math.max(0, Math.min(1, Math.abs(pearsonCorr(snapshot[0], snapshot[2]))))
    : 0.5;

  return classifyLocal(bp, faa, plv);
}

// Map the Render backend /analyze JSON into a reading (no epoch/latency).
// Ported verbatim from the success branch of legacy processBluetoothEEG().
export function mapAnalyzeResponse(data) {
  return {
    data_quality: '✓ BLE → Render',
    timestamp: new Date().toISOString().slice(11, 22) + ' UTC',
    chitta_bhumi: {
      state: data.chitta_bhumi?.state || '—',
      depth: data.chitta_bhumi?.depth || data.depth || '—',
      confidence: data.chitta_bhumi?.confidence || '—',
      probabilities: data.chitta_bhumi?.probabilities || {},
      corroboration: data.chitta_bhumi?.corroboration || null,
    },
    swara: {
      state: data.swara?.state || '—',
      confidence: data.swara?.confidence || '—',
      note: data.swara?.note || SWARA_NOTES[(data.swara?.state || '').toLowerCase().split(' ')[0]] || '',
    },
    tattva_flags: data.tattva_flags || data.tattva || [],
    contemplative_depth: data.chitta_bhumi?.depth || data.depth || '—',
    alpha_asymmetry: data.hemispheric_asymmetry?.asymmetry ?? data.alpha_asymmetry ?? 0,
    faa: data.hemispheric_asymmetry?.asymmetry ?? data.alpha_asymmetry ?? null,
    eeg_spectrum: data.eeg_spectrum || data.band_relative || null,
    gunas: data.gunas || null,
    vritti_index: data.vritti_index ?? null,
    nirodha_state: data.nirodha_state || null,
    complexity: data.complexity || null,
    aperiodic: data.aperiodic || null,
    connectivity: data.connectivity || null,
    blood_oxygen: data.blood_oxygen ?? null,
    heart_rate: data.heart_rate ?? null,
  };
}

// ── Temporal smoothing (display only) ─────────────────────────────────────────
// Ported from app.js smoothReading()/_ema()/coarseGunaLabel()/numify(). A single
// 4 s epoch is noisy; continuous quantities are EMA-filtered and discrete labels
// (bhūmi, swara) switch only when a new candidate persists (hysteresis). Raw
// epochs are still stored unsmoothed — the caller passes the raw reading to
// storeEpoch and the smoothed one to the display.
const SMOOTH_ALPHA  = 0.2;   // EMA factor (~18 s time constant at 4 s epochs)
const STATE_DWELL   = 2;     // epochs a new label must persist before switching
const CHITTA_STATES = ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];

function numify(x) {
  if (x == null) return null;
  const n = typeof x === 'number' ? x : parseFloat(x);
  return isNaN(n) ? null : n;
}

function coarseGunaLabel(s, r, t) {
  const max = Math.max(s, r, t), min = Math.min(s, r, t);
  if (max - min < 0.12) return 'Balanced (all three)';
  return max === s ? 'Sattvic' : max === r ? 'Rajasic' : 'Tamasic';
}

// Factory: each Monitor instance gets its own smoother with reset().
export function createSmoother() {
  let smooth = null;

  function reset() { smooth = null; }

  function ema(key, value) {
    const prev = smooth.ema[key];
    if (value == null || isNaN(value)) return prev == null ? null : prev;
    smooth.ema[key] = (prev == null) ? value : prev + SMOOTH_ALPHA * (value - prev);
    return smooth.ema[key];
  }

  function apply(r) {
    if (!smooth) smooth = { ema: {}, epochs: 0, state: null, cand: null, candN: 0,
                            swara: null, swaraFull: null, swCand: null, swN: 0 };
    smooth.epochs++;

    const vritti = ema('vritti', r.vritti_index);
    const asym   = ema('asym', numify(r.alpha_asymmetry));

    const spectrum = {};
    ['delta', 'theta', 'alpha', 'low_beta', 'high_beta', 'beta', 'gamma'].forEach(b => {
      const v = ema('band_' + b, numify(r.eeg_spectrum?.[b]));
      if (v != null) spectrum[b] = v;
    });

    const g = r.gunas || {};
    const sattva = ema('sattva', numify(g.sattva));
    const rajas  = ema('rajas',  numify(g.rajas));
    const tamas  = ema('tamas',  numify(g.tamas));

    const lz  = ema('lziv', r.complexity?.lziv);
    const hfd = ema('hfd',  r.complexity?.higuchi_fd);
    const se  = ema('se',   r.complexity?.sample_entropy);
    const pe  = ema('pe',   r.complexity?.perm_entropy);
    const cx  = lz != null ? { lziv: lz, higuchi_fd: hfd, sample_entropy: se, perm_entropy: pe } : null;

    const apx = ema('apx', r.aperiodic?.exponent);
    const apo = ema('apo', r.aperiodic?.offset);
    const ap  = apx != null ? { exponent: apx, offset: apo } : null;

    const raw = r.chitta_bhumi?.probabilities || {};
    const probs = {}; let tot = 0;
    CHITTA_STATES.forEach(s => { const v = ema('p_' + s, numify(raw[s])); probs[s] = v == null ? 0 : v; tot += probs[s]; });
    if (tot > 0) CHITTA_STATES.forEach(s => probs[s] /= tot);

    const winner = CHITTA_STATES.reduce((a, b) => (probs[b] > probs[a] ? b : a), CHITTA_STATES[0]);
    if (smooth.state == null) smooth.state = winner;
    else if (winner !== smooth.state) {
      smooth.candN = (winner === smooth.cand) ? smooth.candN + 1 : 1;
      smooth.cand = winner;
      if (smooth.candN >= STATE_DWELL) { smooth.state = winner; smooth.cand = null; smooth.candN = 0; }
    } else { smooth.cand = null; smooth.candN = 0; }
    const state = smooth.state;

    const zone = (r.swara?.state || '').split(' ')[0] || null;
    if (zone) {
      if (smooth.swara == null) { smooth.swara = zone; smooth.swaraFull = r.swara; }
      else if (zone !== smooth.swara) {
        smooth.swN = (zone === smooth.swCand) ? smooth.swN + 1 : 1;
        smooth.swCand = zone;
        if (smooth.swN >= STATE_DWELL) { smooth.swara = zone; smooth.swaraFull = r.swara; smooth.swCand = null; smooth.swN = 0; }
      } else { smooth.swCand = null; smooth.swN = 0; smooth.swaraFull = r.swara; }
    }

    return {
      ...r,
      chitta_bhumi: {
        state,
        depth: CHITTA_DEPTHS[state] || r.chitta_bhumi?.depth || '—',
        confidence: probs[state],
        probabilities: probs,
        // Carried through unsmoothed — it's the latest epoch's signed corroboration.
        corroboration: r.chitta_bhumi?.corroboration,
      },
      contemplative_depth: CHITTA_DEPTHS[state] || r.contemplative_depth,
      swara: smooth.swaraFull || r.swara,
      alpha_asymmetry: asym != null ? asym : r.alpha_asymmetry,
      eeg_spectrum: Object.keys(spectrum).length ? spectrum : r.eeg_spectrum,
      gunas: sattva != null ? { sattva, rajas, tamas, label: coarseGunaLabel(sattva, rajas, tamas) } : r.gunas,
      vritti_index: vritti != null ? vritti : r.vritti_index,
      nirodha_state: vritti != null ? nirodhaLabel(vritti) : r.nirodha_state,
      complexity: cx || r.complexity,
      aperiodic: ap || r.aperiodic,
    };
  }

  return { apply, reset };
}

// ── Demo mode source (ported from the runDemo closure in app.js) ──────────────
const DEMO_SWARA = [
  'Ida (Parasympathetic / Lunar)',
  'Pingala (Sympathetic / Solar)',
  'Sushumna (Balanced / Central)',
];
const DEMO_BANDS = {
  Mudha:    { delta: 0.44, theta: 0.17, alpha: 0.07, low_beta: 0.15, high_beta: 0.10, gamma: 0.04, beta: 0.25 },
  Kshipta:  { delta: 0.09, theta: 0.12, alpha: 0.12, low_beta: 0.22, high_beta: 0.33, gamma: 0.10, beta: 0.55 },
  Vikshipta:{ delta: 0.14, theta: 0.17, alpha: 0.26, low_beta: 0.21, high_beta: 0.14, gamma: 0.08, beta: 0.35 },
  Ekagra:   { delta: 0.08, theta: 0.29, alpha: 0.37, low_beta: 0.12, high_beta: 0.07, gamma: 0.07, beta: 0.19 },
  Niruddha: { delta: 0.05, theta: 0.18, alpha: 0.30, low_beta: 0.10, high_beta: 0.05, gamma: 0.32, beta: 0.15 },
};
const DEMO_GUNAS = {
  Mudha:    { sattva: 0.20, rajas: 0.15, tamas: 0.65, label: 'Tamasic',  note: 'Tamas predominates — heaviness and dullness. Stimulating pranayama recommended.' },
  Kshipta:  { sattva: 0.12, rajas: 0.73, tamas: 0.15, label: 'Rajasic',  note: 'Rajas predominates — high-beta desynchronization, prefrontal hyperarousal.' },
  Vikshipta:{ sattva: 0.52, rajas: 0.32, tamas: 0.16, label: 'Balanced', note: 'The three Gunas are in relative equilibrium — a balanced, transitional state.' },
  Ekagra:   { sattva: 0.78, rajas: 0.12, tamas: 0.10, label: 'Sattvic',  note: 'Sattva predominates — alpha synchrony and Fm-θ. Optimal for contemplative practice.' },
  Niruddha: { sattva: 0.88, rajas: 0.07, tamas: 0.05, label: 'Sattvic',  note: 'Deep Sattva — global gamma coherence. Gunatita: beyond the three Gunas.' },
};
const DEMO_TEXTURE = {
  Mudha:    { vritti: 0.24, complexity: { lziv: 0.14, higuchi_fd: 1.05, sample_entropy: 0.21, perm_entropy: 0.61 }, aperiodic: { exponent: 3.42, offset: 3.3 } },
  Kshipta:  { vritti: 0.69, complexity: { lziv: 0.43, higuchi_fd: 1.88, sample_entropy: 0.52, perm_entropy: 0.73 }, aperiodic: { exponent: 1.16, offset: 0.95 } },
  Vikshipta:{ vritti: 0.26, complexity: { lziv: 0.38, higuchi_fd: 1.30, sample_entropy: 0.45, perm_entropy: 0.66 }, aperiodic: { exponent: 2.30, offset: 2.1 } },
  Ekagra:   { vritti: 0.07, complexity: { lziv: 0.35, higuchi_fd: 1.10, sample_entropy: 0.49, perm_entropy: 0.57 }, aperiodic: { exponent: 3.22, offset: 3.27 } },
  Niruddha: { vritti: 0.00, complexity: { lziv: 0.50, higuchi_fd: 1.72, sample_entropy: 0.94, perm_entropy: 0.85 }, aperiodic: { exponent: 1.36, offset: 1.16 } },
};

// Signed-corroboration fixtures per bhūmi for demo mode — hand-authored to match
// what the backend `corroborate` produces on the DEMO_TEXTURE values above, so
// clicking ▶ Demo shows a representative "WHAT THE SIGNALS SAY" card with no
// backend or headband. (Live/Bluetooth+backend paths get the real thing.)
const DEMO_CORROB = {
  Mudha: { concord: 'corroborated', indeterminate: false, caveat: '', axes: [
    { axis: 'neural_complexity', reading: 'low richness (0.23)', agrees: true, note: 'low complexity is consistent with tāmasic dullness' },
    { axis: 'cortical_quietude', reading: 'steep 1/f slope (exponent 3.42)', agrees: true, note: 'steep 1/f fits low-arousal heaviness' },
    { axis: 'mental_chatter', reading: 'moderate vṛtti (0.24)', agrees: null, note: '' },
  ] },
  Kshipta: { concord: 'corroborated', indeterminate: false, caveat: '', axes: [
    { axis: 'neural_complexity', reading: 'moderate richness (0.58)', agrees: null, note: '' },
    { axis: 'cortical_quietude', reading: 'moderate 1/f slope (exponent 1.16)', agrees: null, note: '' },
    { axis: 'mental_chatter', reading: 'high vṛtti (0.69)', agrees: true, note: 'elevated high-β chatter fits Kṣipta' },
  ] },
  Vikshipta: { concord: 'corroborated', indeterminate: false, caveat: '', axes: [
    { axis: 'neural_complexity', reading: 'moderate richness (0.39)', agrees: true, note: 'mid-range complexity fits an oscillating mind' },
    { axis: 'cortical_quietude', reading: 'steep 1/f slope (exponent 2.30)', agrees: null, note: '' },
    { axis: 'mental_chatter', reading: 'moderate vṛtti (0.26)', agrees: true, note: 'some restlessness fits an oscillating mind' },
  ] },
  Ekagra: { concord: 'corroborated', indeterminate: false, caveat: '', axes: [
    { axis: 'neural_complexity', reading: 'high richness (0.63)', agrees: true, note: 'retained complexity — genuine stillness, not drowsiness' },
    { axis: 'cortical_quietude', reading: 'steep 1/f slope (exponent 3.22)', agrees: true, note: 'steep 1/f — a quiet, inhibition-weighted cortex' },
    { axis: 'mental_chatter', reading: 'low vṛtti (0.07)', agrees: true, note: 'stilled fluctuations — citta-vṛtti-nirodha' },
    { axis: 'absorption_signature', reading: 'present', agrees: true, note: 'Fm-θ + α synchrony — the focused-attention absorption signature' },
    { axis: 'effortlessness', reading: 'effortless', agrees: true, note: 'effortless — the flow-like signature of dhyāna, not strained holding' },
  ] },
  Niruddha: { concord: 'corroborated', indeterminate: false, caveat: '', axes: [
    { axis: 'neural_complexity', reading: 'high richness (0.68)', agrees: true, note: 'retained complexity — genuine stillness, not drowsiness' },
    { axis: 'cortical_quietude', reading: 'moderate 1/f slope (exponent 1.36)', agrees: null, note: '' },
    { axis: 'mental_chatter', reading: 'low vṛtti (0.00)', agrees: true, note: 'stilled fluctuations — citta-vṛtti-nirodha' },
    { axis: 'effortlessness', reading: 'effortless', agrees: true, note: 'effortless — the flow-like signature of dhyāna, not strained holding' },
  ] },
};

// Factory: yields the next synthetic reading each call (self-contained counters).
export function createDemoSource() {
  const ALL = ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];
  let epoch = 0, demoEpoch = 0, stateIdx = 0, swaraIdx = 0;

  function next() {
    demoEpoch++;
    const state = ALL[stateIdx % ALL.length];
    const swara = DEMO_SWARA[swaraIdx % DEMO_SWARA.length];
    const bp = { ...DEMO_BANDS[state] };
    Object.keys(bp).forEach(k => { bp[k] = Math.max(0.01, bp[k] + (Math.random() - 0.5) * 0.03); });

    const faa = swara.includes('Ida') ? -(0.15 + Math.random() * 0.25)
      : swara.includes('Pingala') ? (0.15 + Math.random() * 0.25)
        : (Math.random() - 0.5) * 0.10;
    const isIda = faa < -0.15, isPingala = faa > 0.15;

    const rawScores = {
      Mudha:    Math.max(0, bp.delta - 0.30) * 3.0 + Math.max(0, 0.10 - bp.alpha) * 2.0,
      Kshipta:  Math.max(0, bp.high_beta - 0.15) * 4.0 + Math.max(0, 0.15 - bp.alpha) * 2.0,
      Vikshipta:Math.max(0, bp.alpha - 0.10) * 2.0 + 0.8,
      Ekagra:   Math.max(0, bp.theta - 0.20) * 3.0 + Math.max(0, bp.alpha - 0.25) * 3.0,
      Niruddha: Math.max(0, bp.gamma - 0.15) * 4.0,
    };
    const scoreTotal = Object.values(rawScores).reduce((a, b) => a + b, 1e-6);
    const probs = {};
    ALL.forEach(s => { probs[s] = rawScores[s] / scoreTotal; });
    probs[state] = Math.max(probs[state], 0.45);
    const biasTotal = Object.values(probs).reduce((a, b) => a + b, 0);
    ALL.forEach(s => { probs[s] /= biasTotal; });

    const tattva = [];
    if (bp.alpha > 0.35 && bp.high_beta < 0.10) tattva.push('Pratyahara Window');
    if (bp.theta  > 0.28) tattva.push('Fm-θ Activation (Frontal Midline Theta)');
    if (bp.gamma  > 0.15) tattva.push('Gamma Surge — Ajna/Sahasrara activation');
    if (bp.delta  > 0.40 && bp.alpha < 0.10) tattva.push('Tamasic State — Kapalabhati recommended');
    if (bp.high_beta > 0.30) tattva.push('High-Beta Agitation — Nadi Shodhana recommended');

    epoch++;
    const depth = CHITTA_DEPTHS[state];
    const gunas = { ...DEMO_GUNAS[state] };
    const swaraKey = isIda ? 'ida' : isPingala ? 'pingala' : 'sushumna';
    const tex = DEMO_TEXTURE[state] || DEMO_TEXTURE.Vikshipta;
    const vritti = clamp01(tex.vritti + (Math.random() - 0.5) * 0.05);

    return {
      epoch,
      latency_ms: 18 + Math.random() * 8,
      data_quality: '✓ demo',
      chitta_bhumi: { state, depth, confidence: probs[state].toFixed(3), probabilities: probs, corroboration: DEMO_CORROB[state] },
      swara: { state: swara, confidence: 'Moderate', note: SWARA_NOTES[swaraKey] },
      band_powers: { relative: bp },
      eeg_spectrum: bp,
      alpha_asymmetry: faa,
      faa,
      tattva_flags: tattva,
      contemplative_depth: depth,
      gunas,
      vritti_index: vritti,
      nirodha_state: nirodhaLabel(vritti),
      complexity: tex.complexity,
      aperiodic: tex.aperiodic,
      blood_oxygen: +(96 + Math.random() * 3).toFixed(1),
      heart_rate: Math.round(60 + Math.random() * 25),
    };
    // (counters advanced after return via the closure below)
  }

  // Wrap next() so we can advance the cycle counters the way legacy did
  // (every 3 epochs → next state, every 7 → next swara).
  return {
    next() {
      const r = next();
      if (demoEpoch % 3 === 0) stateIdx++;
      if (demoEpoch % 7 === 0) swaraIdx++;
      return r;
    },
  };
}
