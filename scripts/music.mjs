// video-gaga music — a deterministic, procedurally arranged score.
//
// The composition declares its own score: `music: { bpm, key, mode,
// progression, layers, lead, seed, … }`, designed by the agent for this video
// (there are no preset styles; see "the score spec" below). The runtime
// resolves the timeline (scenes snapped to the beat grid, voice spans, sound
// effects) and hands this module a plan via `__CV.info().score`. We arrange
// the music *from that plan*:
//   • harmony and groove come from the spec; the tempo is the video's grid
//   • each scene's `energy` decides which layers play in its bars
//   • the bed dips under narration and a lead melody fills the gaps
//   • hits get a breath of silence before them, scenes get fills and crashes
//   • the last bar resolves on the tonic and rings out with the final frame
//   • transition whooshes, ticks, risers and hits are synthesised in time
// Everything is a pure function of (plan, seed): no Math.random, no clock.
//
//   import { renderScore, writeWav } from './music.mjs'
//   const mix = renderScore(plan); writeWav('music.wav', mix)
//
// Pure JS, no dependencies: band-limited oscillators, a TPT state-variable
// filter, FM keys, Karplus–Strong plucks, modal bells, synthetic drums, a
// Freeverb-style reverb and a tempo-synced ping-pong delay.

import fs from 'node:fs';

const SR = 48000;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// deterministic helpers
// ---------------------------------------------------------------------------
function rng(seed) {
  let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, p) => a + (b - a) * p;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const db = (d) => Math.pow(10, d / 20);
const smooth = (p) => p * p * (3 - 2 * p);

// ---------------------------------------------------------------------------
// harmony
// ---------------------------------------------------------------------------
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

// MIDI note of scale degree d (0-based, may exceed 6 or go negative) above tonic.
function degree(tonic, mode, d) {
  const sc = MODES[mode];
  const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
  return tonic + sc[i] + 12 * o;
}
// Chord on scale degree `root` (0-based) as stacked diatonic thirds.
function chordTones(tonic, mode, root, size = 3) {
  const out = [];
  for (let k = 0; k < size; k++) out.push(degree(tonic, mode, root + 2 * k));
  return out;
}
// Voice a chord inside [lo, hi], as close as possible to the previous voicing.
function voiceLead(pcs, lo, hi, prev) {
  const cands = [];
  const classes = pcs.map((n) => ((n % 12) + 12) % 12);
  const build = (startOct, inv) => {
    const rot = classes.slice(inv).concat(classes.slice(0, inv));
    const v = [];
    let last = -Infinity;
    for (const pc of rot) {
      let n = startOct * 12 + pc;
      while (n <= last) n += 12;
      v.push(n);
      last = n;
    }
    return v;
  };
  for (let oct = Math.floor(lo / 12) - 1; oct <= Math.ceil(hi / 12); oct++)
    for (let inv = 0; inv < classes.length; inv++) {
      const v = build(oct, inv);
      if (v[0] >= lo && v[v.length - 1] <= hi) cands.push(v);
    }
  if (!cands.length) return build(Math.floor(lo / 12), 0);
  if (!prev) return cands[Math.floor(cands.length / 2)];
  const cost = (v) => v.reduce((a, n, i) => a + Math.abs(n - (prev[Math.min(i, prev.length - 1)] ?? n)), 0);
  return cands.reduce((b, v) => (cost(v) < cost(b) ? v : b));
}

// ---------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// TPT state-variable filter (Zavalishin). mode: 'lp' | 'bp' | 'hp'
function svf() {
  let ic1 = 0, ic2 = 0, g = 0, k = 1, a1 = 0, a2 = 0, a3 = 0;
  return {
    set(fc, q = 0.707) {
      g = Math.tan(Math.PI * clamp(fc, 20, SR * 0.45) / SR);
      k = 1 / q;
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    },
    run(v0, mode = 'lp') {
      const v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
      return mode === 'lp' ? v2 : mode === 'bp' ? v1 : v0 - k * v1 - v2;
    },
  };
}
function onePole(fc) {
  const a = Math.exp(-TAU * fc / SR);
  let z = 0;
  return (x) => (z = x * (1 - a) + z * a);
}

// A stereo bus with an optional reverb send.
function bus(n) { return { L: new Float32Array(n), R: new Float32Array(n) }; }

class Mixer {
  constructor(n) {
    this.n = n;
    this.bed = bus(n); this.keys = bus(n); this.drums = bus(n); this.lead = bus(n); this.sfx = bus(n);
    this.verb = new Float32Array(n);  // mono send → stereo reverb
    this.echo = new Float32Array(n);  // mono send → ping-pong delay
  }
  // add sample v at index i to bus b, equal-power pan (-1..1), sends
  put(b, i, v, pan = 0, verb = 0, echo = 0) {
    if (i < 0 || i >= this.n) return;
    const a = (pan + 1) * Math.PI / 4;
    b.L[i] += v * Math.cos(a) * 1.4142;
    b.R[i] += v * Math.sin(a) * 1.4142;
    if (verb) this.verb[i] += v * verb;
    if (echo) this.echo[i] += v * echo;
  }
}

