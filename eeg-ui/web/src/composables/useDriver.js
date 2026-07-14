// ── useDriver — headband BLE driver layer (ported from legacy app.js) ─────────
// Pure logic + reactive state. NO DOM access. Each driver isolates ONE headband's
// BLE quirks (UUIDs, start handshake, packet → µV decoding, sample rate). Everything
// downstream only ever sees normalised µV samples via ctx.pushSamples(ch, µV[]),
// so the analyse/render/store pipeline stays device-agnostic. To support a new
// headband, add a driver object to DRIVERS — nothing else needs to change.

import { ref } from 'vue';

// ── Constants ─────────────────────────────────────────────────────────────────
const SAMPLE_RATE = 256;              // default epoch sample-rate assumption
const COLLECT_SECS = 4;               // analysis window per epoch (4 s)
const COLLECT_N = SAMPLE_RATE * COLLECT_SECS;

const MUSE_SERVICE_UUID = '0000fe8d-0000-1000-8000-00805f9b34fb';
const MUSE_CONTROL_UUID = '273e0001-4c4d-454d-96be-f03bac821358';
const MUSE_EEG_UUIDS = [
  '273e0003-4c4d-454d-96be-f03bac821358',
  '273e0004-4c4d-454d-96be-f03bac821358',
  '273e0005-4c4d-454d-96be-f03bac821358',
  '273e0006-4c4d-454d-96be-f03bac821358',
];

// Muse S PPG UUIDs for heart rate and SpO2
const MUSE_PPG_UUIDS = {
  ambient: '273e000f-4c4d-454d-96be-f03bac821358',
  ir:      '273e0010-4c4d-454d-96be-f03bac821358',
  red:     '273e0011-4c4d-454d-96be-f03bac821358',
};
const PPG_SAMPLE_RATE = 64;
const PPG_WINDOW_SAMPLES = PPG_SAMPLE_RATE * 8; // 8-second window
const PPG_RECOMPUTE_MS = 1000; // real HR doesn't need updating faster than 1/s
const PPG_STALE_MS = 8000;     // how long a good reading is shown as "live" before falling back to "last known"

// BrainBit (4-channel dry EEG, 250 Hz). Protocol per the vendor's web SDK.
const BRAINBIT_SERVICE_UUID = '6e400001-b534-f393-68a9-e50e24dcca9e';
const BRAINBIT_STATUS_UUID  = '6e400002-b534-f393-68a9-e50e24dcca9e'; // notify status/battery
const BRAINBIT_COMMAND_UUID = '6e400003-b534-f393-68a9-e50e24dcca9e'; // write commands
const BRAINBIT_SIGNAL_UUID  = '6e400004-b534-f393-68a9-e50e24dcca9e'; // notify EEG
// SIGNAL-mode scale → volts: 2.4 V reference / (0xFFFFF full-scale × gain 6).
const BRAINBIT_SIGNAL_MULT = 2.4 / (0xFFFFF * 6);
const BRAINBIT_CMD_STOP   = new Uint8Array([1]);             // stop everything
const BRAINBIT_CMD_SIGNAL = new Uint8Array([2, 0, 0, 0, 0]); // start signal mode

// ── PPG helpers (heart rate + SpO2) ───────────────────────────────────────────
// Ported verbatim from the legacy app.js's validated computeHeartRate() —
// detrend against a rolling ~1s baseline -> light smoothing -> threshold peak
// detection with a widened refractory period -> harmonic-doubling correction
// (a real dicrotic notch sometimes registers as its own peak, producing a
// bimodal ~2x RR-interval split; the slower cluster is the true rate) ->
// autocorrelation confirmation (rejects noise that only *looks* periodic
// because the refractory floor quantizes it into a regular spacing).
//
// Tuned and validated against real captured Muse S PPG data and synthetic
// noise/clean-pulse trials — see the legacy app.js comment above this
// function for the full validation notes. Do not simplify without re-running
// that validation; the earlier, simpler version of this function (single
// global-mean detrend, 0.28s refractory, no doubling/autocorrelation checks)
// reported false-positive rates on pure noise and mis-tracked the dicrotic
// notch as a second beat.

/** Detects a bimodal ~2x RR-interval split caused by the dicrotic notch
 * occasionally registering as its own peak, and returns the true (slower)
 * period when found. */
