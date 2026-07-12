// P3 Analyze — pure SVG instrument generators.
// Each function RETURNS the inner-SVG markup string (bind with v-html inside an
// <svg :viewBox="VIEWBOX.xxx">). No DOM, no Vue. Math ported verbatim from the
// legacy app.js draw* functions (drawBandRadar / drawGunaTriangle / drawBhumiRing
// / drawSwaraGauge / drawDepthMeter / drawSensorSchematic).

// ── viewBox map (matches legacy index.html <svg viewBox> values) ─────────────
export const VIEWBOX = {
  bandRadar: '-130 -130 260 260',
  gunaTri:   '-120 -110 240 220',
  bhumiRing: '-120 -120 240 240',
  swaraGauge:'0 -10 240 130',
  depthMeter:'0 0 240 96',
  sensor:    '-60 -66 120 132',
};

// ── shared constants (copied from app.js top + P3 block) ─────────────────────
const DEPTH_PCT = { 'Deep Inertia': 3, Surface: 12, Emerging: 37, Deep: 62, Profound: 94 };
const CHITTA_DEPTHS = { Mudha: 'Deep Inertia', Kshipta: 'Surface', Vikshipta: 'Emerging', Ekagra: 'Deep', Niruddha: 'Profound' };

const AN_BAND_COLORS  = { delta:'#9B6FBE', theta:'#5B8DB8', alpha:'#56A67A', beta:'#D4973A', gamma:'#C75C5C' };
const AN_GUNA_COLORS  = { sattva:'#C9A84C', rajas:'#C75C5C', tamas:'#5A6DAA' };
const AN_BHUMI_COLORS = { Mudha:'#8A8F98', Kshipta:'#E08030', Vikshipta:'#D97757', Ekagra:'#5B8DB8', Niruddha:'#7C68A8' };
const AN_SWARA_COLORS = { ida:'#5B8DB8', pingala:'#D97757', sushumna:'#56A67A' };
const AN_DEPTH_COLORS = { 'Deep Inertia':'#8A8F98', Surface:'#E08030', Emerging:'#D4973A', Deep:'#5B8DB8', Profound:'#7C68A8' };
const AN_BHUMI_ORDER  = ['Mudha', 'Kshipta', 'Vikshipta', 'Ekagra', 'Niruddha'];
const AN_DEPTH_ORDER  = ['Deep Inertia', 'Surface', 'Emerging', 'Deep', 'Profound'];

// ── helpers (identical math to app.js anNum / anPol / anArcSeg) ───────────────
const anNum = v => (v == null || Number.isNaN(+v)) ? 0 : +v;
const anPol = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
function anArcSeg(cx, cy, rO, rI, a0, a1) {
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  const [x0, y0] = anPol(cx, cy, rO, a0), [x1, y1] = anPol(cx, cy, rO, a1);
  const [x2, y2] = anPol(cx, cy, rI, a1), [x3, y3] = anPol(cx, cy, rI, a0);
  const f = n => n.toFixed(2);
  return `M${f(x0)} ${f(y0)} A${rO} ${rO} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${rI} ${rI} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}
// Local escape — these are v-html strings, so untrusted labels (state names)
// must still be escaped before injection (Vue does NOT sanitize v-html).
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── instruments ──────────────────────────────────────────────────────────────
export function bandRadar(avgBands) {
  avgBands = avgBands || {};
  const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  const maxR = 100, n = bands.length, ang = i => -90 + i * (360 / n);
  let svg = '';
  for (const fr of [0.25, 0.5, 0.75, 1]) {
    const pts = bands.map((_, i) => anPol(0, 0, maxR * fr, ang(i)).map(v => v.toFixed(1)).join(',')).join(' ');
    svg += `<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="1" opacity="0.6"/>`;
  }
  bands.forEach((b, i) => {
    const [ax, ay] = anPol(0, 0, maxR, ang(i));
    svg += `<line x1="0" y1="0" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="var(--border)" stroke-width="1" opacity="0.5"/>`;
    const [lx, ly] = anPol(0, 0, maxR + 17, ang(i));
    svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${AN_BAND_COLORS[b]}" font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="middle">${b}</text>`;
  });
  const dpts = bands.map((b, i) => anPol(0, 0, maxR * Math.max(0, Math.min(1, anNum(avgBands[b]))), ang(i)).map(v => v.toFixed(1)).join(',')).join(' ');
  svg += `<polygon points="${dpts}" fill="var(--accent)" fill-opacity="0.28" stroke="var(--accent)" stroke-width="2"/>`;
  bands.forEach((b, i) => {
    const [px, py] = anPol(0, 0, maxR * Math.max(0, Math.min(1, anNum(avgBands[b]))), ang(i));
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${AN_BAND_COLORS[b]}"/>`;
  });
  return svg;
}