// ---------------------------------------------------------------------------
// instruments — each renders one note into a bus
// ---------------------------------------------------------------------------
const I = {
  // Warm analog pad: 3 detuned band-limited saws → resonant low-pass.
  pad(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const att = o.attack ?? 0.6, rel = o.release ?? 1.2, vel = o.vel ?? 0.12;
    const len = Math.round((dur + rel) * SR);
    const det = [-0.11, 0, 0.12], ph = [0.13, 0.57, 0.81].map((x) => (x + note * 0.07) % 1);
    const flt = svf(), cut0 = (o.cutoff ?? 1400) * 1.35;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      if ((j & 31) === 0) flt.set(cut0 * (1 + 0.15 * Math.sin(TAU * 0.13 * (t0 + t))), 0.8);
      let s = 0;
      for (let v = 0; v < 3; v++) {
        const dt = (f * Math.pow(2, det[v] / 12)) / SR;
        ph[v] += dt; if (ph[v] >= 1) ph[v] -= 1;
        s += 2 * ph[v] - 1 - blep(ph[v], dt);
      }
      const env = (t < att ? smooth(t / att) : 1) * (t > dur ? Math.exp(-(t - dur) / (rel / 3)) : 1);
      m.put(b, n0 + j, flt.run(s / 3) * env * vel, o.pan ?? 0, o.verb ?? 0.35);
    }
  },
  // Soft string/organ-ish pad from sines (for ambient beds that must stay out of the way).
  sinepad(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const att = o.attack ?? 1.2, rel = o.release ?? 2, vel = o.vel ?? 0.1;
    const len = Math.round((dur + rel) * SR);
    const parts = [[1, 1], [2, 0.32], [3, 0.12], [4, 0.06]];
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const vib = 1 + 0.0025 * Math.sin(TAU * 4.8 * t + note);
      let s = 0;
      for (const [h, a] of parts) s += Math.sin(TAU * f * h * vib * t) * a;
      const env = (t < att ? smooth(t / att) : 1) * (t > dur ? Math.exp(-(t - dur) / (rel / 3)) : 1);
      m.put(b, n0 + j, s * 0.6 * env * vel, o.pan ?? 0, o.verb ?? 0.45);
    }
  },
  // FM electric piano (DX-style tine): ratio 1 modulator + bright tine partial.
  keys(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const vel = o.vel ?? 0.16, rel = 0.35, len = Math.round((Math.min(dur, 3.5) + rel) * SR);
    const idx0 = (o.bright ?? 1) * 3;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const idx = idx0 * Math.exp(-t / 0.35) + 0.25;
      const mod = Math.sin(TAU * f * t) * idx;
      let s = Math.sin(TAU * f * t + mod);
      s += 0.3 * Math.sin(TAU * f * 14 * t) * Math.exp(-t / 0.04); // tine "tick"
      s += 0.12 * Math.sin(TAU * f * 2 * t + mod * 0.5) * Math.exp(-t / 0.5); // body
      const env = Math.min(1, t / 0.004) * Math.exp(-t / (o.decay ?? 1.4)) * (t > dur ? Math.exp(-(t - dur) / 0.08) : 1);
      const trem = 1 + 0.06 * Math.sin(TAU * 4.5 * t);
      m.put(b, n0 + j, s * env * trem * vel, o.pan ?? 0, o.verb ?? 0.25, o.echo ?? 0);
    }
  },
  // Karplus–Strong plucked string (guitar, harp, pluck-synth).
  pluck(m, b, t0, dur, note, o = {}, r) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const N = SR / f, size = Math.ceil(N) + 2;
    const buf = new Float32Array(size);
    const bright = o.bright ?? 0.5;
    let lp = 0;
    for (let i = 0; i < size; i++) { const x = r() * 2 - 1; lp = lp + (x - lp) * (0.25 + bright * 0.7); buf[i] = lp; }
    const decay = o.decay ?? 0.996, vel = o.vel ?? 0.2;
    const len = Math.round(Math.min(dur + 0.25, o.ring ?? 3) * SR);
    let w = 0, prev = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      // fractional delay read
      const rp = w - N + size * 4;
      const i0 = Math.floor(rp) % size, fr = rp - Math.floor(rp);
      const y = buf[i0] * (1 - fr) + buf[(i0 + 1) % size] * fr;
      const nv = decay * (0.5 * (y + prev));
      prev = y;
      buf[w % size] = nv;
      w++;
      const env = Math.min(1, t / 0.002) * (t > dur ? Math.exp(-(t - dur) / 0.07) : 1);
      m.put(b, n0 + j, y * env * vel * 5, o.pan ?? 0, o.verb ?? 0.2, o.echo ?? 0); // ×5: KS is ~14 dB quieter than the FM keys
    }
  },
  // Modal percussion: glockenspiel, marimba, kalimba, celesta.
  bell(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const kind = o.kind || 'glock';
    const modes = {
      glock: [[1, 1, 1.4], [2.76, 0.32, 0.5], [5.4, 0.12, 0.2], [8.93, 0.05, 0.1]],
      marimba: [[1, 1, 0.55], [3.93, 0.18, 0.09], [9.54, 0.05, 0.03]],
      kalimba: [[1, 1, 0.9], [5.87, 0.16, 0.12], [9.1, 0.04, 0.05]],
      celesta: [[1, 1, 1.0], [2, 0.25, 0.4], [3.01, 0.1, 0.2], [4.2, 0.04, 0.1]],
    }[kind];
    const vel = o.vel ?? 0.14, len = Math.round(Math.min(4, modes[0][2] * 5) * SR);
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      let s = 0;
      for (const [r, a, d] of modes) s += Math.sin(TAU * f * r * t) * a * Math.exp(-t / d);
      const env = Math.min(1, t / 0.0015);
      m.put(b, n0 + j, s * env * vel, o.pan ?? 0, o.verb ?? 0.3, o.echo ?? 0);
    }
  },
  // Bass: sine + saturated 2nd/3rd harmonics, or a filtered saw (synth).
  bass(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const vel = o.vel ?? 0.32, rel = o.release ?? 0.08, len = Math.round((dur + rel) * SR);
    const flt = svf();
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      let s;
      if (o.synth) {
        const dt = f / SR;
        ph += dt; if (ph >= 1) ph -= 1;
        if ((j & 15) === 0) flt.set(lerp(o.cutoff ?? 300, (o.cutoff ?? 300) * 6, Math.exp(-t / (o.envDecay ?? 0.12))), 1.4);
        s = flt.run(2 * ph - 1 - blep(ph, dt)) * 0.9;
      } else {
        s = Math.tanh(1.6 * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t))) * 0.75;
        s += 0.12 * Math.sin(TAU * 3 * f * t) * Math.exp(-t / 0.08); // finger attack
      }
      const env = Math.min(1, t / 0.006) * Math.exp(-t / (o.decay ?? 2.5)) * (t > dur ? Math.exp(-(t - dur) / (rel / 3)) : 1);
      m.put(b, n0 + j, s * env * vel * 0.55, 0, 0.02);
    }
  },
  // Lead: soft square/saw voice with vibrato (synth melodies).
  lead(m, b, t0, dur, note, o = {}) {
    const f = mtof(note), n0 = Math.round(t0 * SR);
    const vel = o.vel ?? 0.09, rel = 0.25, len = Math.round((dur + rel) * SR);
    const flt = svf();
    flt.set(o.cutoff ?? 2600, 0.9);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t) * clamp((t - 0.18) / 0.3);
      const dt = (f * vib) / SR;
      ph += dt; if (ph >= 1) ph -= 1;
      const saw = 2 * ph - 1 - blep(ph, dt);
      const sq = (ph < 0.5 ? 1 : -1) + blep(ph, dt) - blep((ph + 0.5) % 1, dt);
      const s = flt.run(lerp(sq, saw, o.saw ?? 0.4));
      const env = Math.min(1, t / 0.02) * (t > dur ? Math.exp(-(t - dur) / 0.08) : 1);
      m.put(b, n0 + j, s * env * vel, o.pan ?? 0, o.verb ?? 0.25, o.echo ?? 0.35);
    }
  },
};

// drums -----------------------------------------------------------------------
const D = {
  kick(m, t0, o = {}) {
    const n0 = Math.round(t0 * SR), vel = o.vel ?? 0.7, len = Math.round(0.5 * SR);
    const f0 = o.f0 ?? 120, f1 = o.f1 ?? 46;
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      const f = f1 + (f0 - f1) * Math.exp(-t / 0.03);
      ph += f / SR;
      let s = Math.sin(TAU * ph) * Math.exp(-t / (o.decay ?? 0.28));
      s += (j < 120 ? (1 - j / 120) * 0.25 * Math.sin(j * 1.7) : 0); // click
      m.put(m.drums, n0 + j, Math.tanh(s * 1.4) * vel * 0.7, 0, 0);
    }
  },
  // generic noise hit: hat / shaker / snare body / clap
  noise(m, t0, o, r) {
    const n0 = Math.round(t0 * SR), len = Math.round((o.len ?? 0.2) * SR);
    const flt = svf();
    flt.set(o.fc ?? 7000, o.q ?? 0.8);
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      let env = Math.exp(-t / (o.decay ?? 0.04)) * Math.min(1, t / (o.attack ?? 0.0008));
      if (o.clap) { // three quick re-triggers then the tail
        const k = Math.floor(t / 0.011);
        env = k < 3 ? Math.exp(-(t - k * 0.011) / 0.004) : Math.exp(-(t - 0.033) / (o.decay ?? 0.11));
      }
      const v = flt.run(r() * 2 - 1, o.mode ?? 'hp') * env * (o.vel ?? 0.1);
      m.put(o.bus || m.drums, n0 + j, v, o.pan ?? 0, o.verb ?? 0.05);
    }
  },
  hat(m, t0, o = {}, r) { D.noise(m, t0, { fc: 7500, decay: o.open ? 0.18 : 0.03, len: o.open ? 0.4 : 0.08, vel: (o.vel ?? 0.07) * 2.4, pan: o.pan ?? 0.25, verb: 0.04 }, r); },
  shaker(m, t0, o = {}, r) { D.noise(m, t0, { fc: 6000, q: 0.9, mode: 'bp', attack: 0.012, decay: 0.04, len: 0.1, vel: (o.vel ?? 0.06) * 2.6, pan: o.pan ?? -0.3, verb: 0.05 }, r); },
  clap(m, t0, o = {}, r) { D.noise(m, t0, { fc: 1300, q: 1.1, mode: 'bp', clap: true, decay: o.decay ?? 0.12, len: 0.35, vel: o.vel ?? 0.28, verb: o.verb ?? 0.22 }, r); },
  snare(m, t0, o = {}, r) {
    D.noise(m, t0, { fc: 2200, q: 0.7, mode: 'bp', decay: o.decay ?? 0.14, len: 0.4, vel: (o.vel ?? 0.3), verb: o.verb ?? 0.25 }, r);
    // tonal body
    const n0 = Math.round(t0 * SR), len = Math.round(0.12 * SR);
    for (let j = 0; j < len; j++) { const t = j / SR; m.put(m.drums, n0 + j, Math.sin(TAU * 185 * t) * Math.exp(-t / 0.04) * (o.vel ?? 0.3) * 0.6, 0, 0.1); }
  },
  rim(m, t0, o = {}) {
    const n0 = Math.round(t0 * SR), len = Math.round(0.05 * SR);
    for (let j = 0; j < len; j++) { const t = j / SR; m.put(m.drums, n0 + j, (Math.sin(TAU * 820 * t) * 0.6 + Math.sin(TAU * 1650 * t) * 0.4) * Math.exp(-t / 0.012) * (o.vel ?? 0.12), 0.1, 0.12); }
  },
  tom(m, t0, o = {}) {
    const n0 = Math.round(t0 * SR), len = Math.round(0.9 * SR), f0 = o.f ?? 90, vel = o.vel ?? 0.45;
    let ph = 0;
    for (let j = 0; j < len; j++) { const t = j / SR; ph += (f0 * (1 + 0.5 * Math.exp(-t / 0.05))) / SR; m.put(m.drums, n0 + j, Math.tanh(Math.sin(TAU * ph) * 1.5) * Math.exp(-t / 0.35) * vel, o.pan ?? 0, 0.3); }
  },
  crash(m, t0, o = {}, r) { D.noise(m, t0, { fc: 5200, q: 0.5, decay: o.decay ?? 0.9, len: 2.2, vel: o.vel ?? 0.07, attack: 0.002, verb: 0.2, pan: 0.15 }, r); },
};