function detectHarmonicDoubling(rrs) {
  if (rrs.length < 6) return null;
  const sortedAll = [...rrs].sort((a, b) => a - b);
  const med = sortedAll[Math.floor(sortedAll.length / 2)];
  const cleaned = rrs.filter(rr => rr <= med * 2.0);
  if (cleaned.length < 6) return null;

  const sorted = [...cleaned].sort((a, b) => a - b);
  const minN = Math.max(4, Math.ceil(0.35 * cleaned.length));
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const cv = (arr, m) => Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) / m;

  let best = null;
  for (let i = minN; i <= sorted.length - minN; i++) {
    const lowCluster = sorted.slice(0, i), highCluster = sorted.slice(i);
    const lowMean = mean(lowCluster), highMean = mean(highCluster);
    const ratio = highMean / lowMean;
    if (ratio < 1.6 || ratio > 2.4) continue; // not a clean ~2x split
    const lowCv = cv(lowCluster, lowMean), highCv = cv(highCluster, highMean);
    if (lowCv > 0.25 || highCv > 0.25) continue; // clusters too noisy to trust
    const combinedCv = (lowCv * lowCluster.length + highCv * highCluster.length) / (lowCluster.length + highCluster.length);
    if (!best || combinedCv < best.combinedCv) {
      best = { period: highMean, lowMean, highMean, lowN: lowCluster.length, highN: highCluster.length, combinedCv };
    }
  }
  return best;
}

/** BPM from PPG IR: detrend -> smooth -> peak-detect -> outlier-reject RR intervals. */
function computeHeartRate(signal) {
  if (signal.length < PPG_SAMPLE_RATE * 2) return null;

  // Detrend against a ~1s moving-average baseline instead of one global mean
  // over the whole window — removes slow drift (breathing, slight movement).
  const baseWin = PPG_SAMPLE_RATE;
  const ac = new Array(signal.length);
  let baseSum = 0;
  for (let i = 0; i < signal.length; i++) {
    baseSum += signal[i];
    if (i >= baseWin) baseSum -= signal[i - baseWin];
    const baseline = baseSum / Math.min(i + 1, baseWin);
    ac[i] = signal[i] - baseline;
  }
  // Light smoothing to knock down high-frequency noise before peak-picking.
  const sm = new Array(ac.length);
  for (let i = 0; i < ac.length; i++) {
    const lo = Math.max(0, i - 1), hi = Math.min(ac.length - 1, i + 1);
    sm[i] = (ac[lo] + ac[i] + ac[hi]) / 3;
  }

  const std = Math.sqrt(sm.reduce((s, v) => s + v * v, 0) / sm.length);
  const thr = std * 0.5;
  // Refractory period between accepted peaks, widened from 0.4s (max ~150bpm)
  // to ~0.44s (max ~137bpm) — real device captures showed the dicrotic notch
  // landing 26-32 samples (400-500ms) after the systolic peak often enough to
  // survive a tighter refractory and get counted as its own beat.
  const minDist = Math.round(60 * PPG_SAMPLE_RATE / 137);
  const peaks = []; let lastPeak = -minDist;
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > thr && sm[i] > sm[i - 1] && sm[i] > sm[i + 1] && (i - lastPeak) >= minDist) {
      peaks.push(i); lastPeak = i;
    }
  }
  if (peaks.length < 6) return null; // need >=5 RR intervals before trusting an estimate

  const rrs = peaks.slice(1).map((p, i) => p - peaks[i]);

  // Try the harmonic-doubling correction first; otherwise fall back to
  // median-based outlier rejection.
  let meanRR;
  const doubling = detectHarmonicDoubling(rrs);
  if (doubling) {
    meanRR = doubling.period;
  } else {
    const sortedRr = [...rrs].sort((a, b) => a - b);
    const medianRr = sortedRr[Math.floor(sortedRr.length / 2)];
    // Reject any RR interval more than 25% off the median.
    const kept = rrs.filter(rr => Math.abs(rr - medianRr) / medianRr <= 0.25);
    if (kept.length < 4) return null;

    meanRR = kept.reduce((a, b) => a + b, 0) / kept.length;
    // Periodicity gate: reject if the surviving intervals are still too
    // scattered (coefficient of variation) rather than reporting a number
    // that isn't really a heartbeat.
    const rrStd = Math.sqrt(kept.reduce((s, v) => s + (v - meanRR) ** 2, 0) / kept.length);
    if (rrStd / meanRR > 0.18) return null;
  }

  // Autocorrelation confirmation — confirms the candidate period actually
  // corresponds to periodic energy in the signal itself (lag = meanRR); pure
  // noise satisfies the refractory-spaced peak checks above too easily on
  // its own, since the refractory floor alone quantizes noise into a
  // deceptively regular rhythm.
  const lag = Math.round(meanRR);
  if (lag < 1 || lag >= sm.length) return null;
  let acNum = 0, acDen = 0;
  for (let i = 0; i + lag < sm.length; i++) {
    acNum += sm[i] * sm[i + lag];
    acDen += sm[i] * sm[i];
  }
  if (acDen <= 0 || acNum / acDen < 0.45) return null;

  const hr = (60 * PPG_SAMPLE_RATE) / meanRR;
  return (hr >= 35 && hr <= 160) ? hr : null;
}