export function gunaTriangle(g) {
  g = g || {};
  const V = { sattva: [0, -90], rajas: [85, 60], tamas: [-85, 60] };
  let svg = `<polygon points="${V.sattva.join(',')} ${V.rajas.join(',')} ${V.tamas.join(',')}" fill="none" stroke="var(--border)" stroke-width="1.5"/>`;
  for (const k of ['sattva', 'rajas', 'tamas']) {
    const [vx, vy] = V[k], lx = vx * 1.16, ly = vy === -90 ? vy - 9 : vy + 18;
    svg += `<circle cx="${vx}" cy="${vy}" r="4" fill="${AN_GUNA_COLORS[k]}"/>`;
    svg += `<text x="${lx}" y="${ly}" fill="${AN_GUNA_COLORS[k]}" font-size="11" font-weight="600" text-anchor="middle">${k}</text>`;
  }
  const s = anNum(g.sattva), r = anNum(g.rajas), t = anNum(g.tamas), sum = s + r + t;
  if (sum > 0) {
    const px = (s * V.sattva[0] + r * V.rajas[0] + t * V.tamas[0]) / sum;
    const py = (s * V.sattva[1] + r * V.rajas[1] + t * V.tamas[1]) / sum;
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="var(--accent)" stroke="#fff" stroke-width="1.5"/>`;
  } else {
    svg += `<text x="0" y="0" fill="var(--text-muted)" font-size="11" text-anchor="middle">no guṇa data</text>`;
  }
  return svg;
}

export function bhumiRing(counts) {
  counts = counts || {};
  const rO = 95, rI = 58;
  const entries = AN_BHUMI_ORDER.filter(k => counts[k]).map(k => [k, counts[k]]);
  Object.keys(counts).forEach(k => { if (!AN_BHUMI_ORDER.includes(k) && counts[k]) entries.push([k, counts[k]]); });
  const sum = entries.reduce((a, [, c]) => a + c, 0);
  let svg = '';
  if (!sum) {
    svg += `<circle cx="0" cy="0" r="${(rO + rI) / 2}" fill="none" stroke="var(--bg-card-2)" stroke-width="${rO - rI}"/>`;
    svg += `<text x="0" y="0" fill="var(--text-muted)" font-size="12" text-anchor="middle" dominant-baseline="middle">no data</text>`;
  } else if (entries.length === 1) {
    const [k] = entries[0];
    svg += `<circle cx="0" cy="0" r="${(rO + rI) / 2}" fill="none" stroke="${AN_BHUMI_COLORS[k] || 'var(--accent)'}" stroke-width="${rO - rI}"/>`;
    svg += `<text x="0" y="-4" fill="var(--text)" font-size="13" font-weight="700" text-anchor="middle">${esc(k)}</text>`;
    svg += `<text x="0" y="14" fill="var(--text-muted)" font-size="10" text-anchor="middle">100%</text>`;
  } else {
    let a0 = -90;
    entries.forEach(([k, c]) => {
      const sweep = c / sum * 360, a1 = a0 + sweep, col = AN_BHUMI_COLORS[k] || 'var(--text-muted)';
      svg += `<path d="${anArcSeg(0, 0, rO, rI, a0, a1)}" fill="${col}"/>`;
      if (sweep > 26) { const [lx, ly] = anPol(0, 0, (rO + rI) / 2, (a0 + a1) / 2); svg += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle">${Math.round(c / sum * 100)}%</text>`; }
      a0 = a1;
    });
    const dom = entries.slice().sort((a, b) => b[1] - a[1])[0][0];
    svg += `<text x="0" y="-4" fill="var(--text)" font-size="13" font-weight="700" text-anchor="middle">${esc(dom)}</text>`;
    svg += `<text x="0" y="14" fill="var(--text-muted)" font-size="10" text-anchor="middle">dominant</text>`;
  }
  return svg;
}