// sound effects ---------------------------------------------------------------
const FX = {
  // Air moving past: band-passed noise swelling to the transition midpoint.
  whoosh(m, e, r) {
    const dur = Math.max(0.35, Math.min(1.4, (e.dur ?? 0.6) * 1.25)), pre = dur * 0.62;
    const n0 = Math.round((e.t - pre) * SR), len = Math.round(dur * SR), vel = 0.16 * (e.gain ?? 1);
    const f = svf();
    for (let j = 0; j < len; j++) {
      const t = j / SR, x = t / dur;
      if ((j & 31) === 0) f.set(lerp(350, 2600, Math.sin(Math.PI * Math.min(1, x * 1.1)) ** 1.5), 1.6);
      const env = x < 0.62 ? Math.pow(x / 0.62, 2.2) : Math.exp(-(x - 0.62) / 0.12);
      m.put(m.sfx, n0 + j, f.run(r() * 2 - 1, 'bp') * env * vel, lerp(-0.7, 0.7, x), 0.12);
    }
  },
  swish(m, e, r) { FX.whoosh(m, { ...e, dur: Math.min(0.5, (e.dur ?? 0.4) * 0.8), gain: (e.gain ?? 1) * 0.6 }, r); },
  // Impact: sub thump + noise burst + room (land a big reveal).
  hit(m, e, r) {
    const vel = e.gain ?? 1;
    D.kick(m, e.t, { vel: 0.65 * vel, f0: 140, f1: 38, decay: 0.55 });
    const n0 = Math.round(e.t * SR), len = Math.round(1.6 * SR);
    for (let j = 0; j < len; j++) {
      const t = j / SR;
      m.put(m.sfx, n0 + j, Math.sin(TAU * 42 * t) * Math.exp(-t / 0.5) * 0.25 * vel, 0, 0.15);
    }
    D.noise(m, e.t, { bus: m.sfx, fc: 1800, q: 0.5, mode: 'lp', decay: 0.25, len: 1, vel: 0.12 * vel, verb: 0.6 }, r);
  },
  boom(m, e) {
    const vel = e.gain ?? 1, n0 = Math.round(e.t * SR), len = Math.round(2.4 * SR);
    let ph = 0;
    for (let j = 0; j < len; j++) { const t = j / SR; ph += (30 + 50 * Math.exp(-t / 0.25)) / SR; m.put(m.sfx, n0 + j, Math.tanh(Math.sin(TAU * ph) * 1.8) * Math.exp(-t / 0.8) * 0.35 * vel, 0, 0.3); }
  },
  // Tension that *ends* exactly at e.t (place it on the hit).
  riser(m, e, r) {
    const dur = e.dur ?? 1.6, n0 = Math.round((e.t - dur) * SR), len = Math.round(dur * SR), vel = 0.12 * (e.gain ?? 1);
    const f = svf();
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / SR, x = t / dur;
      if ((j & 31) === 0) f.set(lerp(400, 7000, x * x), 2);
      ph += lerp(180, 720, x * x) / SR;
      const env = Math.pow(x, 2.5) * (x > 0.97 ? (1 - x) / 0.03 : 1);
      m.put(m.sfx, n0 + j, (f.run(r() * 2 - 1, 'bp') * 0.8 + Math.sin(TAU * ph) * 0.25) * env * vel, Math.sin(x * 9) * 0.4, 0.35);
    }
  },
  // Reverse swell into the moment (ink, dissolve, soft reveals).
  swell(m, e, r) { FX.riser(m, { ...e, dur: Math.max(0.5, (e.dur ?? 0.8) * 0.9), t: e.t + (e.dur ?? 0.8) * 0.3, gain: (e.gain ?? 1) * 0.55 }, r); },
  tick(m, e) {
    const n0 = Math.round(e.t * SR), len = Math.round(0.04 * SR), vel = 0.16 * (e.gain ?? 1);
    for (let j = 0; j < len; j++) { const t = j / SR; m.put(m.sfx, n0 + j, Math.sin(TAU * (e.freq ?? 2400) * t) * Math.exp(-t / 0.006) * vel, e.pan ?? 0.1, 0.05); }
  },
  click(m, e) { FX.tick(m, { ...e, freq: 4200, gain: (e.gain ?? 1) * 0.7 }); },
  pop(m, e) {
    const n0 = Math.round(e.t * SR), len = Math.round(0.09 * SR), vel = 0.2 * (e.gain ?? 1);
    let ph = 0;
    for (let j = 0; j < len; j++) { const t = j / SR; ph += lerp(520, 980, Math.min(1, t / 0.03)) / SR; m.put(m.sfx, n0 + j, Math.sin(TAU * ph) * Math.exp(-t / 0.025) * vel, e.pan ?? 0, 0.15); }
  },
  // Stuttered, bit-crushed bursts (digital/cyber only).
  glitch(m, e, r) {
    const n0 = Math.round((e.t - 0.06) * SR), len = Math.round(0.22 * SR), vel = 0.12 * (e.gain ?? 1);
    let hold = 0, v = 0;
    for (let j = 0; j < len; j++) {
      if (hold-- <= 0) { v = r() * 2 - 1; hold = 6 + Math.floor(r() * 40); }
      const gate = Math.floor(j / (SR * 0.028)) % 2 === 0 ? 1 : 0.15;
      m.put(m.sfx, n0 + j, v * gate * vel * Math.exp(-j / (SR * 0.12)), (r() - 0.5) * 0.8, 0.05);
    }
  },
  // A quick upward bell arpeggio of the current chord (light, sparkle).
  shimmer(m, e, r, h) {
    const tones = h.chordAt(e.t).map((n) => n + 24);
    tones.concat(tones[0] + 12).forEach((n, i) => I.bell(m, m.sfx, e.t - 0.12 + i * 0.045, 0.6, n, { kind: 'celesta', vel: 0.05 * (e.gain ?? 1), verb: 0.6, pan: lerp(-0.4, 0.4, i / 3) }));
  },
  chime(m, e, r, h) {
    const root = h.tonic + 24;
    I.bell(m, m.sfx, e.t, 1, root + 7, { kind: 'glock', vel: 0.09 * (e.gain ?? 1), verb: 0.5, pan: -0.15 });
    I.bell(m, m.sfx, e.t + 0.16, 1, root + 12, { kind: 'glock', vel: 0.09 * (e.gain ?? 1), verb: 0.5, pan: 0.15 });
  },
  // Paper sheet sliding (page transitions).
  paper(m, e, r) {
    const dur = Math.max(0.35, (e.dur ?? 0.7) * 1.1), n0 = Math.round((e.t - dur * 0.5) * SR), len = Math.round(dur * SR);
    const f = svf();
    f.set(2600, 0.6);
    let brown = 0;
    for (let j = 0; j < len; j++) {
      const x = j / len;
      brown = brown * 0.96 + (r() * 2 - 1) * 0.3;
      const grit = r() < 0.02 ? (r() - 0.5) * 2 : 0;
      m.put(m.sfx, n0 + j, f.run(brown + grit, 'bp') * Math.sin(Math.PI * x) ** 1.5 * 0.35 * (e.gain ?? 1), lerp(0.5, -0.5, x), 0.08);
    }
  },
  // Typewriter / key press.
  type(m, e, r) { D.noise(m, e.t, { bus: m.sfx, fc: 3200, q: 1.4, mode: 'bp', decay: 0.008, len: 0.04, vel: 0.22 * (e.gain ?? 1), verb: 0.05, pan: (r() - 0.5) * 0.4 }, r); },
};