/** SpO2 % from red/IR ratio-of-ratios: SpO2 ≈ 110 − 25 × R */
function computeSpO2(ir, red) {
  if (ir.length < 64 || red.length < 64) return null;
  const len = Math.min(ir.length, red.length);
  const irS = ir.slice(-len), redS = red.slice(-len);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const acRms = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const dcIr = mean(irS), dcRed = mean(redS);
  if (dcIr < 1 || dcRed < 1) return null;
  const acIr = acRms(irS), acRed = acRms(redS);
  if (acIr < 1 || acRed < 1) return null;
  const R = (acRed / dcRed) / (acIr / dcIr);
  return Math.min(100, Math.max(85, 110 - 25 * R));
}

// ── Headband drivers ──────────────────────────────────────────────────────────
const MuseDriver = {
  id: 'muse',
  name: 'Muse',
  sampleRate: 256,
  channelCount: 4,
  hasPPG: true,  // Muse S streams PPG → heart-rate + SpO2 vitals

  // Advertised by the scan filter and identifies the device after connect.
  filters: [{ services: [MUSE_SERVICE_UUID] }],
  optionalServices: [MUSE_SERVICE_UUID],
  async isMatch(server) {
    return server.getPrimaryService(MUSE_SERVICE_UUID).then(() => true).catch(() => false);
  },
  async start(server, ctx) {
    const service = await server.getPrimaryService(MUSE_SERVICE_UUID);

    const controlChar = await service.getCharacteristic(MUSE_CONTROL_UUID).catch(() => null);
    if (controlChar) {
      // CRITICAL: Muse protocol requires a 1-byte length prefix before every command.
      // Without the prefix the headband silently ignores the command and never streams EEG.
      const museCmd = (s) => {
        const payload = new TextEncoder().encode(s + '\n');
        const buf = new Uint8Array(payload.length + 1);
        buf[0] = payload.length; // length prefix byte — this is mandatory
        buf.set(payload, 1);
        return buf;
      };
      await controlChar.writeValue(museCmd('h'));    // halt any prior streaming
      await new Promise(r => setTimeout(r, 300));
      await controlChar.writeValue(museCmd('p21'));  // preset 21 = EEG mode
      await new Promise(r => setTimeout(r, 300));
      await controlChar.writeValue(museCmd('d'));    // start streaming
      await new Promise(r => setTimeout(r, 500));    // let stream initialise before subscribing
    }

    for (let c = 0; c < MUSE_EEG_UUIDS.length; c++) {
      const char = await service.getCharacteristic(MUSE_EEG_UUIDS[c]).catch(() => null);
      if (!char) continue;
      await char.startNotifications();
      const ch = c;
      char.addEventListener('characteristicvaluechanged', ev => {
        const data = ev.target.value;
        const samples = [];
        // Safe loop — always leaves 2 bytes to read (i and i+1).
        for (let i = 2; i + 1 < data.byteLength; i += 2) {
          // Raw int16 → microvolts (Muse scale: 0.48828125 µV/LSB).
          samples.push(data.getInt16(i, false) * 0.48828125e-6);
        }
        ctx.pushSamples(ch, samples);
      });
    }

    // Muse S PPG subscription for heart rate + SpO2 (absent on plain Muse — best effort).
    for (const [key, uuid] of Object.entries(MUSE_PPG_UUIDS)) {
      const ppgChar = await service.getCharacteristic(uuid).catch(() => null);
      if (!ppgChar) continue;
      await ppgChar.startNotifications();
      ppgChar.addEventListener('characteristicvaluechanged', ev => ctx.onPPG(ev, key));
    }
  },
};

