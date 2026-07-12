<script setup>
// Read-only display of a single analysed reading — the shared render surface for
// BOTH the student's Live Monitor and the instructor's Watch view. Every card is a
// pure function of the `reading` prop (the mapAnalyzeResponse shape, which is also
// exactly the hub's "analysis" payload), so the same component renders a local BLE
// epoch and a remotely-streamed one identically.
import { computed } from 'vue';
import { DEPTH_PCT, CHITTA_DEPTHS, SWARA_NOTES, clamp01 } from '@/lib/analysis';

const props = defineProps({
  reading: { type: Object, default: null },
  hasPPG: { type: Boolean, default: false },
  spo2Fallback: { type: [Number, null], default: null },
  hrFallback: { type: [Number, null], default: null },
});

// ── Chitta Bhumi ──
const chitta = computed(() => {
  const ch = props.reading?.chitta_bhumi || {};
  const state = ch.state || '—';
  const depth = ch.depth || CHITTA_DEPTHS[state] || 'Surface';
  const color = state === 'Mudha' ? '#4A3060'
    : state === 'Kshipta' ? 'var(--kshipta)'
      : state === 'Vikshipta' ? 'var(--vikshipta)'
        : state === 'Ekagra' ? 'var(--ekagra)' : 'var(--niruddha)';
  const conf = ch.confidence;
  const confText = conf == null ? '—'
    : typeof conf === 'number' ? (conf * 100).toFixed(1) + '%' : conf;
  return { state, sub: ch.depth || confText || '—', depth, depthPct: DEPTH_PCT[depth] ?? 12, color, confText };
});