// ---------------------------------------------------------------------------
// the score spec — designed by the agent for each video, validated here
// ---------------------------------------------------------------------------
// There are no built-in music styles. Each composition declares its own score,
// designed from the brief (docs/music-and-sound.md §2):
//
//   music: {
//     bpm: 96, key: 'G', mode: 'major', seed: 7,
//     progression: [0, 4, 5, 3], sevenths: false, chordBars: 1,
//     layers: [
//       { inst: 'pad', notes: 'chord', pattern: 'X---', vel: 0.05, cutoff: [700, 1400] },
//       { inst: 'pluck', notes: ['root_', 2, 'fifth_', 1], pattern: 'XxXx XxXx', vel: 0.14, from: 0.2 },
//       { inst: 'kick', pattern: 'X... ..x. X... ....', vel: 0.5, from: 0.5 },
//     ],
//     lead: { inst: 'bell', kind: 'glock', range: [74, 88], rhythm: 'melodic', vel: 0.1 },
//   }
//
// A pattern covers `bars` bars (default 1) in equal steps: X = hit, x = soft
// hit (0.6), 1–9 = hit at n/9, '-' = hold the previous note one more step,
// '.' = rest; spaces are ignored. A layer plays in bars whose energy is in
// [from, to). Any numeric sound option may be [low, high], set by the energy.
// validateScore() enforces LIMITS; renderScore() refuses a spec with errors.

export const LIMITS = {
  bpm: [60, 150],
  beatsPerBar: [2, 7],
  progressionLength: [1, 8],
  degree: [0, 6],
  chordBars: [1, 2, 4],
  layers: 8,
  patternBars: [1, 2, 4],
  stepsPerBar: 32,
  octave: [-2, 2],
  noteRange: [28, 100], // MIDI, after octave shifts (E1 … E7)
  gate: [0.05, 8],
  // loudest allowed hit per instrument (the mix is normalised afterwards; these
  // keep one layer from swamping the others or clipping the bus)
  vel: { pad: 0.12, sinepad: 0.12, keys: 0.2, pluck: 0.2, bell: 0.2, lead: 0.12, bass: 0.35, kick: 0.7, snare: 0.35, clap: 0.3, snap: 0.25, rim: 0.2, hat: 0.12, openhat: 0.1, shaker: 0.12, tom: 0.5 },
  drumHitsPerBar: 40, // all drum layers together, at full energy
  lead: { vel: 0.15, range: [55, 96], insts: ['keys', 'bell', 'pluck', 'lead'] },
};
export const INSTRUMENTS = {
  pitched: ['pad', 'sinepad', 'keys', 'pluck', 'bell', 'bass', 'lead'],
  drums: ['kick', 'snare', 'clap', 'snap', 'rim', 'hat', 'openhat', 'shaker', 'tom'],
};
export const MODE_NAMES = Object.keys(MODES);
export const BELL_KINDS = ['glock', 'marimba', 'kalimba', 'celesta'];

// sound options and their allowed ranges (numbers may also be [low, high] by energy)
const OPT_RANGES = {
  cutoff: [80, 8000], attack: [0, 4], release: [0, 6], bright: [0, 1], decay: [0, 8],
  echo: [0, 0.6], verb: [0, 1], strum: [0, 0.1], envDecay: [0.01, 1], saw: [0, 1], pitch: [40, 400],
};
const OPTS_FOR = {
  pad: ['cutoff', 'attack', 'release'], sinepad: ['attack', 'release'],
  keys: ['bright', 'decay', 'echo', 'verb', 'release', 'strum'], pluck: ['bright', 'decay', 'echo', 'verb', 'strum'],
  bell: ['kind', 'echo', 'verb'], bass: ['synth', 'cutoff', 'envDecay', 'decay', 'release'], lead: ['saw', 'cutoff', 'echo', 'verb'],
  tom: ['pitch'],
};
const LAYER_KEYS = ['inst', 'pattern', 'notes', 'octave', 'vel', 'from', 'to', 'bars', 'gate', 'pan', 'name'];
const SPEC_KEYS = ['bpm', 'key', 'mode', 'seed', 'progression', 'sevenths', 'chordBars', 'layers', 'lead', 'fills', 'beatsPerBar', 'parts'];
// what a part (a chapter of a long score, chosen per scene with `part`) may change
const PART_KEYS = ['key', 'mode', 'progression', 'chordBars', 'sevenths', 'seed', 'lead'];
const NOTE_TOKEN = /^(root|third|fifth|seventh|[0-7])([_^]*)$/;

// pattern → { len, events: [{ i, v, len }] }
function parsePattern(p) {
  const s = String(p).replace(/\s+/g, '');
  const events = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '.') continue;
    if (c === '-') { if (!events.length) return { error: `starts with a hold '-'` }; events[events.length - 1].len++; continue; }
    const v = c === 'X' ? 1 : c === 'x' ? 0.6 : /[1-9]/.test(c) ? +c / 9 : null;
    if (v == null) return { error: `has '${c}' (use X x 1-9 - .)` };
    events.push({ i, v, len: 1 });
  }
  return { len: s.length, events };
}

const isRange = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const atEnergy = (v, e) => (Array.isArray(v) ? lerp(v[0], v[1], e) : v);