const BrainBitDriver = {
  id: 'brainbit',
  name: 'BrainBit',
  sampleRate: 250,
  channelCount: 4,
  hasPPG: false, // EEG only — no optical pulse sensor, so no HR/SpO2

  // BrainBit does not reliably advertise its service UUID, so scan by name.
  filters: [{ namePrefix: 'BrainBit' }],
  optionalServices: [BRAINBIT_SERVICE_UUID],
  async isMatch(server) {
    return server.getPrimaryService(BRAINBIT_SERVICE_UUID).then(() => true).catch(() => false);
  },
  async start(server, ctx) {
    const service = await server.getPrimaryService(BRAINBIT_SERVICE_UUID);

    // Subscribe to the signal (EEG) characteristic BEFORE starting the stream.
    const signalChar = await service.getCharacteristic(BRAINBIT_SIGNAL_UUID);
    await signalChar.startNotifications();
    signalChar.addEventListener('characteristicvaluechanged', ev => {
      const b = new Uint8Array(ev.target.value.buffer);
      if (b.length < 20) return; // each signal packet is 20 bytes → 4 ch × 2 samples
      const m = BRAINBIT_SIGNAL_MULT;
      // Sample 0 of each channel: a 20-bit value, bit-packed and left-aligned into
      // a signed 32-bit int so JS's signed << sign-extends it, then /2048.
      const v0 = (((b[1] & 0x0F) << 28) | (b[2] << 20) | (b[3] << 12) | (b[4] << 4)) / 2048;
      const v1 = (((b[4] & 0x7F) << 25) | (b[5] << 17) | (b[6] << 9)  | (b[7] << 1)) / 2048;
      const v2 = (((b[6] & 0x03) << 30) | (b[7] << 22) | (b[8] << 14) | (b[9] << 6)) / 2048;
      const v3 = (((b[9] & 0x1F) << 27) | (b[10] << 19) | (b[11] << 11)) / 2048;
      // Sample 1 of each channel: a 16-bit signed delta added to sample 0.
      const d0 = ((b[12] << 24) | (b[13] << 16)) / 65536 + v0;
      const d1 = ((b[14] << 24) | (b[15] << 16)) / 65536 + v1;
      const d2 = ((b[16] << 24) | (b[17] << 16)) / 65536 + v2;
      const d3 = ((b[18] << 24) | (b[19] << 16)) / 65536 + v3;
      // Push ch0 LAST so the COLLECT_N trigger never fires with ch1–3 still short.
      ctx.pushSamples(1, [v1 * m, d1 * m]);
      ctx.pushSamples(2, [v2 * m, d2 * m]);
      ctx.pushSamples(3, [v3 * m, d3 * m]);
      ctx.pushSamples(0, [v0 * m, d0 * m]);
    });

    // Status characteristic: battery % lives in byte[2] (value >> 1 = percent).
    const statusChar = await service.getCharacteristic(BRAINBIT_STATUS_UUID).catch(() => null);
    if (statusChar) {
      const readBattery = dv => {
        if (dv && dv.byteLength > 2 && ctx.reportBattery) ctx.reportBattery(dv.getUint8(2) >> 1);
      };
      await statusChar.startNotifications().catch(() => {});
      statusChar.addEventListener('characteristicvaluechanged', ev => readBattery(ev.target.value));
      readBattery(await statusChar.readValue().catch(() => null)); // seed immediately
    }

    // Command characteristic: halt anything prior, then start signal streaming.
    const commandChar = await service.getCharacteristic(BRAINBIT_COMMAND_UUID);
    await commandChar.writeValue(BRAINBIT_CMD_STOP);
    await new Promise(r => setTimeout(r, 200));
    await commandChar.writeValue(BRAINBIT_CMD_SIGNAL);
  },
};

// Registry of supported headbands. Add a driver here to support a new device —
// the generic connect/consume pipeline needs nothing else.
const DRIVERS = [MuseDriver, BrainBitDriver];