export function swaraGauge(counts) {
  counts = counts || {};
  const cx = 120, cy = 100, r = 90, rI = 58, order = ['ida', 'sushumna', 'pingala'];
  const sum = order.reduce((a, k) => a + anNum(counts[k]), 0);
  let svg = '';
  if (!sum) {
    svg += `<path d="${anArcSeg(cx, cy, r, rI, 180, 360)}" fill="var(--bg-card-2)"/>`;
    svg += `<text x="${cx}" y="${cy - 20}" fill="var(--text-muted)" font-size="12" text-anchor="middle">no svara data</text>`;
  } else {
    let a0 = 180;
    order.forEach(k => { const frac = anNum(counts[k]) / sum; if (frac <= 0) return; const a1 = a0 + frac * 180; svg += `<path d="${anArcSeg(cx, cy, r, rI, a0, a1)}" fill="${AN_SWARA_COLORS[k]}"/>`; a0 = a1; });
    const t = (anNum(counts.pingala) + 0.5 * anNum(counts.sushumna)) / sum;
    const [nx, ny] = anPol(cx, cy, r - 6, 180 + t * 180);
    svg += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="var(--text)"/>`;
  }
  const lx = [24, 108, 188];
  order.forEach((k, i) => {
    svg += `<circle cx="${lx[i]}" cy="118" r="4" fill="${AN_SWARA_COLORS[k]}"/>`;
    svg += `<text x="${lx[i] + 9}" y="122" fill="var(--text-muted)" font-size="10">${k} ${anNum(counts[k])}</text>`;
  });
  return svg;
}

export function depthMeter(eps, summary) {
  summary = summary || {};
  const counts = {}; AN_DEPTH_ORDER.forEach(d => counts[d] = 0);
  let n = 0;
  (eps || []).forEach(e => { const d = e.contemplativeDepth; if (d != null && counts[d] !== undefined) { counts[d]++; n++; } });
  const x0 = 12, w = 216, y = 34, h = 22;
  let svg = '';
  if (n > 0) {
    let x = x0;
    AN_DEPTH_ORDER.forEach(d => { const segW = counts[d] / n * w; if (segW > 0) { svg += `<rect x="${x.toFixed(1)}" y="${y}" width="${segW.toFixed(1)}" height="${h}" fill="${AN_DEPTH_COLORS[d]}"/>`; x += segW; } });
  } else {
    svg += `<rect x="${x0}" y="${y}" width="${w}" height="${h}" fill="var(--bg-card-2)"/>`;
    svg += `<text x="120" y="${y + h / 2 + 4}" fill="var(--text-muted)" font-size="11" text-anchor="middle">no depth data</text>`;
  }
  ['Surface', 'Emerging', 'Deep', 'Profound'].forEach(t => { const tx = x0 + (DEPTH_PCT[t] / 100) * w; svg += `<text x="${tx.toFixed(1)}" y="${y + h + 16}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${t}</text>`; });
  const domDepth = CHITTA_DEPTHS[summary.dominantState];
  if (domDepth && DEPTH_PCT[domDepth] != null) {
    const mx = x0 + (DEPTH_PCT[domDepth] / 100) * w;
    svg += `<polygon points="${mx.toFixed(1)},${y - 5} ${(mx - 5).toFixed(1)},${y - 13} ${(mx + 5).toFixed(1)},${y - 13}" fill="var(--text)"/>`;
    svg += `<text x="${mx.toFixed(1)}" y="${y - 17}" fill="var(--text)" font-size="9" font-weight="600" text-anchor="middle">${esc(domDepth)}</text>`;
  }
  return svg;
}

export function sensorSchematic(avgBands) {
  avgBands = avgBands || {};
  const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  let dom = 'alpha', max = -1;
  bands.forEach(b => { const v = anNum(avgBands[b]); if (v > max) { max = v; dom = b; } });
  const col = AN_BAND_COLORS[dom], r = 48;
  let svg = `<circle cx="0" cy="0" r="${r}" fill="none" stroke="var(--border)" stroke-width="2"/>`;
  svg += `<polygon points="0,${-r - 10} -7,${-r} 7,${-r}" fill="none" stroke="var(--border)" stroke-width="2"/>`;
  const dots = { T3: [-34, -6], T4: [34, -6], O1: [-22, 34], O2: [22, 34] };
  Object.entries(dots).forEach(([lbl, [dx, dy]]) => {
    svg += `<circle cx="${dx}" cy="${dy}" r="9" fill="${col}" fill-opacity="0.55" stroke="${col}" stroke-width="2"/>`;
    svg += `<text x="${dx}" y="${dy + 3}" fill="var(--text)" font-size="8" font-weight="700" text-anchor="middle">${lbl}</text>`;
  });
  svg += `<text x="0" y="4" fill="${col}" font-size="10" font-weight="600" text-anchor="middle">${max >= 0 ? dom + ' dominant' : 'no band data'}</text>`;
  return svg;
}