// → { errors: string[], warnings: string[] }
export function validateScore(spec) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!spec || typeof spec !== 'object') return { errors: ['music must be an object'], warnings };
  if ('style' in spec) err(`music.style ('${spec.style}') is not supported: there are no preset styles. Design the score for this video (bpm, key, mode, progression, layers, lead), see docs/music-and-sound.md`);
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.includes(k) && !['volume', 'duck', 'gap', 'intro', 'ending', 'offset', 'snap', 'voiceOnBeat', 'sfx', 'file', 'style', 'duration', 'fps', 'sections', 'voice'].includes(k)) err(`music.${k} is not a score option`);
  const inRange = (name, v, [a, b]) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b) err(`${name} must be a number in ${a}…${b} (got ${JSON.stringify(v)})`); };
  inRange('music.bpm', spec.bpm, LIMITS.bpm);
  if (spec.beatsPerBar != null) inRange('music.beatsPerBar', spec.beatsPerBar, LIMITS.beatsPerBar);
  // layers: [] and no lead = sound effects only (on the beat grid): no harmony needed
  const sfxOnly = Array.isArray(spec.layers) && !spec.layers.length && spec.lead == null;
  const harmony = (at, h, partial) => {
    if (sfxOnly || (partial && h.key == null)) { /* nothing to check */ } else if (!(h.key in NOTE)) err(`${at}.key must be one of ${Object.keys(NOTE).join(' ')} (got ${JSON.stringify(h.key)})`);
    if (!sfxOnly && !(partial && h.mode == null) && !MODE_NAMES.includes(h.mode)) err(`${at}.mode must be one of ${MODE_NAMES.join(', ')} (got ${JSON.stringify(h.mode)})`);
    const prog = h.progression;
    if (sfxOnly || (partial && prog == null)) { /* no chords */ } else if (!Array.isArray(prog) || prog.length < LIMITS.progressionLength[0] || prog.length > LIMITS.progressionLength[1]) err(`${at}.progression must list ${LIMITS.progressionLength.join('–')} scale degrees`);
    else prog.forEach((d, i) => { if (!Number.isInteger(d) || d < LIMITS.degree[0] || d > LIMITS.degree[1]) err(`${at}.progression[${i}] must be a scale degree 0–6 (0 = tonic)`); });
    if (h.chordBars != null && !LIMITS.chordBars.includes(h.chordBars)) err(`${at}.chordBars must be ${LIMITS.chordBars.join(', ')}`);
    if (h.sevenths != null && typeof h.sevenths !== 'boolean') err(`${at}.sevenths must be true or false`);
  };
  harmony('music', spec, false);

  const layers = spec.layers;
  if (!Array.isArray(layers)) err('music.layers must be an array ([] = sound effects only)');
  else {
    if (layers.length > LIMITS.layers) err(`music.layers: at most ${LIMITS.layers} layers (got ${layers.length}); fewer, clearer parts leave room for the voice`);
    let drumHits = 0;
    layers.forEach((L, li) => {
      const at = `music.layers[${li}]${L?.name ? ` (${L.name})` : ''}`;
      if (!L || typeof L !== 'object') return err(`${at} must be an object`);
      const pitched = INSTRUMENTS.pitched.includes(L.inst), drum = INSTRUMENTS.drums.includes(L.inst);
      if (!pitched && !drum) return err(`${at}.inst must be one of ${[...INSTRUMENTS.pitched, ...INSTRUMENTS.drums].join(', ')} (got ${JSON.stringify(L.inst)})`);
      const allowed = [...LAYER_KEYS, ...(OPTS_FOR[L.inst] || [])];
      for (const k of Object.keys(L)) if (!allowed.includes(k)) err(`${at}.${k} is not an option for ${L.inst} (allowed: ${allowed.join(', ')})`);
      const bars = L.bars ?? 1;
      if (!LIMITS.patternBars.includes(bars)) err(`${at}.bars must be ${LIMITS.patternBars.join(', ')}`);
      if (typeof L.pattern !== 'string') err(`${at}.pattern is required (e.g. 'X---' or 'X.x.X.x.')`);
      else {
        const p = parsePattern(L.pattern);
        if (p.error) err(`${at}.pattern ${p.error}`);
        else if (p.len % bars) err(`${at}.pattern has ${p.len} steps, which doesn't divide into ${bars} bar(s)`);
        else if (p.len / bars > LIMITS.stepsPerBar) err(`${at}.pattern: at most ${LIMITS.stepsPerBar} steps per bar`);
        else if (!p.events.length) err(`${at}.pattern has no hits`);
        else if (drum) drumHits += p.events.length / bars;
      }
      const cap = LIMITS.vel[L.inst];
      if (cap != null) {
        const vs = isRange(L.vel) ? L.vel : [L.vel];
        if (vs.some((v) => typeof v !== 'number' || !(v > 0) || v > cap)) err(`${at}.vel must be in (0, ${cap}] for ${L.inst} (got ${JSON.stringify(L.vel)})`);
      }
      for (const k of ['from', 'to']) if (L[k] != null) inRange(`${at}.${k}`, L[k], [0, 1.01]);
      if (L.from != null && L.to != null && L.to <= L.from) err(`${at}: to must be above from`);
      if (L.gate != null) inRange(`${at}.gate`, L.gate, LIMITS.gate);
      if (L.pan != null && L.pan !== 'spread') inRange(`${at}.pan`, L.pan, [-1, 1]);
      if (L.octave != null && (!Number.isInteger(L.octave) || L.octave < LIMITS.octave[0] || L.octave > LIMITS.octave[1])) err(`${at}.octave must be an integer ${LIMITS.octave.join('…')}`);
      if (drum && L.notes != null) err(`${at}.notes: ${L.inst} is a drum and has no notes`);
      if (pitched && L.notes != null) {
        const ns = Array.isArray(L.notes) ? L.notes : [L.notes];
        if (!ns.length) err(`${at}.notes is empty`);
        ns.forEach((t) => { if (!(t === 'chord' && !Array.isArray(L.notes)) && !NOTE_TOKEN.test(String(t))) err(`${at}.notes: '${t}' is not a note (use 'chord', root, third, fifth, seventh or a chord-tone index 0–7, with ^ / _ for an octave up / down)`); });
      }
      if (L.kind != null && !BELL_KINDS.includes(L.kind)) err(`${at}.kind must be one of ${BELL_KINDS.join(', ')}`);
      if (L.synth != null && typeof L.synth !== 'boolean') err(`${at}.synth must be true or false`);
      for (const k of Object.keys(OPT_RANGES)) if (L[k] != null) {
        const vs = isRange(L[k]) ? L[k] : [L[k]];
        vs.forEach((v) => inRange(`${at}.${k}`, v, OPT_RANGES[k]));
      }
    });
    if (drumHits > LIMITS.drumHitsPerBar) err(`music.layers: ${Math.round(drumHits)} drum hits per bar at full energy (max ${LIMITS.drumHitsPerBar}); thin the patterns`);
    const ok = layers.filter((L) => L && INSTRUMENTS.pitched.includes(L.inst));
    if (layers.length && !ok.some((L) => (L.from ?? 0) <= 0.3 && L.inst !== 'bass')) warn('no harmony plays at low energy (a pad, keys or pluck layer with from ≤ 0.3): quiet scenes will sound empty');
    if (layers.length > 1 && layers.every((L) => (L?.from ?? 0) === 0 && L?.to == null)) warn('every layer plays at every energy: give layers a `from` so the score builds and breathes with the story');
    if (layers.some((L) => L && INSTRUMENTS.drums.includes(L.inst) && (L.from ?? 0) < 0.3)) warn('drums play at energy < 0.3: they will sit under the quietest, most intimate moments');
  }
  const checkLead = (at, lead) => {
    if (typeof lead !== 'object') return err(`${at} must be an object or null`);
    if (!LIMITS.lead.insts.includes(lead.inst)) err(`${at}.inst must be one of ${LIMITS.lead.insts.join(', ')}`);
    if (!(lead.rhythm in RHYTHMS)) err(`${at}.rhythm must be one of ${Object.keys(RHYTHMS).join(', ')}`);
    if (!isRange(lead.range) || lead.range[0] < LIMITS.lead.range[0] || lead.range[1] > LIMITS.lead.range[1] || lead.range[1] - lead.range[0] < 7) err(`${at}.range must be [low, high] MIDI within ${LIMITS.lead.range.join('…')}, at least 7 semitones wide`);
    if (typeof lead.vel !== 'number' || !(lead.vel > 0) || lead.vel > LIMITS.lead.vel) err(`${at}.vel must be in (0, ${LIMITS.lead.vel}]`);
    const allowed = ['inst', 'range', 'rhythm', 'vel', ...(OPTS_FOR[lead.inst] || []), 'bright', 'decay'];
    for (const k of Object.keys(lead)) if (!allowed.includes(k)) err(`${at}.${k} is not an option for ${lead.inst}`);
    if (lead.kind != null && !BELL_KINDS.includes(lead.kind)) err(`${at}.kind must be one of ${BELL_KINDS.join(', ')}`);
    for (const k of Object.keys(OPT_RANGES)) if (lead[k] != null) inRange(`${at}.${k}`, lead[k], OPT_RANGES[k]);
  };
  if (spec.lead != null) checkLead('music.lead', spec.lead);
  // parts: chapters of a long score. Each may change the harmony and the
  // melody; the layers (the instruments) stay, so the video keeps one sound.
  if (spec.parts != null) {
    if (typeof spec.parts !== 'object' || Array.isArray(spec.parts)) err('music.parts must be an object: { name: { progression, key, mode, chordBars, sevenths, seed, lead } }');
    else for (const [name, part] of Object.entries(spec.parts)) {
      const at = `music.parts.${name}`;
      if (!part || typeof part !== 'object') { err(`${at} must be an object`); continue; }
      for (const k of Object.keys(part)) if (!PART_KEYS.includes(k)) err(`${at}.${k} is not a part option (a part may change ${PART_KEYS.join(', ')}; layers stay the same for the whole video)`);
      harmony(at, part, true);
      if (part.seed != null && !Number.isFinite(part.seed)) err(`${at}.seed must be a number`);
      if (part.lead != null) {
        if (!spec.lead) err(`${at}.lead: there is no music.lead to vary (add one, or leave the part's lead out)`);
        else checkLead(`${at}.lead`, { ...spec.lead, ...part.lead });
      }
    }
  }
  for (const sec of spec.sections || []) if (sec.part != null && !spec.parts?.[sec.part]) err(`scene "${sec.id}": part '${sec.part}' is not in music.parts (${Object.keys(spec.parts || {}).join(', ') || 'none defined'})`);
  return { errors, warnings };
}