// ── Composable ────────────────────────────────────────────────────────────────
export function useDriver() {
  // Reactive, caller-facing state.
  const connected   = ref(false);
  const connecting  = ref(false);
  const deviceName  = ref('');
  const driverId    = ref(null);
  const hasPPG      = ref(false);
  const battery     = ref(null);   // 0–100 %, or null when unknown/hidden
  const sampleRate  = ref(SAMPLE_RATE);
  const heartRate   = ref(null);   // BPM (PPG devices only) — EMA-smoothed
  const spo2        = ref(null);   // % (PPG devices only) — EMA-smoothed
  // Whether the current heartRate/spo2 value is a momentary bad window (PPG_STALE_MS
  // since the last GOOD reading) rather than a fresh one — the caller keeps showing
  // the last known number rather than blanking it, just marks it "last known".
  const hrStale     = ref(true);
  const spo2Stale   = ref(true);
  const latestSamples = ref([]);   // last completed epoch: array of per-channel µV arrays
  const epoch       = ref(0);      // increments each time an epoch completes
  const bufferCount = ref(0);      // ch0 samples collected toward COLLECT_N
  const status      = ref('disconnected');
  const error       = ref(null);

  // Caller-registered epoch callback: onEpoch(channelsSnapshot, { epoch, sampleRate }).
  let epochCallback = null;
  function onEpoch(cb) { epochCallback = cb; }

  // Internal, non-reactive BLE plumbing (kept plain for per-sample perf).
  let btDevice = null;
  let btDisconnect = null;
  let activeDriver = null;
  const bleChannels = [];                          // [ch][sample] plain arrays
  const ppgBuf = { ambient: [], ir: [], red: [] };

  // Generic device-battery readout — drivers call this via ctx.reportBattery(pct).
  function reportBattery(pct) {
    if (pct == null || Number.isNaN(pct)) { battery.value = null; return; }
    battery.value = Math.max(0, Math.min(100, Math.round(pct)));
  }

  // Generic sink: all drivers funnel decoded µV samples through here.
  function pushSamples(ch, samples) {
    if (!bleChannels[ch]) return;
    bleChannels[ch].push(...samples);
    bufferCount.value = Math.min(bleChannels[0].length, COLLECT_N);
    if (bleChannels[0].length >= COLLECT_N) completeEpoch();
  }

  // Snapshot the 4 s window, reset buffers, and publish the completed epoch.
  function completeEpoch() {
    const snapshot = bleChannels.map(chan => {
      const s = chan.slice(-COLLECT_N);
      chan.length = 0;
      return s;
    });
    bufferCount.value = 0;
    latestSamples.value = snapshot;
    epoch.value++;
    if (epochCallback) epochCallback(snapshot, { epoch: epoch.value, sampleRate: sampleRate.value });
  }

  // EMA smoothing + throttle + staleness state for onMusePPG, mirroring the
  // legacy app.js's hrEma/spo2Ema tracking. A single momentary bad window
  // (autocorrelation/periodicity gate rejects it, computeHeartRate returns
  // null) must not blank the displayed number — it just keeps the last good
  // EMA value on screen, marked "last known" instead of "live", until
  // PPG_STALE_MS elapses with no good reading at all.
  let hrEma = null, spo2Ema = null, lastPpgComputeAt = 0;
  let lastValidHrAt = 0, lastValidSpo2At = 0;
  function resetPpgSmoothing() {
    hrEma = null; spo2Ema = null; lastPpgComputeAt = 0;
    lastValidHrAt = 0; lastValidSpo2At = 0;
    hrStale.value = true; spo2Stale.value = true;
  }

  // Muse S PPG processing (heart rate + SpO2). Fed via ctx.onPPG.
  function onMusePPG(ev, channel) {
    const data = ev.target.value;
    // Muse PPG: 2-byte header + 6 samples × 3 bytes uint24 big-endian
    const buf = ppgBuf[channel];
    if (!buf) return;
    for (let i = 2; i + 2 < data.byteLength; i += 3) {
      buf.push((data.getUint8(i) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i + 2));
    }
    if (buf.length > PPG_WINDOW_SAMPLES) buf.splice(0, buf.length - PPG_WINDOW_SAMPLES);

    const now = performance.now();
    if (channel === 'ir' && buf.length >= PPG_WINDOW_SAMPLES && now - lastPpgComputeAt >= PPG_RECOMPUTE_MS) {
      lastPpgComputeAt = now;
      const rawHr = computeHeartRate(ppgBuf.ir);
      if (rawHr != null) {
        hrEma = hrEma == null ? rawHr : hrEma + 0.3 * (rawHr - hrEma);
        lastValidHrAt = now;
      }
      if (hrEma != null) heartRate.value = hrEma;
      hrStale.value = hrEma == null || now - lastValidHrAt > PPG_STALE_MS;

      if (ppgBuf.red.length >= PPG_WINDOW_SAMPLES) {
        const rawSpo2 = computeSpO2(ppgBuf.ir, ppgBuf.red);
        if (rawSpo2 != null) {
          spo2Ema = spo2Ema == null ? rawSpo2 : spo2Ema + 0.3 * (rawSpo2 - spo2Ema);
          lastValidSpo2At = now;
        }
        if (spo2Ema != null) spo2.value = spo2Ema;
        spo2Stale.value = spo2Ema == null || now - lastValidSpo2At > PPG_STALE_MS;
      }
    }
  }

  async function connect() {
    if (!navigator.bluetooth) {
      error.value = 'Web Bluetooth is not available. Please use Chrome or Edge on desktop.';
      return;
    }
    error.value = null;
    connecting.value = true;
    try {
      // Offer every supported headband in one scan.
      const filters = DRIVERS.flatMap(d => d.filters);
      const optionalServices = [...new Set(DRIVERS.flatMap(d => d.optionalServices))];
      const device = await navigator.bluetooth.requestDevice({ filters, optionalServices });
      btDevice = device;
      device.addEventListener('gattserverdisconnected', onBtDisconnected);

      // gatt.connect() is flaky on Windows ("Connection attempt failed") and often
      // succeeds on a retry — attempt up to 4 times with a short backoff.
      let server = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          status.value = 'connecting… (' + attempt + '/4)';
          server = await device.gatt.connect();
          break;
        } catch (e) {
          if (attempt === 4) throw e;
          await new Promise(r => setTimeout(r, 600));
        }
      }

      // Identify which driver owns the connected device.
      let driver = null;
      for (const d of DRIVERS) {
        if (await d.isMatch(server)) { driver = d; break; }
      }
      if (!driver) throw new Error('No compatible EEG driver for this device');

      activeDriver = driver;
      driverId.value = driver.id;
      hasPPG.value = !!driver.hasPPG;
      sampleRate.value = driver.sampleRate;

      // Size the channel buffers for this device.
      bleChannels.length = 0;
      for (let i = 0; i < driver.channelCount; i++) bleChannels.push([]);
      ppgBuf.ambient.length = 0; ppgBuf.ir.length = 0; ppgBuf.red.length = 0;
      heartRate.value = null; spo2.value = null;
      resetPpgSmoothing();
      battery.value = null;
      bufferCount.value = 0;

      await driver.start(server, { pushSamples, reportBattery, onPPG: onMusePPG });

      btDisconnect = () => { if (device.gatt.connected) device.gatt.disconnect(); };

      connected.value = true;
      deviceName.value = device.name || (driver.name + ' device');
      status.value = driver.name + ' connected';
    } catch (err) {
      if (!err.message?.includes('cancelled')) {
        error.value = 'BT failed: ' + err.message;
        status.value = 'error';
      }
    } finally {
      connecting.value = false;
    }
  }

  function disconnect() {
    if (btDisconnect) { btDisconnect(); btDisconnect = null; }
    btDevice = null;
    activeDriver = null;
    connected.value = false;
    driverId.value = null;
    hasPPG.value = false;
    sampleRate.value = SAMPLE_RATE;
    deviceName.value = '';
    battery.value = null;
    bleChannels.forEach(ch => { ch.length = 0; });
    ppgBuf.ambient.length = 0; ppgBuf.ir.length = 0; ppgBuf.red.length = 0;
    heartRate.value = null; spo2.value = null;
    resetPpgSmoothing();
    bufferCount.value = 0;
    status.value = 'disconnected';
  }

  function onBtDisconnected() {
    if (connected.value) disconnect();
  }

  return {
    // reactive state
    connected, connecting, deviceName, driverId, hasPPG, battery,
    sampleRate, latestSamples, heartRate, spo2, hrStale, spo2Stale, epoch, bufferCount, status, error,
    // constants (useful for buffer progress UI)
    COLLECT_N,
    // methods
    connect, disconnect, onEpoch,
  };
}