function fmtProb(raw) {
  if (raw == null) return { text: '—', width: 0 };
  const pct = typeof raw === 'number' ? raw * 100 : parseFloat(raw);
  if (isNaN(pct)) return { text: String(raw), width: 0 };
  return { text: pct.toFixed(1) + '%', width: Math.max(0, Math.min(100, pct)) };
}
const PROB_STATES = ['Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];
const probList = computed(() => {
  const probs = props.reading?.chitta_bhumi?.probabilities || {};
  return PROB_STATES.map(s => ({ key: s.toLowerCase(), label: s, ...fmtProb(probs[s]) }));
});

// ── Signed corroboration (Western neuromarkers folded under the bhūmi) ──
const CORROB_LAY_AXIS = {
  neural_complexity:    'Mind richness',
  cortical_quietude:    'Background stillness',
  mental_chatter:       'Mental chatter',
  absorption_signature: 'Focus',
  effortlessness:       'Effortlessness',
};
const CORROB_CONCORD = {
  corroborated: 'Signals agree',
  mixed:        'Mixed signals',
  tension:      'Signals in tension',
  inconclusive: 'Inconclusive',
};
const corrTone  = a => (a === true ? 'support' : a === false ? 'tension' : 'neutral');
const corrGlyph = a => (a === true ? '✓' : a === false ? '~' : '–');
const corrob = computed(() => {
  const co = props.reading?.chitta_bhumi?.corroboration;
  if (!co || !co.axes || !co.axes.length) return null;
  return {
    concordLabel: CORROB_CONCORD[co.concord] || co.concord,
    concordTone: co.concord === 'corroborated' ? 'support' : co.concord === 'tension' ? 'tension' : 'neutral',
    indeterminate: !!co.indeterminate,
    caveat: co.caveat || '',
    axes: co.axes.map((a, i) => ({
      key: i,
      name: CORROB_LAY_AXIS[a.axis] || a.axis,
      note: a.note || '',
      chip: (a.reading || '').split(/[\s(]/)[0],
      tone: corrTone(a.agrees),
      glyph: corrGlyph(a.agrees),
    })),
  };
});

// ── Swara ──
const swara = computed(() => {
  const sw = props.reading?.swara || {};
  const st = (sw.state || '').toLowerCase();
  const isIda = /ida/.test(st);
  const isPingala = /pingala/.test(st);
  const isSushumna = !isIda && !isPingala;
  const asym = props.reading?.alpha_asymmetry || 0;
  const clamped = Math.max(-0.5, Math.min(0.5, asym));
  const pct = (clamped / 0.5) * 50;
  const fillBg = isIda ? 'var(--ida)' : isPingala ? 'var(--pingala)' : 'var(--sushumna)';
  const fill = pct > 0
    ? { left: '50%', right: (100 - (50 + pct)) + '%', background: fillBg }
    : pct < 0
      ? { left: (50 + pct) + '%', right: '50%', background: fillBg }
      : { left: '50%', right: '50%' };
  return {
    isIda, isPingala, isSushumna,
    note: sw.note || (isIda ? SWARA_NOTES.ida : isPingala ? SWARA_NOTES.pingala : SWARA_NOTES.sushumna),
    confidence: sw.confidence || '—',
    thumb: { left: (50 + pct) + '%', background: fillBg },
    fill,
  };
});

// ── Spectral bands ──
const BANDS = [
  { key: 'delta', name: 'Delta', hz: '1–4 Hz', sym: 'δ' },
  { key: 'theta', name: 'Theta', hz: '4–8 Hz', sym: 'θ' },
  { key: 'alpha', name: 'Alpha', hz: '8–13 Hz', sym: 'α' },
  { key: 'beta',  name: 'Beta',  hz: '13–30 Hz', sym: 'β' },
  { key: 'gamma', name: 'Gamma', hz: '30–50 Hz', sym: 'γ' },
];
const bandList = computed(() => {
  const s = props.reading?.eeg_spectrum || (props.reading?.band_powers && props.reading.band_powers.relative) || {};
  return BANDS.map(b => {
    const raw = s[b.key] ?? null;
    const pct = raw != null ? Math.round(raw * 100) : null;
    return { ...b, text: pct != null ? pct + '%' : '—', width: pct ?? 0 };
  });
});

// ── Trigunas ──
const GUNAS = [
  { key: 'sattva', name: 'Sattva', hz: 'clarity', sym: '☀' },
  { key: 'rajas',  name: 'Rajas',  hz: 'activity', sym: '🔥' },
  { key: 'tamas',  name: 'Tamas',  hz: 'inertia', sym: '🌑' },
];
const gunaList = computed(() => {
  const g = props.reading?.gunas || {};
  return GUNAS.map(x => {
    const raw = g[x.key] ?? null;
    const pct = raw != null ? Math.round(raw * 100) : null;
    return { ...x, text: pct != null ? pct + '%' : '—', width: pct ?? 0 };
  });
});
const gunaSummary = computed(() => {
  const g = props.reading?.gunas || {};
  const label = g.label || (g.sattva > g.rajas && g.sattva > g.tamas ? 'Sattvic'
    : g.rajas > g.tamas ? 'Rajasic' : g.tamas ? 'Tamasic' : '—');
  const note = label === 'Sattvic' ? 'clarity & balance dominant'
    : label === 'Rajasic' ? 'activity & passion dominant'
      : label === 'Tamasic' ? 'inertia & heaviness dominant' : '';
  return { label: label || '—', note };
});

// ── Inner Texture ──
const texture = computed(() => {
  const r = props.reading || {};
  const vritti = r.vritti_index != null ? r.vritti_index * 100 : null;
  let richness = null;
  const cx = r.complexity;
  if (cx) {
    const parts = [
      clamp01(cx.lziv),
      clamp01(cx.perm_entropy),
      clamp01(cx.sample_entropy / 1.5),
      clamp01((cx.higuchi_fd - 1) / 1),
    ];
    richness = (parts.reduce((a, b) => a + b, 0) / parts.length) * 100;
  }
  const ap = r.aperiodic;
  const stillness = (ap && ap.exponent != null)
    ? clamp01((ap.exponent - 1.0) / (3.5 - 1.0)) * 100 : null;
  const bar = v => ({ text: v != null ? Math.round(v) + '%' : '—', width: v != null ? Math.round(v) : 0 });
  return {
    nirodha: r.nirodha_state || '—',
    vritti: bar(vritti),
    richness: bar(richness),
    stillness: bar(stillness),
  };
});

// ── Tattva flags ──
const tattvaFlags = computed(() => props.reading?.tattva_flags || []);

// ── Vitals (reading value wins; else caller-supplied live fallback) ──
const spo2Display = computed(() => {
  const v = props.reading?.blood_oxygen ?? props.spo2Fallback;
  return v != null ? v.toFixed(1) : '—';
});
const hrDisplay = computed(() => {
  const v = props.reading?.heart_rate ?? props.hrFallback;
  return v != null ? v.toFixed(0) : '—';
});
const spo2Live = computed(() => (props.reading?.blood_oxygen ?? props.spo2Fallback) != null);
const hrLive = computed(() => (props.reading?.heart_rate ?? props.hrFallback) != null);
</script>

<template>
  <div class="reading-panel">
    <!-- ─ Chitta Bhumi ─ -->
    <div class="card chitta-card">
      <div class="card-label">CHITTA BHUMI</div>
      <div class="chitta-state">{{ chitta.state }}</div>
      <div class="chitta-sub">{{ chitta.sub }}</div>
      <div class="depth-track">
        <div class="depth-stops">
          <span class="depth-stop">Kshipta</span>
          <span class="depth-stop">Vikshipta</span>
          <span class="depth-stop">Ekagra</span>
          <span class="depth-stop">Niruddha</span>
        </div>
        <div class="depth-bar">
          <div class="depth-fill" :style="{ width: chitta.depthPct + '%', background: chitta.color }"></div>
        </div>
      </div>
      <div class="chitta-meta">
        <span class="meta-label">CONFIDENCE</span>
        <span class="meta-value">{{ chitta.confText }}</span>
      </div>

      <div v-if="corrob" class="corrob">
        <div class="corrob-head">
          <span class="card-label">WHAT THE SIGNALS SAY</span>
          <span class="corrob-concord" :class="corrob.concordTone">{{ corrob.concordLabel }}</span>
        </div>
        <span v-if="corrob.indeterminate" class="corrob-tentative">held gently</span>
        <div class="corrob-rows">
          <div v-for="a in corrob.axes" :key="a.key" class="corrob-row">
            <span class="corrob-mark" :class="a.tone">{{ a.glyph }}</span>
            <div class="corrob-text">
              <span class="corrob-name">{{ a.name }}</span>
              <span v-if="a.note" class="corrob-note">{{ a.note }}</span>
            </div>
            <span class="corrob-reading">{{ a.chip }}</span>
          </div>
        </div>
        <div v-if="corrob.caveat" class="corrob-caveat">
          <span class="corrob-caveat-glyph">~</span><span>{{ corrob.caveat }}</span>
        </div>
      </div>
    </div>

    <!-- ─ State Probabilities ─ -->
    <div class="card probs-card">
      <div class="card-label">STATE PROBABILITIES</div>
      <div class="prob-list">
        <div v-for="p in probList" :key="p.key" class="prob-item">
          <div class="prob-header">
            <span class="prob-name" :class="p.key + '-label'">{{ p.label }}</span>
            <span class="prob-val">{{ p.text }}</span>
          </div>
          <div class="prob-bar-bg">
            <div class="prob-bar" :class="p.key + '-bar'" :style="{ width: p.width + '%' }"></div>
          </div>
        </div>
      </div>
      <div class="chitta-meta">
        <span class="meta-label">CONTEMPLATIVE DEPTH</span>
        <span class="meta-value">{{ chitta.depth }}</span>
      </div>
    </div>

    <!-- ─ Swara Nadi ─ -->
    <div class="card swara-card">
      <div class="card-label">SWARA NADI</div>
      <div class="swara-glyphs">
        <div class="swara-glyph" :class="{ 'active-ida': swara.isIda }">
          <div class="swara-symbol">🌙</div>
          <div class="swara-name">Ida</div>
          <div class="swara-sub">lunar · left</div>
        </div>
        <div class="swara-glyph" :class="{ 'active-sushumna': swara.isSushumna }">
          <div class="swara-symbol">⚖️</div>
          <div class="swara-name">Sushumna</div>
          <div class="swara-sub">balanced</div>
        </div>
        <div class="swara-glyph" :class="{ 'active-pingala': swara.isPingala }">
          <div class="swara-symbol">☀️</div>
          <div class="swara-name">Pingala</div>
          <div class="swara-sub">solar · right</div>
        </div>
      </div>
      <div class="asym-track">
        <span class="asym-label">L</span>
        <div class="asym-bar">
          <div class="asym-fill" :style="swara.fill"></div>
          <div class="asym-thumb" :style="swara.thumb"></div>
        </div>
        <span class="asym-label">R</span>
      </div>
      <div class="swara-note">{{ swara.note }}</div>
      <div class="chitta-meta">
        <span class="meta-label">CONFIDENCE</span>
        <span class="meta-value">{{ swara.confidence }}</span>
      </div>
    </div>

    <!-- ─ Spectral Band Powers ─ -->
    <div class="card bands-card">
      <div class="card-label">SPECTRAL BAND POWERS</div>
      <div class="band-list">
        <div v-for="b in bandList" :key="b.key" class="band-item">
          <div class="band-header">
            <span class="band-sym" :class="b.key + '-sym'">{{ b.sym }}</span>
            <span class="band-name">{{ b.name }}</span>
            <span class="band-hz">{{ b.hz }}</span>
            <span class="band-val">{{ b.text }}</span>
          </div>
          <div class="band-bar-bg">
            <div class="band-bar" :class="b.key + '-bar'" :style="{ width: b.width + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─ Trigunas ─ -->
    <div class="card gunas-card">
      <div class="card-label">TRIGUNAS</div>
      <div class="gunas-label-row">
        <span class="gunas-dominant">{{ gunaSummary.label }}</span>
        <span class="gunas-note">{{ gunaSummary.note }}</span>
      </div>
      <div class="band-list">
        <div v-for="g in gunaList" :key="g.key" class="band-item">
          <div class="band-header">
            <span class="band-sym" :class="g.key + '-sym'">{{ g.sym }}</span>
            <span class="band-name">{{ g.name }}</span>
            <span class="band-hz">{{ g.hz }}</span>
            <span class="band-val">{{ g.text }}</span>
          </div>
          <div class="band-bar-bg">
            <div class="band-bar" :class="g.key + '-bar'" :style="{ width: g.width + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─ Inner Texture ─ -->
    <div class="card texture-card">
      <div class="card-label">INNER TEXTURE</div>
      <div class="gunas-label-row">
        <span class="gunas-dominant">{{ texture.nirodha }}</span>
        <span class="gunas-note">stilling of the citta-vṛttis (relative to this session)</span>
      </div>
      <div class="band-list">
        <div class="band-item">
          <div class="band-header">
            <span class="band-sym">🌀</span>
            <span class="band-name">Vṛtti</span>
            <span class="band-hz">mental activity</span>
            <span class="band-val">{{ texture.vritti.text }}</span>
          </div>
          <div class="band-bar-bg"><div class="band-bar vritti-bar" :style="{ width: texture.vritti.width + '%' }"></div></div>
        </div>
        <div class="band-item">
          <div class="band-header">
            <span class="band-sym">✨</span>
            <span class="band-name">Mind Richness</span>
            <span class="band-hz">liveliness</span>
            <span class="band-val">{{ texture.richness.text }}</span>
          </div>
          <div class="band-bar-bg"><div class="band-bar richness-bar" :style="{ width: texture.richness.width + '%' }"></div></div>
        </div>
        <div class="band-item">
          <div class="band-header">
            <span class="band-sym">🏔️</span>
            <span class="band-name">Background Stillness</span>
            <span class="band-hz">settled baseline</span>
            <span class="band-val">{{ texture.stillness.text }}</span>
          </div>
          <div class="band-bar-bg"><div class="band-bar stillness-bar" :style="{ width: texture.stillness.width + '%' }"></div></div>
        </div>
      </div>
    </div>

    <!-- ─ Blood Oxygen (SpO₂) ─ -->
    <div v-if="hasPPG" class="card vitals-card">
      <div class="vital-header">
        <span class="card-label">BLOOD OXYGEN</span>
        <svg class="vital-icon spo2-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" opacity="0.18" />
        </svg>
      </div>
      <div class="vital-display">
        <span class="vital-value">{{ spo2Display }}</span>
        <span class="vital-unit">%</span>
      </div>
      <div class="vital-sub">SpO₂ · blood oxygen saturation</div>
      <div class="chitta-meta">
        <span class="meta-label">STATUS</span>
        <span class="meta-value">{{ spo2Live ? 'live reading' : 'awaiting signal' }}</span>
      </div>
    </div>

    <!-- ─ Heart Rate ─ -->
    <div v-if="hasPPG" class="card vitals-card">
      <div class="vital-header">
        <span class="card-label">HEART RATE</span>
        <svg class="vital-icon hr-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="currentColor" fill-opacity="0.12" />
          <polyline points="1,12 4,12 6,7 8,17 10,12 13,12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </div>
      <div class="vital-display">
        <span class="vital-value">{{ hrDisplay }}</span>
        <span class="vital-unit">BPM</span>
      </div>
      <div class="vital-sub">pulse · beats per minute</div>
      <div class="chitta-meta">
        <span class="meta-label">STATUS</span>
        <span class="meta-value">{{ hrLive ? 'live reading' : 'awaiting signal' }}</span>
      </div>
    </div>

    <!-- ─ Tattva / Chakra Correlates ─ -->
    <div class="card tattva-card">
      <div class="card-label">TATTVA / CHAKRA CORRELATES</div>
      <div class="tattva-flags">
        <template v-if="tattvaFlags.length">
          <span v-for="(f, i) in tattvaFlags" :key="i" class="tattva-tag">{{ f }}</span>
        </template>
        <span v-else class="tattva-tag muted">None detected</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The panel lays its cards out on a 3-col grid; the host view wraps it. */
.reading-panel { display: contents; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px; box-shadow: var(--shadow-sm); }
.card-label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
.chitta-meta { display: flex; gap: 10px; align-items: baseline; }
.meta-label  { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.meta-value  { font-size: 13px; font-weight: 600; color: var(--text-mid); }

/* ─── Chitta Bhumi ─── */
.chitta-card { grid-column: span 1; }
.chitta-state { font-family: var(--font-serif); font-size: 28px; color: var(--text); letter-spacing: -0.02em; margin-bottom: 4px; }
.chitta-sub   { font-size: 12px; color: var(--text-muted); margin-bottom: 14px; }
.depth-track { margin-bottom: 14px; }
.depth-stops { display: flex; justify-content: space-between; margin-bottom: 4px; }
.depth-stop  { font-size: 9px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.depth-bar   { height: 6px; background: var(--bg-card-2); border-radius: 3px; position: relative; overflow: hidden; }
.depth-fill  { position: absolute; left: 0; top: 0; height: 100%; width: 12%; border-radius: 3px; background: var(--accent); transition: width var(--transition), background var(--transition); }

/* ─── Signed corroboration ─── */
.corrob {
  --corrob-support: #3F8A78; --corrob-support-bg: rgba(63, 138, 120, 0.12);
  --corrob-tension: #B0812D; --corrob-tension-bg: rgba(176, 129, 45, 0.13);
  --corrob-neutral: #9A9895;
  margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border);
}
.corrob-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.corrob-concord { font-size: 11px; font-weight: 700; letter-spacing: 0.02em; padding: 3px 9px; border-radius: 999px; }
.corrob-concord.support { color: var(--corrob-support); background: var(--corrob-support-bg); }
.corrob-concord.tension { color: var(--corrob-tension); background: var(--corrob-tension-bg); }
.corrob-concord.neutral { color: var(--text-muted); background: var(--bg-card-2); }
.corrob-tentative {
  display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 600;
  color: var(--corrob-tension); background: var(--corrob-tension-bg);
  padding: 2px 9px; border-radius: 999px;
}
.corrob-rows { display: flex; flex-direction: column; margin-top: 10px; }
.corrob-row {
  display: grid; grid-template-columns: 22px 1fr auto; gap: 10px;
  align-items: start; padding: 9px 0; border-top: 1px solid var(--border-light);
}
.corrob-row:first-child { border-top: none; }
.corrob-mark {
  width: 20px; height: 20px; border-radius: 50%;
  display: grid; place-items: center; font-size: 12px; font-weight: 700; margin-top: 1px;
}
.corrob-mark.support { color: var(--corrob-support); background: var(--corrob-support-bg); }
.corrob-mark.tension { color: var(--corrob-tension); background: var(--corrob-tension-bg); }
.corrob-mark.neutral { color: var(--corrob-neutral); background: var(--bg-card-2); }
.corrob-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.corrob-name { font-size: 13.5px; font-weight: 600; color: var(--text); }
.corrob-note { font-size: 12px; color: var(--text-mid); line-height: 1.4; }
.corrob-reading {
  font-size: 11px; color: var(--text-muted);
  background: var(--bg-card-2); border: 1px solid var(--border);
  border-radius: 6px; padding: 2px 7px; white-space: nowrap; margin-top: 1px;
}
.corrob-caveat {
  display: flex; gap: 9px; margin-top: 12px; padding: 11px 13px;
  background: var(--corrob-tension-bg); border-radius: 10px;
  font-size: 12.5px; color: var(--text); line-height: 1.45;
}
.corrob-caveat-glyph { color: var(--corrob-tension); font-weight: 700; flex: none; }

/* ─── State Probabilities ─── */
.probs-card { grid-column: span 1; }
.prob-list  { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.prob-item  { display: flex; flex-direction: column; gap: 4px; }
.prob-header{ display: flex; justify-content: space-between; align-items: baseline; }
.prob-name  { font-size: 12px; font-weight: 600; }
.prob-val   { font-size: 12px; color: var(--text-muted); }
.prob-bar-bg{ height: 5px; background: var(--bg-card-2); border-radius: 3px; overflow: hidden; }
.prob-bar   { height: 100%; border-radius: 3px; width: 0; transition: width var(--transition); }
.kshipta-label { color: var(--kshipta); }
.vikshipta-label { color: var(--vikshipta); }
.ekagra-label { color: var(--ekagra); }
.niruddha-label { color: var(--niruddha); }
.kshipta-bar { background: var(--kshipta); }
.vikshipta-bar { background: var(--vikshipta); }
.ekagra-bar { background: var(--ekagra); }
.niruddha-bar { background: var(--niruddha); }

/* ─── Swara Nadi ─── */
.swara-card  { grid-column: span 1; }
.swara-glyphs { display: flex; justify-content: space-around; margin-bottom: 12px; }
.swara-glyph  { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 12px; border-radius: var(--radius-sm); opacity: 0.35; transition: opacity 0.4s, background 0.4s; cursor: default; }
.swara-glyph.active-ida      { opacity: 1; background: rgba(91,141,184,0.12); }
.swara-glyph.active-sushumna { opacity: 1; background: rgba(86,166,122,0.12); }
.swara-glyph.active-pingala  { opacity: 1; background: rgba(217,119,87,0.12); }
.swara-symbol { font-size: 20px; }
.swara-name   { font-size: 12px; font-weight: 700; }
.swara-sub    { font-size: 10px; color: var(--text-muted); }
.asym-track  { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.asym-label  { font-size: 11px; font-weight: 700; color: var(--text-muted); width: 12px; flex-shrink: 0; }
.asym-bar    { flex: 1; height: 6px; background: var(--bg-card-2); border-radius: 3px; position: relative; }
.asym-fill   { position: absolute; top: 0; height: 100%; border-radius: 3px; background: var(--sushumna); width: 0; transition: all 0.5s; }
.asym-thumb  { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; background: var(--sushumna); transform: translate(-50%,-50%); left: 50%; transition: left 0.5s, background 0.5s; box-shadow: var(--shadow-sm); }
.swara-note  { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px; min-height: 36px; }

/* ─── Band powers ─── */
.bands-card { grid-column: span 1; }
.band-list  { display: flex; flex-direction: column; gap: 10px; }
.band-item  { display: flex; flex-direction: column; gap: 4px; }
.band-header{ display: flex; align-items: baseline; gap: 6px; }
.band-sym   { font-size: 15px; font-weight: 700; width: 18px; flex-shrink: 0; }
.band-name  { font-size: 12px; font-weight: 600; flex: 1; }
.band-hz    { font-size: 10px; color: var(--text-muted); }
.band-val   { font-size: 12px; color: var(--text-muted); margin-left: auto; }
.band-bar-bg{ height: 5px; background: var(--bg-card-2); border-radius: 3px; overflow: hidden; }
.band-bar   { height: 100%; border-radius: 3px; width: 0; transition: width var(--transition); }
.delta-sym { color: var(--delta); } .theta-sym { color: var(--theta); } .alpha-sym { color: var(--alpha); } .beta-sym { color: var(--beta); } .gamma-sym { color: var(--gamma); }
.delta-bar { background: var(--delta); } .theta-bar { background: var(--theta); } .alpha-bar { background: var(--alpha); } .beta-bar { background: var(--beta); } .gamma-bar { background: var(--gamma); }

/* ─── Trigunas ─── */
.gunas-card { grid-column: span 1; }
.gunas-label-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.gunas-dominant  { font-family: var(--font-serif); font-size: 18px; color: var(--text); letter-spacing: -0.01em; }
.gunas-note { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
.sattva-sym { color: var(--sattva); } .rajas-sym { color: var(--rajas); } .tamas-sym { color: var(--tamas); }
.sattva-bar { background: var(--sattva); } .rajas-bar { background: var(--rajas); } .tamas-bar { background: var(--tamas); }

/* ─── Inner Texture ─── */
.texture-card  { grid-column: span 1; }
.vritti-bar    { background: linear-gradient(90deg, #d98a3d, #e6b062); }
.richness-bar  { background: linear-gradient(90deg, #4f8fc4, #7fb6dd); }
.stillness-bar { background: linear-gradient(90deg, #5f9e79, #8fc9a2); }

/* ─── Tattva ─── */
.tattva-card  { grid-column: span 2; }
.tattva-flags { font-size: 12px; color: var(--text-muted); line-height: 1.7; display: flex; flex-wrap: wrap; gap: 6px; }
.tattva-tag   { display: inline-block; padding: 5px 10px; border-radius: var(--radius-sm); font-size: 11px; line-height: 1.5; background: rgba(199,92,92,0.10); color: #8B2E2E; border: 1px solid rgba(199,92,92,0.2); }
.tattva-tag.muted { background: var(--bg-card-2); color: var(--text-mid); border: 1px solid var(--border); }

/* ─── Vitals (SpO₂ / Heart Rate) ─── */
.vitals-card { display: flex; flex-direction: column; gap: 14px; }
.vital-header { display: flex; align-items: center; justify-content: space-between; }
.vital-icon { width: 28px; height: 28px; flex-shrink: 0; opacity: 0.55; }
.spo2-icon { color: var(--ekagra); }
.hr-icon { color: var(--gamma); }
.vital-display { display: flex; align-items: baseline; gap: 8px; }
.vital-value { font-family: var(--font-serif); font-size: 52px; font-weight: 400; color: var(--text); line-height: 1; letter-spacing: -0.03em; transition: color var(--transition); }
.vital-unit { font-size: 15px; color: var(--text-muted); font-weight: 500; letter-spacing: 0.04em; align-self: flex-end; padding-bottom: 6px; }
.vital-sub { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: -6px; }
</style>