// One layer, one bar: schedule its notes with the arranger API.
function playLayer(a, L, P, c, e, bi) {
  const bars = L.bars ?? 1, spb = P.len / bars, step = a.barLen / spb;
  const pos = bi % bars, lo = pos * spb, hi = lo + spb;
  const gate = L.gate ?? (L.inst === 'pad' || L.inst === 'sinepad' ? 1 : 0.9);
  const base = atEnergy(L.vel, e);
  const opts = {};
  for (const k of OPTS_FOR[L.inst] || []) if (L[k] != null && k !== 'pitch') opts[k] = atEnergy(L[k], e);
  if (typeof L.pan === 'number') opts.pan = L.pan;
  const notes = L.notes == null ? (L.inst === 'bass' ? ['root'] : ['chord']) : Array.isArray(L.notes) ? L.notes : [L.notes];
  const shift = 12 * (L.octave ?? 0);
  const fold = (n) => { while (n < LIMITS.noteRange[0]) n += 12; while (n > LIMITS.noteRange[1]) n -= 12; return n; };
  const pitch = (tok) => {
    const [, name, oct] = String(tok).match(NOTE_TOKEN);
    const v = c.voicing;
    let n = name === 'root' ? c.root : name === 'third' ? c.tones[1] : name === 'fifth' ? c.tones[2]
      : name === 'seventh' ? c.seventh : v[+name % v.length] + 12 * Math.floor(+name / v.length);
    for (const ch of oct) n += ch === '^' ? 12 : -12;
    return fold(n + shift);
  };
  P.events.forEach((ev, k) => {
    if (ev.i < lo || ev.i >= hi) return;
    const lt = (ev.i - lo) * step, d = ev.len * step * gate, vel = base * ev.v;
    if (INSTRUMENTS.drums.includes(L.inst)) {
      if (L.inst === 'hat' || L.inst === 'openhat') a.hat(lt, vel, L.inst === 'openhat');
      else if (L.inst === 'tom') a.tom(lt, vel, L.pitch ?? 90);
      else a[L.inst](lt, vel);
      return;
    }
    const tok = notes[k % notes.length];
    const o = { ...opts, vel };
    if (tok === 'chord') {
      const ns = c.voicing.map((n) => fold(n + shift));
      if (L.inst === 'pad') a.pad(ns, lt, d, o);
      else if (L.inst === 'bass' || L.inst === 'bell' || L.inst === 'lead') ns.forEach((n) => a[L.inst](n, lt, d, o));
      else a.chord(L.inst, ns, lt, d, o);
      return;
    }
    const n = pitch(tok);
    if (L.inst === 'pad') a.pad([n], lt, d, o);
    else if (L.inst === 'sinepad') a.chord('sinepad', [n], lt, d, o);
    else a[L.inst](n, lt, d, o);
  });
}

// Melody rhythms in beats: [start, length] over two bars (8 beats).
const RHYTHMS = {
  sparse: [[[0, 2], [2.5, 1.5], [4, 3]], [[0.5, 1.5], [2, 2], [5, 2.5]], [[0, 1], [1, 1], [2, 3], [6, 1.5]]],
  melodic: [[[0, 1], [1, 0.5], [1.5, 1.5], [3, 1], [4, 1], [5, 0.5], [5.5, 2]], [[0, 1.5], [1.5, 0.5], [2, 2], [4.5, 0.5], [5, 1], [6, 2]], [[0.5, 0.5], [1, 1], [2, 1], [3, 1], [4, 3]]],
  rhythmic: [[[0, 0.5], [0.75, 0.5], [1.5, 0.5], [2.5, 1], [4, 0.5], [4.75, 0.5], [5.5, 1.5]], [[0, 0.75], [0.75, 0.75], [1.5, 1], [3, 0.5], [3.5, 0.5], [4, 2]]],
};

// ---------------------------------------------------------------------------
// arrangement
// ---------------------------------------------------------------------------
export function renderScore(plan, opts = {}) {
  const { errors, warnings } = validateScore(plan);
  if (errors.length) throw new Error(`music: the score spec has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  const layers = plan.layers.map((L) => ({ L, P: parsePattern(L.pattern) }));
  const silent = !layers.length && !plan.lead; // sound effects only
  if (silent) plan = { ...plan, key: plan.key || 'C', mode: plan.mode || 'major', progression: plan.progression || [0] }; // harmony for tonal sfx
  const bpm = plan.bpm;
  const beat = 60 / bpm, beatsPerBar = plan.beatsPerBar || 4, barLen = beat * beatsPerBar;
  const offset = plan.offset || 0;
  const duration = plan.duration;
  const n = Math.ceil((duration + 0.05) * SR);
  const m = new Mixer(n);
  const R = rng(`${plan.seed ?? 1}:${plan.key}:${plan.mode}`);
  const tonic = 48 + NOTE[plan.key];
  const mode = plan.mode;
  const prog = plan.progression, chordBars = plan.chordBars ?? 1, sevenths = !!plan.sevenths;
  const voice = (plan.voice || []).map((v) => [v.start - 0.12, v.end + 0.2]);
  const voicedAt = (t) => voice.some(([a, b]) => t >= a && t < b);
  const sections = plan.sections || [{ start: 0, end: duration, energy: 0.5 }];

  // energy per section: explicit, else a gentle arc (quiet open, fuller middle,
  // settled ending); music-only sections lift a little — the score carries them
  const energyOf = (sec, i) => {
    if (sec.energy != null) return clamp(sec.energy);
    const last = i === sections.length - 1;
    const base = i === 0 ? 0.35 : last ? 0.5 : 0.62;
    return clamp(base + (sec.voiced ? 0 : 0.12));
  };
  const secAt = (t) => { let k = 0; sections.forEach((s, i) => { if (t >= s.start - 1e-6) k = i; }); return k; };

  // timeline of bars (bar 0 starts at the grid offset; a pickup before it is silent)
  const nBars = Math.ceil((duration - offset) / barLen) + 1;
  // the final resolution: last downbeat that leaves ≥ 1 s to ring
  const ring = Math.max(1.0, beat * 2);
  let endBar = Math.floor((duration - ring - offset) / barLen + 1e-6);
  if (plan.ending === 'none' || silent) endBar = nBars + 1;
  const endT = offset + endBar * barLen;

  // accents: big hits get a half-beat breath before them
  const hits = (plan.sfx || []).filter((e) => e.type === 'hit' || e.type === 'boom').map((e) => e.t);
  const breathAt = (t) => hits.some((h) => t >= h - beat * 0.5 && t < h - 0.01);

  // parts: a scene's `part` changes the harmony (and the melody) from the bar it
  // starts in; each part's progression starts on its own first chord
  const partHarmony = (name) => {
    const P = name != null ? plan.parts[name] : {};
    const key = P.key ?? plan.key, md = P.mode ?? plan.mode;
    return { tonic: 48 + NOTE[key], mode: md, prog: P.progression ?? prog, chordBars: P.chordBars ?? chordBars, sevenths: P.sevenths ?? sevenths };
  };
  const partAt = (t) => sections[secAt(t)]?.part ?? null;

  // chords per bar, voice-led
  const chords = [];
  let prevV = null, curPart, partBar = 0;
  for (let b = 0; b < nBars; b++) {
    const pn = plan.parts ? partAt(offset + b * barLen + barLen * 0.25) : null;
    if (b === 0 || pn !== curPart) { curPart = pn; partBar = b; }
    const H = partHarmony(pn);
    const deg = H.prog[Math.floor((b - partBar) / H.chordBars) % H.prog.length];
    const pcs = chordTones(H.tonic, H.mode, deg, H.sevenths ? 4 : 3);
    const voicing = voiceLead(pcs, 57, 76, prevV);
    prevV = voicing;
    chords.push({ deg, root: degree(H.tonic, H.mode, deg), seventh: degree(H.tonic, H.mode, deg + 6), voicing, tones: pcs, tonic: H.tonic, mode: H.mode, part: pn });
  }
  const harmony = {
    tonic,
    chordAt: (t) => chords[clamp(Math.floor((t - offset) / barLen), 0, chords.length - 1)].voicing,
  };

  // the arranger API layers play through: times are local to the bar
  const mkArr = (b0, gainFor) => {
    const at = (lt) => b0 + lt;
    const ok = (lt) => { const t = at(lt); return t >= 0 && t < endT - 0.02 && !breathAt(t); };
    return {
      beat, barLen,
      pad: (notes, lt, d, o = {}) => notes.forEach((nn, i) => ok(lt) && I.pad(m, m.bed, at(lt), Math.min(d, endT - at(lt)), nn, { ...o, pan: notes.length > 1 ? lerp(-0.35, 0.35, i / (notes.length - 1)) : o.pan ?? 0 })),
      chord: (inst, notes, lt, d, o = {}) => notes.forEach((nn, i) => ok(lt) && I[inst](m, inst === 'sinepad' ? m.bed : m.keys, at(lt) + i * (o.strum ?? 0.008), d, nn, { ...o, pan: notes.length > 1 ? lerp(-0.3, 0.3, i / (notes.length - 1)) : o.pan ?? 0 }, R)),
      keys: (nn, lt, d, o) => ok(lt) && I.keys(m, m.keys, at(lt), d, nn, o),
      pluck: (nn, lt, d, o) => ok(lt) && I.pluck(m, m.keys, at(lt), d, nn, o, R),
      bell: (nn, lt, d, o) => ok(lt) && I.bell(m, m.keys, at(lt), d, nn, o),
      bass: (nn, lt, d, o) => ok(lt) && I.bass(m, m.bed, at(lt), d, nn, o),
      lead: (nn, lt, d, o) => ok(lt) && I.lead(m, m.keys, at(lt), d, nn, o),
      kick: (lt, v) => ok(lt) && D.kick(m, at(lt), { vel: v * gainFor('drums') }),
      snare: (lt, v) => ok(lt) && D.snare(m, at(lt), { vel: v * gainFor('drums') }, R),
      clap: (lt, v) => ok(lt) && D.clap(m, at(lt), { vel: v * gainFor('drums') }, R),
      snap: (lt, v) => ok(lt) && D.noise(m, at(lt), { fc: 2600, q: 1.6, mode: 'bp', decay: 0.03, len: 0.1, vel: v * gainFor('drums'), verb: 0.25, pan: 0.2 }, R),
      rim: (lt, v) => ok(lt) && D.rim(m, at(lt), { vel: v * gainFor('drums') }),
      hat: (lt, v, open) => ok(lt) && D.hat(m, at(lt), { vel: v * gainFor('drums'), open }, R),
      shaker: (lt, v) => ok(lt) && D.shaker(m, at(lt), { vel: v * gainFor('drums') }, R),
      tom: (lt, v, f) => ok(lt) && D.tom(m, at(lt), { vel: v * gainFor('drums'), f }),
    };
  };

  // --- bars -------------------------------------------------------------------
  const report = { bpm, key: `${plan.key} ${mode}`, progression: prog.join('-'), layers: layers.length, lead: plan.lead?.inst ?? null, bars: [], warnings };
  // where each part takes over: "name@bar"
  if (plan.parts) report.parts = chords.filter((c, b) => b < endBar && (b === 0 || c.part !== chords[b - 1].part)).map((c) => `${c.part ?? 'main'}@${chords.indexOf(c) + 1}`);
  // one loop for minutes on end is the most audible problem of a long score
  const loops = Math.min(nBars, endBar) / (prog.length * chordBars);
  if (!plan.parts && !silent && duration > 75 && loops > 8) warnings.push(`${Math.round(duration)} s on one ${prog.length}-chord loop (it repeats ${Math.round(loops)} times): give the chapters their own harmony with music.parts and a \`part\` on each chapter's first scene (docs/music-and-sound.md §2.5)`);
  for (let b = 0; b < (silent ? 0 : Math.min(nBars, endBar)); b++) {
    const b0 = offset + b * barLen;
    if (b0 >= duration) break;
    const si = secAt(b0 + barLen * 0.25);
    let e = energyOf(sections[si], si);
    if (b === 0 && plan.intro !== 'full') e = Math.min(e, 0.3); // let the first bar breathe in
    const arr = mkArr(b0, () => 1);
    for (const { L, P } of layers) if (e >= (L.from ?? 0) && e < (L.to ?? 1.01)) playLayer(arr, L, P, chords[b], e, b);
    report.bars.push(Math.round(e * 100) / 100);
    // section changes: crash on the downbeat + a short fill into it
    const next = sections[si + 1];
    if (next && e >= 0.5 && plan.fills !== false) {
      const nb = Math.round((next.start - offset) / beat); // beat index of the change (transitions are snapped)
      const ct = offset + nb * beat;
      if (ct > b0 && ct <= b0 + barLen + 1e-6) {
        const ne = energyOf(next, si + 1);
        if (ne >= e - 0.05 && ct < endT - 0.05) {
          D.crash(m, ct, { vel: 0.05 + ne * 0.03 }, R);
          for (let k = 0; k < 4; k++) if (!breathAt(ct - beat + k * beat / 4)) D.snare(m, ct - beat + k * beat / 4, { vel: 0.06 + k * 0.03, decay: 0.06, verb: 0.15 }, R);
        }
      }
    }
  }

  // --- melody in the gaps ---------------------------------------------------------
  const L = plan.lead ? { ...plan.lead, opts: Object.fromEntries(Object.entries(plan.lead).filter(([k]) => !['inst', 'range', 'rhythm', 'vel'].includes(k))) } : null;
  if (L && !silent) {
    // each part gets its own two motifs (its own seed and lead options). Without
    // parts the melody keeps the shared random stream (scores sound as before);
    // with parts it gets its own, so a part never changes the melody before it
    const compose = (Lp, rr) => [0, 1].map(() => {
      const rh = RHYTHMS[Lp.rhythm][Math.floor(rr() * RHYTHMS[Lp.rhythm].length)];
      let d = 2 + Math.floor(rr() * 3);
      return rh.map(([b, len], i) => {
        if (i) d += [-2, -1, -1, 1, 1, 2, 0][Math.floor(rr() * 7)];
        d = clamp(d, 0, 9);
        return { b, len, d };
      });
    });
    const leads = new Map([[null, { L, motifs: compose(L, plan.parts ? rng(`${plan.seed ?? 1}:main`) : R) }]]);
    const leadFor = (name) => {
      if (!leads.has(name)) {
        const P = plan.parts[name];
        const Lp = P.lead ? { ...L, ...P.lead, opts: { ...L.opts, ...Object.fromEntries(Object.entries(P.lead).filter(([k]) => !['inst', 'range', 'rhythm', 'vel'].includes(k))) } } : L;
        leads.set(name, { L: Lp, motifs: compose(Lp, rng(`${P.seed ?? plan.seed ?? 1}:${name}`)) });
      }
      return leads.get(name);
    };
    const phrases = Math.ceil(nBars / 2);
    let phPart, ph0 = 0;
    for (let phAbs = 0; phAbs < phrases; phAbs++) {
      const t0 = offset + phAbs * 2 * barLen;
      const pn = chords[clamp(phAbs * 2, 0, chords.length - 1)].part;
      if (phAbs === 0 || pn !== phPart) { phPart = pn; ph0 = phAbs; }
      const ph = phAbs - ph0;
      const { L, motifs } = leadFor(pn);
      const motif = motifs[ph % 4 === 2 ? 1 : 0];
      motif.forEach((nt, i) => {
        const t = t0 + nt.b * beat;
        if (t >= endT - 0.05 || t < barLen * 0.5) return;
        const si = secAt(t);
        if (energyOf(sections[si], si) < 0.3) return;
        // play only where nobody is talking (with a little air on both sides)
        if (voicedAt(t) || voicedAt(t + Math.min(nt.len * beat, 0.6)) || breathAt(t)) return;
        const c = chords[clamp(Math.floor((t - offset) / barLen), 0, chords.length - 1)];
        // strong beats: snap to the nearest chord tone; the 4th phrase varies the last note
        let d = nt.d + (ph % 4 === 3 && i === motif.length - 1 ? 2 : 0);
        let note = degree(c.tonic, c.mode, c.deg + d);
        if (nt.b % 2 === 0) {
          const pcs = c.tones.map((x) => ((x % 12) + 12) % 12);
          for (let k = 0; k < 3 && !pcs.includes(((note % 12) + 12) % 12); k++) note = degree(c.tonic, c.mode, c.deg + (++d));
        }
        while (note < L.range[0]) note += 12;
        while (note > L.range[1]) note -= 12;
        const len = Math.min(nt.len * beat * 0.95, endT - t);
        const args = { ...(L.opts || {}), vel: L.vel, pan: 0.12 };
        if (L.inst === 'pluck') I.pluck(m, m.lead, t, len, note, args, R);
        else I[L.inst](m, m.lead, t, len, note, args);
      });
    }
  }

  // --- ending: tonic chord rings out with the last frame --------------------------
  if (endT < duration && !silent) {
    // the home chord of the part the video ends in
    const H = partHarmony(plan.parts ? partAt(endT) : null), tonic = H.tonic;
    const v = voiceLead(chordTones(H.tonic, H.mode, 0, H.sevenths ? 4 : 3), 57, 76, prevV);
    const ringFor = duration - endT;
    v.forEach((nn, i) => I.pad(m, m.bed, endT, ringFor, nn, { vel: 0.08, attack: 0.05, release: 0.6, cutoff: 1400, pan: lerp(-0.35, 0.35, i / (v.length - 1)) }));
    v.forEach((nn, i) => I.keys(m, m.keys, endT + i * 0.012, ringFor, nn + 12, { vel: 0.08, bright: 0.6, decay: 2.5, pan: lerp(-0.3, 0.3, i / (v.length - 1)) }));
    I.bass(m, m.bed, endT, ringFor, tonic - 12, { vel: 0.26, decay: 3 });
    if (sections.length > 1) { D.kick(m, endT, { vel: 0.4, decay: 0.5 }); D.crash(m, endT, { vel: 0.05, decay: 1.4 }, R); }
  }

  // --- sound effects ------------------------------------------------------------------
  for (const e of plan.sfx || []) {
    const fn = FX[e.type];
    if (!fn) { report.unknownSfx = (report.unknownSfx || []).concat(e.type); continue; }
    if (e.t < -1 || e.t > duration + 1) continue;
    fn(m, e, R, harmony);
  }

  // --- effects, ducking, master ----------------------------------------------------
  // ping-pong delay (dotted eighth), fed by the echo send
  {
    const dl = Math.round(beat * 0.75 * SR), fb = 0.38;
    const bl = new Float32Array(dl), br = new Float32Array(dl);
    const lp = onePole(3500), lp2 = onePole(3500);
    for (let i = 0; i < n; i++) {
      const k = i % dl;
      const yl = bl[k], yr = br[k];
      bl[k] = lp(m.echo[i] + yr * fb);
      br[k] = lp2(yl * fb);
      m.lead.L[i] += yl * 0.6; m.lead.R[i] += yr * 0.6;
      m.verb[i] += (yl + yr) * 0.15;
    }
  }
  // Freeverb-style reverb
  const verb = freeverb(m.verb, n, { room: 0.82, damp: 0.28 });

  // duck envelopes from the voice spans (smooth: 120 ms in, 450 ms out)
  const ctl = 64, nc = Math.ceil(n / ctl);
  const act = new Float32Array(nc);
  {
    let y = 0;
    for (let c = 0; c < nc; c++) {
      const target = voicedAt((c * ctl) / SR) ? 1 : 0;
      const tau = target > y ? 0.12 : 0.45;
      y += (target - y) * (1 - Math.exp(-ctl / SR / tau));
      act[c] = y;
    }
  }
  // how far each layer dips while someone speaks (plan.duck = bed depth in dB)
  const duck = plan.duck ?? -12; // dB
  const depth = { bed: db(duck), keys: db(duck - 2), drums: db(duck + 3), lead: db(duck - 12), sfx: db(-2), verb: db(duck) };
  // two mixes: the full score, and the bed without sound effects (the renderer
  // measures the music/voice balance on the bed, so word-synced ticks don't count)
  const out = { L: new Float32Array(n), R: new Float32Array(n) };
  const bedOut = { L: new Float32Array(n), R: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const a = act[(i / ctl) | 0];
    const g = (d) => 1 - a * (1 - d);
    const l = m.bed.L[i] * g(depth.bed) + m.keys.L[i] * g(depth.keys) + m.drums.L[i] * g(depth.drums) + m.lead.L[i] * g(depth.lead) + verb.L[i] * g(depth.verb);
    const r = m.bed.R[i] * g(depth.bed) + m.keys.R[i] * g(depth.keys) + m.drums.R[i] * g(depth.drums) + m.lead.R[i] * g(depth.lead) + verb.R[i] * g(depth.verb);
    bedOut.L[i] = l; bedOut.R[i] = r;
    out.L[i] = l + m.sfx.L[i] * g(depth.sfx);
    out.R[i] = r + m.sfx.R[i] * g(depth.sfx);
  }
  const endN = Math.min(n, Math.round(duration * SR));
  const finish = (o) => {
    // gentle high-pass (keep the low end tidy under a voice), a little air, then fades
    hp(o.L, 35); hp(o.R, 35);
    shelf(o.L, 4500, db(3)); shelf(o.R, 4500, db(3));
    const fadeIn = Math.round(0.03 * SR), fadeOut = Math.round(0.35 * SR);
    for (let i = 0; i < fadeIn && i < n; i++) { o.L[i] *= i / fadeIn; o.R[i] *= i / fadeIn; }
    for (let i = Math.max(0, endN - fadeOut); i < n; i++) { const k = clamp((endN - i) / fadeOut); o.L[i] *= k * k; o.R[i] *= k * k; }
  };
  finish(out); finish(bedOut);

  // loudness: the bed's music-only passages land `gap` dB under the voice
  // (opts.voiceDb = the measured speech RMS; Edge voices sit near -25 dBFS).
  // Without narration the score *is* the soundtrack and plays at full level.
  // `volume` is applied after this, so it really changes the level.
  const stats = level(bedOut, act, ctl);
  const gap = plan.gap ?? 7; // vs gated speech RMS ≈ 3–4 dB under the voice as `cv check` measures it
  const targetRms = db(opts.targetDb ?? (voice.length ? (opts.voiceDb ?? -25.5) - gap : -18));
  const norm = (stats.rms > 1e-6 ? targetRms / stats.rms : 1) * (plan.volume ?? 1);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out.L[i] = softClip(out.L[i] * norm);
    out.R[i] = softClip(out.R[i] * norm);
    bedOut.L[i] = softClip(bedOut.L[i] * norm);
    bedOut.R[i] = softClip(bedOut.R[i] * norm);
    peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]));
  }
  report.peakDb = +(20 * Math.log10(peak || 1e-9)).toFixed(1);
  report.endChordAt = endT < duration ? +endT.toFixed(3) : null;
  report.voiceDuckDb = duck;
  report.gapDb = voice.length ? -gap : null;
  return { left: out.L, right: out.R, bed: { left: bedOut.L, right: bedOut.R }, sampleRate: SR, duration, report };
}

function level(out, act, ctl) {
  // RMS over the samples where nobody talks (what the music sounds like "alone")
  let s = 0, c = 0, sAll = 0;
  for (let i = 0; i < out.L.length; i++) {
    const v = (out.L[i] * out.L[i] + out.R[i] * out.R[i]) / 2;
    sAll += v;
    if (act[(i / ctl) | 0] < 0.05) { s += v; c++; }
  }
  const rms = c > out.L.length * 0.08 ? Math.sqrt(s / c) : Math.sqrt(sAll / out.L.length) * 1.6;
  return { rms };
}

function softClip(x) {
  const th = 0.85; // transparent below about -1.4 dBFS
  const a = Math.abs(x);
  if (a <= th) return x;
  return Math.sign(x) * (th + (1 - th) * Math.tanh((a - th) / (1 - th)));
}

// first-order high shelf: x + (g - 1) · highpass(x)
function shelf(buf, fc, g) {
  const a = Math.exp(-TAU * fc / SR);
  let z = 0;
  for (let i = 0; i < buf.length; i++) { z = buf[i] * (1 - a) + z * a; buf[i] += (g - 1) * (buf[i] - z); }
}

function hp(buf, fc) {
  const a = Math.exp(-TAU * fc / SR);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) { const x = buf[i]; const y = a * (y1 + x - x1); x1 = x; y1 = y; buf[i] = y; }
}

function freeverb(input, n, { room = 0.8, damp = 0.5, wet = 1 } = {}) {
  const k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225], spread = 23;
  const fb = room * 0.28 + 0.7, d = damp * 0.4;
  const make = (off) => ({
    combs: combT.map((c) => ({ buf: new Float32Array(Math.round((c + off) * k)), i: 0, f: 0 })),
    aps: apT.map((c) => ({ buf: new Float32Array(Math.round((c + off) * k)), i: 0 })),
  });
  const chans = [make(0), make(spread)];
  const out = { L: new Float32Array(n), R: new Float32Array(n) };
  const pre = onePole(8000), preHp = { x1: 0, y1: 0 };
  for (let i = 0; i < n; i++) {
    let x = pre(input[i]) * 0.015;
    const y = 0.995 * (preHp.y1 + x - preHp.x1); preHp.x1 = x; preHp.y1 = y; x = y;
    for (let ch = 0; ch < 2; ch++) {
      const c = chans[ch];
      let s = 0;
      for (const cb of c.combs) {
        const o = cb.buf[cb.i];
        cb.f = o * (1 - d) + cb.f * d;
        cb.buf[cb.i] = x + cb.f * fb;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        s += o;
      }
      for (const ap of c.aps) {
        const b = ap.buf[ap.i];
        ap.buf[ap.i] = s + b * 0.5;
        s = b - s;
        if (++ap.i >= ap.buf.length) ap.i = 0;
      }
      (ch ? out.R : out.L)[i] = s * wet * 3;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// WAV (32-bit float, stereo)
// ---------------------------------------------------------------------------
export function writeWav(file, { left, right, sampleRate = SR }) {
  const n = left.length, bytes = n * 2 * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) { buf.writeFloatLE(left[i], o); buf.writeFloatLE(right[i], o + 4); o += 8; }
  fs.writeFileSync(file, buf);
}

export const sfxTypes = Object.keys(FX);
export const _internals = { I, D, FX, Mixer, rng, SR };
