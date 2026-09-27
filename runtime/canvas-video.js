/*!
 * canvas-video runtime — deterministic Canvas motion graphics for video.
 * MIT License. Zero dependencies. Works in any modern browser and in the
 * canvas-video renderer (headless Chromium → ffmpeg).
 *
 * The one rule: every pixel of frame N must be a pure function of time
 * t = N / fps. No Date.now(), no Math.random(), no setTimeout, no state
 * carried between frames. Use CV.rand(seed) and the helpers below.
 */
(function (root) {
  'use strict';

  // ===========================================================================
  // Math & easing
  // ===========================================================================
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, p) => a + (b - a) * p;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const remap = (v, a, b, c, d, ease) => {
    const p = clamp(invLerp(a, b, v));
    return lerp(c, d, ease ? ease(p) : p);
  };

  // Cubic-bezier easing identical to CSS cubic-bezier(x1, y1, x2, y2).
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-6) return sy(t);
        const d = dsx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 30; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-6) break;
        if (v < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }

  const ease = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inOutQuart: (p) => (p < 0.5 ? 8 * p ** 4 : 1 - Math.pow(-2 * p + 2, 4) / 2),
    outQuint: (p) => 1 - Math.pow(1 - p, 5),
    inOutQuint: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
    inExpo: (p) => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)),
    outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo: (p) =>
      p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
    outCirc: (p) => Math.sqrt(1 - Math.pow(p - 1, 2)),
    inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    outBack: (p, s = 1.4) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2),
    // Motion-design vocabulary (named for intent, not math):
    standard: bezier(0.2, 0, 0, 1), // default UI/graphic move: quick start, long settle
    enter: bezier(0.05, 0.7, 0.1, 1), // decelerate into place (things arriving)
    exit: bezier(0.3, 0, 0.8, 0.15), // accelerate away (things leaving)
    swift: bezier(0.55, 0, 0.1, 1), // punchy scene moves, camera pushes
    gentle: bezier(0.45, 0, 0.55, 1), // slow ambient drifts
    bezier,
  };

  // Closed-form damped spring step response from 0 → 1.
  // Pure function of time: spring(t) never depends on previous frames.
  function spring(opts = {}) {
    const k = opts.stiffness ?? 170, c = opts.damping ?? 26, m = opts.mass ?? 1;
    const v0 = -(opts.velocity ?? 0);
    const w0 = Math.sqrt(k / m), zeta = c / (2 * Math.sqrt(k * m));
    return function (t) {
      if (t <= 0) return 0;
      let x;
      if (zeta < 1) {
        const wd = w0 * Math.sqrt(1 - zeta * zeta);
        x = Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0 - v0) / wd) * Math.sin(wd * t));
      } else if (zeta === 1) {
        x = Math.exp(-w0 * t) * (1 + (w0 - v0) * t);
      } else {
        const r = Math.sqrt(zeta * zeta - 1);
        const a = -w0 * (zeta - r), b = -w0 * (zeta + r);
        const A = (v0 - b) / (a - b);
        x = A * Math.exp(a * t) + (1 - A) * Math.exp(b * t);
        return 1 - x;
      }
      return 1 - x;
    };
  }
  spring.presets = {
    smooth: { stiffness: 120, damping: 22 }, // no overshoot, natural settle
    snappy: { stiffness: 300, damping: 30 }, // fast, barely overshoots
    bouncy: { stiffness: 220, damping: 14 }, // visible overshoot — use sparingly
    heavy: { stiffness: 80, damping: 20, mass: 1.6 },
  };

  // Eased 0→1 progress of a window [start, start+dur] at time t.
  function progress(t, start, dur, e = ease.standard) {
    if (dur <= 0) return t >= start ? 1 : 0;
    return e(clamp((t - start) / dur));
  }

  // Keyframes: tween(t, [[0, 0], [1, 100, ease.outCubic], [2, 50]])
  // Each key is [time, value, easeIntoThisKey]. Values may be numbers or arrays.
  function tween(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const p = (e || ease.standard)(clamp(invLerp(t0, t1, t)));
        if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], p));
        return lerp(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  }

  // A value that is re-targeted over time, animated by springs: the sum of one
  // spring per change keeps it a pure function of t.
  // springTrack(t, [[0, 0], [1.2, 300], [2.0, 120]], spring.presets.snappy)
  function springTrack(t, changes, opts) {
    const s = spring(opts);
    let v = changes[0][1];
    for (let i = 1; i < changes.length; i++) {
      const [tc, target] = changes[i];
      const prev = changes[i - 1][1];
      v += (target - prev) * s(t - tc);
    }
    return v;
  }

  const stagger = (i, each, start = 0) => start + i * each;

  // Deterministic PRNG (mulberry32). CV.rand(seed)() → [0,1)
  function rand(seed = 1) {
    let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  // Smooth 1D value noise in [-1, 1], deterministic by seed.
  function noise(x, seed = 0) {
    const h = (n) => {
      const r = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return (r - Math.floor(r)) * 2 - 1;
    };
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(h(i), h(i + 1), u);
  }

  // ===========================================================================
  // Color
  // ===========================================================================
  function parseColor(c) {
    if (Array.isArray(c)) return c.length === 3 ? [...c, 1] : c;
    c = String(c).trim();
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
      const n = parseInt(h.slice(0, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    }
    return [0, 0, 0, 1];
  }
  const color = {
    parse: parseColor,
    rgba: (c, a) => {
      const [r, g, b, a0] = parseColor(c);
      return `rgba(${r | 0},${g | 0},${b | 0},${a ?? a0})`;
    },
    mix: (a, b, p) => {
      const A = parseColor(a), B = parseColor(b);
      return `rgba(${lerp(A[0], B[0], p) | 0},${lerp(A[1], B[1], p) | 0},${lerp(A[2], B[2], p) | 0},${lerp(A[3], B[3], p)})`;
    },
  };

  // ===========================================================================
  // Text: CJK-aware line breaking + per-glyph animation helpers
  // ===========================================================================
  const CJK = /[\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
  // Characters that must not start a line (kinsoku shori) / must not end one.
  const NO_START = '，。、；：？！）》」』】〉〕”’…—～·,.!?;:)]}%‰℃°';
  const NO_END = '（《「『【〈〔“‘([{$¥￥#';
  const isCJK = (ch) => CJK.test(ch);

  // Split text into breakable units: each CJK char is a unit; Latin words,
  // numbers (incl. 3.5%, 2026) and spaces are units. Punctuation attaches to
  // the preceding unit (no-start) or the following unit (no-end).
  function tokenize(text) {
    const units = [];
    let buf = '';
    const flush = () => { if (buf) { units.push(buf); buf = ''; } };
    for (const ch of Array.from(text)) {
      if (ch === '\n') { flush(); units.push('\n'); continue; }
      if (/\s/.test(ch)) { flush(); units.push(' '); continue; }
      if (NO_START.includes(ch)) {
        if (buf) buf += ch;
        else if (units.length && units[units.length - 1] !== ' ' && units[units.length - 1] !== '\n') units[units.length - 1] += ch;
        else buf = ch;
        continue;
      }
      if (isCJK(ch)) {
        const openPending = buf && Array.from(buf).every((c) => NO_END.includes(c));
        if (!openPending) flush();
        buf += ch;
        flush();
        continue;
      }
      if (NO_END.includes(ch)) { flush(); buf = ch; continue; }
      // Latin / digits: extend current run unless it ended in a CJK char
      if (buf && isCJK(Array.from(buf).pop())) flush();
      buf += ch;
    }
    flush();
    return units;
  }

  // Break text into lines that fit maxWidth using ctx's current font.
  function wrap(ctx, text, maxWidth) {
    const units = tokenize(String(text));
    const lines = [];
    let line = '';
    const push = () => { lines.push(line.replace(/\s+$/, '')); line = ''; };
    for (const u of units) {
      if (u === '\n') { push(); continue; }
      if (u === ' ' && !line) continue;
      const test = line + u;
      if (line && ctx.measureText(test).width > maxWidth) {
        // hanging punctuation: allow a lone no-start char to overflow
        if (Array.from(u).every((c) => NO_START.includes(c))) { line = test; continue; }
        push();
        line = u === ' ' ? '' : u;
      } else line = test;
    }
    if (line || !lines.length) push();
    return lines;
  }

  // Largest font size (px) at which `text` fits in maxWidth (single line).
  function fitSize(ctx, text, fontTpl, maxWidth, maxSize = 400, minSize = 8) {
    let lo = minSize, hi = maxSize;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      ctx.font = fontTpl.replace('{size}', mid.toFixed(2));
      if (ctx.measureText(text).width > maxWidth) hi = mid; else lo = mid;
    }
    ctx.font = fontTpl.replace('{size}', lo.toFixed(2));
    return lo;
  }

  // Per-glyph layout for kinetic typography. Returns [{ch, x, y, w, i, line}]
  // positioned for textAlign='left', textBaseline='alphabetic'.
  function glyphs(ctx, text, x, y, opts = {}) {
    const lines = opts.maxWidth ? wrap(ctx, text, opts.maxWidth) : String(text).split('\n');
    const lh = opts.lineHeight ?? parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 40) * 1.2;
    const align = opts.align || 'left';
    const out = [];
    let gi = 0;
    lines.forEach((ln, li) => {
      const lw = ctx.measureText(ln).width;
      let cx = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x;
      const chars = Array.from(ln);
      let acc = '';
      for (const ch of chars) {
        const before = ctx.measureText(acc).width;
        acc += ch;
        const after = ctx.measureText(acc).width;
        out.push({ ch, x: cx + before, y: y + li * lh, w: after - before, i: gi++, line: li });
      }
    });
    out.lines = lines;
    out.lineHeight = lh;
    return out;
  }

  // Words (space-separated) or CJK chars as reveal units with their positions.
  function words(ctx, text, x, y, opts = {}) {
    const g = glyphs(ctx, text, x, y, opts);
    const out = [];
    let cur = null;
    for (const c of g) {
      const breakHere = c.ch === ' ' || isCJK(c.ch) || !cur || cur.line !== c.line || isCJK(cur.text.slice(-1));
      if (c.ch === ' ') { cur = null; continue; }
      if (breakHere && !(cur && NO_START.includes(c.ch))) {
        cur = { text: c.ch, x: c.x, y: c.y, w: c.w, line: c.line, i: out.length };
        out.push(cur);
      } else {
        cur.text += c.ch;
        cur.w = c.x + c.w - cur.x;
      }
    }
    out.lines = g.lines;
    out.lineHeight = g.lineHeight;
    return out;
  }

  const text = { tokenize, wrap, fitSize, glyphs, words, isCJK };

  // ===========================================================================
  // Drawing helpers
  // ===========================================================================
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Stroke a polyline progressively (p in 0..1) — "draw-on" lines.
  function drawOn(ctx, pts, p) {
    if (p <= 0 || pts.length < 2) return;
    let total = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(d);
      total += d;
    }
    let left = total * clamp(p);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const d = seg[i - 1];
      const k = Math.min(1, left / d);
      ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k));
      left -= d;
    }
    ctx.stroke();
  }

  // Hand-drawn wobbly line points between two points (deterministic by seed).
  function sketchLine(x1, y1, x2, y2, opts = {}) {
    const r = rand(opts.seed ?? 7);
    const n = opts.steps ?? Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 24));
    const amp = opts.roughness ?? 2.2;
    const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const off = (r() - 0.5) * 2 * amp * Math.sin(Math.PI * k + 0.2);
      pts.push([lerp(x1, x2, k) + (nx / nl) * off, lerp(y1, y2, k) + (ny / nl) * off]);
    }
    return pts;
  }

  function sketchCircle(cx, cy, rad, opts = {}) {
    const r = rand(opts.seed ?? 11);
    const n = opts.steps ?? 48, amp = opts.roughness ?? 2.5;
    const start = r() * Math.PI * 2, over = opts.overshoot ?? 0.12;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = start + (i / n) * Math.PI * 2 * (1 + over);
      const rr = rad + (r() - 0.5) * amp * 2 + Math.sin(a * 3) * amp * 0.5;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  }

  // Film grain: pre-rendered seeded noise tiles, cycled per frame.
  const grainTiles = [];
  function grain(ctx, frame, amount = 0.06, opts = {}) {
    if (amount <= 0) return;
    const size = 256;
    if (!grainTiles.length) {
      for (let k = 0; k < 8; k++) {
        const c = makeCanvas(size, size);
        const g = c.getContext('2d');
        const img = g.createImageData(size, size);
        const r = rand(1000 + k);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = (r() * 255) | 0;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        grainTiles.push(c);
      }
    }
    const tile = grainTiles[(frame | 0) % grainTiles.length];
    const W = ctx.canvas.__cvW || ctx.canvas.width, H = ctx.canvas.__cvH || ctx.canvas.height;
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.globalCompositeOperation = opts.blend || 'overlay';
    const pat = ctx.createPattern(tile, 'repeat');
    const r = rand(frame + 99);
    ctx.translate(-r() * size, -r() * size);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + size, H + size);
    ctx.restore();
  }

  function vignette(ctx, W, H, amount = 0.45, col = '#000') {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, color.rgba(col, 0));
    g.addColorStop(1, color.rgba(col, amount));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Camera: scale/rotate/translate around the frame centre (or a focus point).
  function camera(ctx, W, H, cam, fn) {
    const zoom = cam.zoom ?? 1, x = cam.x ?? 0, y = cam.y ?? 0, rot = cam.rotate ?? 0;
    const fx = cam.focusX ?? W / 2, fy = cam.focusY ?? H / 2;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-fx - x, -fy - y);
    fn();
    ctx.restore();
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  const draw = { roundRect, drawOn, sketchLine, sketchCircle, grain, vignette, camera };

  // ===========================================================================
  // Motion primitives (fx) — the reusable "moves" of motion design
  // ===========================================================================
  // Masked line reveal: each line rises out of its own clip box, staggered.
  // opts: { lineHeight, stagger=0.08, dur=0.7, ease, align, rise=1 (in line heights), exit: 0..1 }
  function lineReveal(ctx, lines, x, y, t, opts = {}) {
    const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 40);
    const lh = opts.lineHeight ?? size * 1.1;
    const e = opts.ease || ease.enter, dur = opts.dur ?? 0.7, st = opts.stagger ?? 0.08;
    const exit = opts.exit ?? 0;
    ctx.save();
    ctx.textAlign = opts.align || ctx.textAlign;
    lines.forEach((ln, i) => {
      const p = e(clamp((t - i * st) / dur));
      const q = ease.exit(clamp(exit * (1 + st * lines.length) - i * st));
      if (p <= 0) return;
      const w = ctx.measureText(ln).width;
      const align = ctx.textAlign;
      const lx = align === 'center' ? x - w / 2 : align === 'right' || align === 'end' ? x - w : x;
      const ly = y + i * lh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx - size, ly - size * 1.05, w + size * 2, size * 1.35);
      ctx.clip();
      ctx.fillText(ln, x, ly + (1 - p) * lh * (opts.rise ?? 1) - q * lh);
      ctx.restore();
    });
    ctx.restore();
  }

  // Per-character reveal (fade + rise + optional blur), staggered.
  function charReveal(ctx, str, x, y, t, opts = {}) {
    const g = glyphs(ctx, str, x, y, opts);
    const e = opts.ease || ease.enter, dur = opts.dur ?? 0.5, st = opts.stagger ?? 0.035;
    const rise = opts.rise ?? 0.35;
    const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 40);
    ctx.save();
    const align = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const c of g) {
      const p = e(clamp((t - c.i * st) / dur));
      if (p <= 0) continue;
      ctx.globalAlpha = p * (opts.alpha ?? 1);
      if (opts.blur) ctx.filter = `blur(${((1 - p) * opts.blur).toFixed(2)}px)`;
      ctx.fillText(c.ch, c.x, c.y + (1 - p) * size * rise);
    }
    ctx.filter = 'none';
    ctx.textAlign = align;
    ctx.restore();
    return g;
  }

  // Formatted number count-up. countUp(p, 0, 12500, { decimals: 0, sep: ',' })
  function countUp(p, from, to, opts = {}) {
    const v = lerp(from, to, clamp(p));
    const d = opts.decimals ?? 0;
    let s = v.toFixed(d);
    if (opts.sep !== false) {
      const [i, f] = s.split('.');
      s = i.replace(/\B(?=(\d{3})+(?!\d))/g, opts.sep ?? ',') + (f ? '.' + f : '');
    }
    return (opts.prefix ?? '') + s + (opts.suffix ?? '');
  }

  // Typewriter: substring by grapheme, with optional blinking caret.
  function typewriter(str, p, opts = {}) {
    const chars = Array.from(str);
    const n = Math.floor(clamp(p) * chars.length + 1e-6);
    let s = chars.slice(0, n).join('');
    if (opts.caret && (p < 1 || Math.floor((opts.t ?? 0) * 2) % 2 === 0)) s += opts.caret;
    return s;
  }

  // Clip drawing to a rect (mask).
  function mask(ctx, x, y, w, h, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    fn();
    ctx.restore();
  }

  // "On twos/threes": quantize time to animate at a lower rate (hand-made feel).
  const onTwos = (t, fps = 30, n = 2) => Math.floor((t * fps) / n) * (n / fps);

  const fx = { lineReveal, charReveal, countUp, typewriter, mask, onTwos };

  // ===========================================================================
  // Images (preloaded; the renderer waits for them)
  // ===========================================================================
  const imagePromises = [];
  function image(src) {
    const img = new Image();
    img.decoding = 'sync';
    const p = new Promise((res) => {
      img.onload = () => res(img);
      img.onerror = () => { console.warn('[canvas-video] image failed', src); res(img); };
    });
    img.src = src;
    imagePromises.push(p);
    return img;
  }
  // Cover-fit an image into a rect.
  function drawCover(ctx, img, x, y, w, h, focusX = 0.5, focusY = 0.5) {
    if (!img.naturalWidth) return;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.naturalWidth - sw) * focusX, (img.naturalHeight - sh) * focusY, sw, sh, x, y, w, h);
  }

  // ===========================================================================
  // Transitions — composite outgoing buffer A and incoming buffer B.
  // p is eased 0→1. Buffers are canvases at output resolution.
  // ===========================================================================
  const transitions = {
    cut(ctx, A, B, p) { ctx.drawImage(p < 0.5 ? A : B, 0, 0); },
    fade(ctx, A, B, p) {
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      ctx.globalAlpha = 1;
    },
    dip(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      ctx.drawImage(p < 0.5 ? A : B, 0, 0);
      ctx.fillStyle = color.rgba(o.color || '#000', 1 - Math.abs(p * 2 - 1));
      ctx.fillRect(0, 0, W, H);
    },
    push(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const [dx, dy] = dirVec(o.direction || 'left');
      ctx.drawImage(A, -dx * W * p, -dy * H * p);
      ctx.drawImage(B, dx * W * (1 - p), dy * H * (1 - p));
    },
    slide(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const [dx, dy] = dirVec(o.direction || 'left');
      ctx.drawImage(A, -dx * W * p * 0.25, -dy * H * p * 0.25);
      ctx.fillStyle = color.rgba('#000', 0.35 * p);
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(B, dx * W * (1 - p), dy * H * (1 - p));
    },
    wipe(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const ang = ((o.angle ?? 20) * Math.PI) / 180;
      const soft = (o.softness ?? 0) * W;
      ctx.drawImage(A, 0, 0);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(ang);
      const span = Math.hypot(W, H);
      const edge = lerp(-span / 2 - soft, span / 2 + soft, p);
      ctx.beginPath();
      ctx.rect(-span / 2 - soft, -span, edge + span / 2 + soft, span * 2);
      ctx.rotate(-ang);
      ctx.translate(-W / 2, -H / 2);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      ctx.restore();
      if (o.lineColor) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(ang);
        ctx.fillStyle = o.lineColor;
        ctx.fillRect(edge - (o.lineWidth ?? 6) / 2, -span, o.lineWidth ?? 6, span * 2);
        ctx.restore();
      }
    },
    iris(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const cx = (o.x ?? 0.5) * W, cy = (o.y ?? 0.5) * H;
      const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * p;
      ctx.drawImage(A, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.01, R), 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      ctx.restore();
    },
    zoom(ctx, A, B, p) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const sa = 1 + p * 0.25, sb = 0.92 + 0.08 * p;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.translate(W / 2, H / 2); ctx.scale(sa, sa); ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(A, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = p;
      ctx.translate(W / 2, H / 2); ctx.scale(sb, sb); ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(B, 0, 0);
      ctx.restore();
    },
    blur(ctx, A, B, p) {
      const b = Math.sin(p * Math.PI) * 18;
      ctx.filter = `blur(${b.toFixed(2)}px)`;
      ctx.drawImage(A, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
    },
    // Horizontal slice displacement — digital/cyber aesthetics only.
    glitch(ctx, A, B, p, o) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const src = p < 0.5 ? A : B;
      const k = Math.sin(p * Math.PI);
      const r = rand(o.seed ?? 3 + Math.floor(p * 12));
      ctx.drawImage(src, 0, 0);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const y = r() * H, h = (0.01 + r() * 0.06) * H;
        const dx = (r() - 0.5) * W * 0.18 * k;
        ctx.drawImage(src, 0, y, W, h, dx, y, W, h);
      }
      if (o.tint) {
        ctx.fillStyle = color.rgba(o.tint, 0.18 * k);
        ctx.fillRect(0, 0, W, H);
      }
    },
  };
  function dirVec(d) {
    return { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] }[d] || [1, 0];
  }

  // ===========================================================================
  // Narration & subtitles
  // ===========================================================================
  const SENT_END = /[。！？!?…]$|[.](?=["'”’)]?$)/;
  const CLAUSE_END = /[，、；：,;:—]$/;
  const STRIP_PUNCT = /[，。、；：？！,.;:?!…"“”'‘’]/g;

  // Rough speech-length estimate used before TTS exists (preview/storyboard).
  function estimateSpeech(textStr, lang) {
    const s = String(textStr);
    const zh = lang ? lang.startsWith('zh') || lang.startsWith('ja') : CJK.test(s);
    const units = tokenize(s).filter((u) => u.trim());
    const pauses = (s.match(/[，。、；：？！,.;:?!]/g) || []).length;
    const rate = zh ? 4.3 : 2.5; // CJK chars/s, words/s (Edge neural voices at +0%)
    const count = zh ? Array.from(s.replace(STRIP_PUNCT, '').replace(/\s/g, '')).length : units.length;
    const duration = 0.1 + count / rate + pauses * 0.22;
    // Fake word timings, proportional to unit length
    const totalLen = units.reduce((a, u) => a + u.length, 0) || 1;
    let acc = 0.1;
    const wordsOut = units.map((u) => {
      const d = (u.length / totalLen) * (duration - 0.1);
      const w = { text: u.replace(STRIP_PUNCT, ''), start: acc, end: acc + d };
      acc += d;
      return w;
    }).filter((w) => w.text);
    return { duration, words: wordsOut, estimated: true };
  }

  // Map TTS word boundaries back onto the original text so cues keep
  // punctuation and spacing. Returns words with {i0, i1} char indices.
  function alignWords(textStr, wordList) {
    let cursor = 0;
    return wordList.map((w) => {
      const idx = textStr.indexOf(w.text, cursor);
      if (idx >= 0 && idx - cursor < 40) {
        cursor = idx + w.text.length;
        return { ...w, i0: idx, i1: cursor };
      }
      return { ...w, i0: cursor, i1: cursor };
    });
  }

  // Build subtitle cues for one narration segment.
  // opts: { maxChars, minChars, lang, punctuation: 'strip'|'keep', offset }
  function buildCues(textStr, wordList, opts = {}) {
    if (!wordList || !wordList.length) return [];
    const zh = opts.lang ? /^(zh|ja|ko)/.test(opts.lang) : CJK.test(textStr);
    const maxChars = opts.maxChars ?? (zh ? 18 : 42);
    const minChars = opts.minChars ?? (zh ? 6 : 16);
    const strip = (opts.punctuation ?? (zh ? 'strip' : 'keep')) === 'strip';
    const off = opts.offset ?? 0;
    const aligned = alignWords(textStr, wordList);
    const len = (s) => (zh ? Array.from(s.replace(/\s/g, '')).length : s.length);
    const cues = [];
    aligned.forEach((w, k) => {
      // punctuation/space between this word and the next word (or end of text)
      const end = k + 1 < aligned.length ? aligned[k + 1].i0 : textStr.length;
      w.trail = textStr.slice(w.i1, end);
    });
    const spanText = (g) => textStr.slice(g[0].i0, g[g.length - 1].i1 + g[g.length - 1].trail.replace(/\s+$/, '').length);
    const emit = (group) => {
      if (!group.length) return;
      const first = group[0], last = group[group.length - 1];
      const raw = spanText(group).replace(/\s+/g, ' ').trim();
      let display = raw;
      if (strip) {
        display = raw.replace(/[，、；：,;:]/g, ' ').replace(/[。！？!?….;“”"'‘’]/g, (m) => (/[？?！!]/.test(m) ? m : ' '))
          .replace(/\s+/g, ' ').trim();
      }
      cues.push({ start: first.start + off, end: last.end + off, text: display, words: group.map((w) => ({ text: w.text, start: w.start + off, end: w.end + off })) });
    };
    // 1) phrases: break at sentence ends, at clause marks once long enough, and at pauses
    const phrases = [];
    let group = [];
    aligned.forEach((w, k) => {
      const prev = group[group.length - 1];
      if (prev && w.start - prev.end > 0.55) { phrases.push(group); group = []; }
      group.push(w);
      const t = w.trail.trim();
      if (t && SENT_END.test(t)) { phrases.push(group); group = []; }
      else if (t && CLAUSE_END.test(t) && len(spanText(group)) >= minChars) { phrases.push(group); group = []; }
    });
    if (group.length) phrases.push(group);
    // 2) long phrases: split into k balanced chunks at word boundaries (no orphans)
    for (const ph of phrases) {
      const total = len(spanText(ph));
      const k = Math.ceil(total / maxChars);
      if (k <= 1) { emit(ph); continue; }
      const target = total / k;
      let cur = [];
      for (let i = 0; i < ph.length; i++) {
        cur.push(ph[i]);
        const here = len(spanText(cur));
        const nextLen = i + 1 < ph.length ? len(spanText([...cur, ph[i + 1]])) : Infinity;
        // cut when adding the next word would move us further from the target
        if (i + 1 < ph.length && Math.abs(here - target) <= Math.abs(nextLen - target) && here >= target * 0.6) {
          emit(cur);
          cur = [];
        }
      }
      emit(cur);
    }
    // timing polish: small lead-out, min duration, no overlaps
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i], next = cues[i + 1];
      c.end = Math.max(c.end + 0.12, c.start + 0.8);
      if (next && c.end > next.start - 0.02) c.end = next.start - 0.02;
    }
    return cues;
  }

  function subtitleStyleDefaults(W, H) {
    const u = Math.min(W, H) / 1080;
    return {
      font: `600 ${Math.round(46 * u)}px "Noto Sans SC", "PingFang SC", "Helvetica Neue", sans-serif`,
      color: '#ffffff',
      highlight: null, // karaoke colour for spoken words
      box: 'rgba(0,0,0,0.55)',
      stroke: null, strokeWidth: 0,
      y: H > W ? 0.78 : 0.9, // baseline position (fraction of height)
      maxWidth: W * (H > W ? 0.84 : 0.8),
      padX: 22 * u, padY: 12 * u, radius: 10 * u,
      lineHeight: 1.35,
      fadeIn: 0.12,
    };
  }

  function drawSubtitles(ctx, cues, t, style) {
    const cue = cues.find((c) => t >= c.start && t < c.end);
    if (!cue) return;
    const W = ctx.canvas.__cvW, H = ctx.canvas.__cvH;
    const s = Object.assign(subtitleStyleDefaults(W, H), style || {});
    ctx.save();
    ctx.font = s.font;
    ctx.textBaseline = 'alphabetic';
    const lines = wrap(ctx, cue.text, s.maxWidth);
    const size = parseFloat(s.font.match(/(\d+(?:\.\d+)?)px/)[1]);
    const lh = size * s.lineHeight;
    const a = clamp((t - cue.start) / s.fadeIn) * clamp((cue.end - t) / 0.08);
    ctx.globalAlpha = a;
    const baseY = s.y * H - (lines.length - 1) * lh;
    lines.forEach((ln, li) => {
      const w = ctx.measureText(ln).width;
      const x = W / 2 - w / 2, y = baseY + li * lh;
      if (s.box) {
        ctx.fillStyle = s.box;
        roundRect(ctx, x - s.padX, y - size * 0.95 - s.padY / 2, w + s.padX * 2, size * 1.25 + s.padY, s.radius);
        ctx.fill();
      }
      if (s.stroke && s.strokeWidth) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.strokeWidth;
        ctx.strokeText(ln, x, y);
      }
      ctx.fillStyle = s.color;
      ctx.fillText(ln, x, y);
    });
    // karaoke highlight: overpaint spoken portion of single-line cues
    if (s.highlight && lines.length === 1 && cue.words) {
      const bare = (x) => x.replace(/[\s\p{P}]/gu, '');
      // count spoken characters, including partial progress through the current word
      let need = 0;
      for (const w of cue.words) {
        if (t >= w.end) need += bare(w.text).length;
        else if (t >= w.start) need += Math.round(bare(w.text).length * clamp((t - w.start) / Math.max(0.05, w.end - w.start)));
      }
      let prefix = '', got = 0;
      for (const ch of Array.from(lines[0])) {
        if (got >= need) break;
        prefix += ch;
        if (bare(ch)) got++;
      }
      const w = ctx.measureText(lines[0]).width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(W / 2 - w / 2, baseY - size * 1.2, ctx.measureText(prefix).width, size * 1.6);
      ctx.clip();
      ctx.fillStyle = s.highlight;
      ctx.fillText(lines[0], W / 2 - w / 2, baseY);
      ctx.restore();
    }
    ctx.restore();
  }

  // ===========================================================================
  // Video composition
  // ===========================================================================
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const RENDER = params.get('render') === '1' || !!root.__CV_RENDER__;

  function create(config) {
    const W = config.width ?? 1920, H = config.height ?? 1080, fps = config.fps ?? 30;
    const scale = Number(params.get('scale') || config.pixelRatio || 1);
    const narr = config.narration ?? root.CV_NARRATION ?? null;
    const lang = config.lang ?? narr?.lang ?? 'en';
    const burnSubs = params.has('subs') ? params.get('subs') === '1' : config.subtitles?.burn ?? false;
    const bg = config.background ?? '#000';

    // ---- timeline resolution (voice drives duration) -------------------------
    const scenes = config.scenes.map((s, i) => ({ ...s, index: i }));
    let cursor = 0;
    for (const s of scenes) {
      const tr = s.index > 0 ? normTransition(s.transition ?? config.transition) : null;
      const overlap = tr && tr.type !== 'cut' ? tr.duration : 0;
      s._tr = tr;
      s.start = Math.max(0, cursor - overlap);
      const segId = s.narration === false ? null : s.narration ?? s.id;
      let seg = null;
      if (segId && narr?.segments?.[segId]) seg = narr.segments[segId];
      else if (s.say) seg = { text: s.say, ...estimateSpeech(s.say, lang) };
      else if (segId && config.script?.[segId]) seg = { text: config.script[segId], ...estimateSpeech(config.script[segId], lang) };
      s.voice = seg;
      s.voiceDelay = s.voiceDelay ?? config.voiceDelay ?? overlap * 0.5 + 0.25;
      const tail = s.tail ?? config.tail ?? 0.55;
      const need = seg ? s.voiceDelay + seg.duration + tail : 0;
      s.dur = s.duration ?? Math.max(s.minDuration ?? (seg ? 0 : 3), need);
      if (s.maxDuration) s.dur = Math.min(s.dur, s.maxDuration);
      s.end = s.start + s.dur;
      cursor = s.end;
    }
    const duration = config.duration ?? cursor + (config.outro ?? 0);
    const totalFrames = Math.round(duration * fps);

    // ---- subtitle cues (absolute time) ---------------------------------------
    let cues = [];
    const subOpts = Object.assign({ lang }, config.subtitles || {});
    if (H > W && subOpts.maxChars == null) subOpts.maxChars = /^(zh|ja|ko)/.test(lang) ? 12 : 28;
    for (const s of scenes) {
      if (!s.voice || !s.voice.words) continue;
      cues = cues.concat(buildCues(s.voice.text, s.voice.words, { ...subOpts, offset: s.start + s.voiceDelay }));
    }

    // ---- canvas ---------------------------------------------------------------
    const canvas = config.canvas || document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    canvas.__cvW = W;
    canvas.__cvH = H;
    const ctx = canvas.getContext('2d', { alpha: false });
    const bufs = [makeCanvas(canvas.width, canvas.height), makeCanvas(canvas.width, canvas.height)];
    bufs.forEach((b) => { b.__cvW = W; b.__cvH = H; });
    const bctx = bufs.map((b) => b.getContext('2d', { alpha: false }));

    function sceneInfo(s, T, frame) {
      const t = T - s.start;
      const tr = s._tr;
      const enterDur = tr && tr.type !== 'cut' ? tr.duration : 0;
      const next = scenes[s.index + 1];
      const exitDur = next && next._tr && next._tr.type !== 'cut' ? next._tr.duration : 0;
      const info = {
        id: s.id, index: s.index, t, T, dur: s.dur, p: clamp(t / s.dur), frame, fps, W, H,
        u: Math.min(W, H) / 1080, // 1u = 1px at 1080p short side
        enter: enterDur ? clamp(t / enterDur) : 1,
        exit: exitDur ? clamp((t - (s.dur - exitDur)) / exitDur) : 0,
        isRender: RENDER, lang,
        voice: s.voice,
        voiceStart: s.voice ? s.voiceDelay : 0,
        voiceEnd: s.voice ? s.voiceDelay + s.voice.duration : 0,
        scene: s,
      };
      // eased local progress helper: s.at(start, dur, ease)
      info.at = (start, dur, e) => progress(t, start, dur, e);
      // local time when a phrase is spoken (falls back if not found)
      info.when = (phrase, fallback = 0) => {
        if (!s.voice || !s.voice.words) return fallback;
        const ws = s.voice.words;
        const n = (x) => String(x).replace(/[\s\p{P}]/gu, '').toLowerCase();
        const want = n(phrase);
        if (!want) return fallback;
        for (let i = 0; i < ws.length; i++) {
          const wi = n(ws[i].text);
          if (!wi) continue;
          if (wi.includes(want)) return s.voiceDelay + ws[i].start;
          // phrase spans several words starting at word i
          let acc = '';
          for (let j = i; j < ws.length; j++) {
            acc += n(ws[j].text);
            if (acc.startsWith(want)) return s.voiceDelay + ws[i].start;
            if (!want.startsWith(acc)) break;
          }
        }
        return fallback;
      };
      return info;
    }

    function paintScene(c, s, T, frame) {
      c.save();
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.fillStyle = s.background ?? bg;
      c.fillRect(0, 0, W, H);
      s.draw(c, sceneInfo(s, T, frame));
      c.restore();
    }

    function drawAt(T, frame) {
      frame = frame ?? Math.floor(T * fps + 1e-6);
      const active = scenes.filter((s) => T >= s.start && T < s.end);
      if (!active.length) active.push(T < 0 ? scenes[0] : scenes[scenes.length - 1]);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (active.length === 1) {
        const s = active[0];
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = s.background ?? bg;
        ctx.fillRect(0, 0, W, H);
        s.draw(ctx, sceneInfo(s, Math.min(T, s.end - 1e-6), frame));
      } else {
        const [a, b] = active.slice(-2);
        const tr = b._tr;
        paintScene(bctx[0], a, T, frame);
        paintScene(bctx[1], b, T, frame);
        const p = (tr.ease || ease.inOutCubic)(clamp((T - b.start) / tr.duration));
        const fn = typeof tr.type === 'function' ? tr.type : transitions[tr.type] || transitions.fade;
        fn(ctx, bufs[0], bufs[1], p, tr);
      }
      ctx.restore();
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (config.overlay) config.overlay(ctx, { T, frame, fps, W, H, u: Math.min(W, H) / 1080, duration, p: T / duration, scenes, isRender: RENDER });
      if (burnSubs && cues.length) drawSubtitles(ctx, cues, T, config.subtitles?.style);
      ctx.restore();
    }

    // ---- font / asset readiness ----------------------------------------------
    async function ready() {
      if (typeof document === 'undefined' || !document.fonts) return;
      const seen = new Map();
      const proto = CanvasRenderingContext2D.prototype;
      const origFill = proto.fillText, origStroke = proto.strokeText, origMeasure = proto.measureText;
      const rec = function (txt) {
        const k = this.font;
        seen.set(k, (seen.get(k) || '') + String(txt));
      };
      proto.fillText = function (txt, ...r) { rec.call(this, txt); return origFill.call(this, txt, ...r); };
      proto.strokeText = function (txt, ...r) { rec.call(this, txt); return origStroke.call(this, txt, ...r); };
      proto.measureText = function (txt) { rec.call(this, txt); return origMeasure.call(this, txt); };
      const OProto = typeof OffscreenCanvasRenderingContext2D !== 'undefined' ? OffscreenCanvasRenderingContext2D.prototype : null;
      const oFill = OProto && OProto.fillText, oMeasure = OProto && OProto.measureText;
      if (OProto) {
        OProto.fillText = function (txt, ...r) { rec.call(this, txt); return oFill.call(this, txt, ...r); };
        OProto.measureText = function (txt) { rec.call(this, txt); return oMeasure.call(this, txt); };
      }
      for (const f of config.fonts || []) seen.set(f, (seen.get(f) || '') + 'AaBb0123');
      await Promise.all(imagePromises);
      // Warm-up pass: sample the timeline so every font+glyph combo gets requested.
      try {
        const step = Math.max(1, Math.round(fps / 6));
        for (let f = 0; f < totalFrames; f += step) drawAt(f / fps, f);
      } catch (e) { console.error(e); }
      proto.fillText = origFill; proto.strokeText = origStroke; proto.measureText = origMeasure;
      if (OProto) { OProto.fillText = oFill; OProto.measureText = oMeasure; }
      const loads = [];
      for (const [font, txt] of seen) {
        const uniq = Array.from(new Set(Array.from(txt))).join('').slice(0, 4000);
        loads.push(document.fonts.load(font, uniq || 'A').catch(() => []));
      }
      await Promise.all(loads);
      await document.fonts.ready;
      const missing = [];
      for (const [font, txt] of seen) {
        const fam = font.match(/"([^"]+)"/)?.[1];
        if (!fam) continue;
        const faces = Array.from(document.fonts).filter((f) => f.family.replace(/"/g, '') === fam);
        if (faces.length && !faces.some((f) => f.status === 'loaded')) missing.push(fam);
        else if (!faces.length && !document.fonts.check(font, txt.slice(0, 50))) missing.push(fam);
      }
      api.missingFonts = Array.from(new Set(missing));
      if (config.setup) await config.setup();
    }

    const api = {
      W, H, fps, duration, totalFrames, canvas, ctx, scenes, cues, scale, missingFonts: [],
      drawFrame: (f, sub = 0) => drawAt((f + sub) / fps, f),
      drawAt,
      ready,
      info: () => ({
        width: W, height: H, fps, duration, totalFrames, scale, lang,
        pixelWidth: canvas.width, pixelHeight: canvas.height,
        scenes: scenes.map((s) => ({ id: s.id, start: s.start, dur: s.dur, voiceStart: s.voice ? s.start + s.voiceDelay : null, voiceDuration: s.voice?.duration ?? null, estimated: !!s.voice?.estimated })),
        voice: scenes.filter((s) => s.voice && s.voice.file && !s.voice.estimated).map((s) => ({ id: s.id, file: s.voice.file, start: s.start + s.voiceDelay, duration: s.voice.duration })),
        cues: cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
        missingFonts: api.missingFonts,
        music: config.music || null,
      }),
      capture: (type = 'image/png', q) => canvas.toDataURL(type, q),
    };
    root.__CV = api;

    if (!RENDER && typeof document !== 'undefined') mountPlayer(api, config);
    return api;
  }

  function normTransition(tr) {
    if (!tr) return { type: 'cut', duration: 0 };
    if (typeof tr === 'string') return { type: tr, duration: tr === 'cut' ? 0 : 0.6 };
    return { duration: 0.6, ...tr };
  }

  // ===========================================================================
  // Preview player (only when opened in a normal browser)
  // ===========================================================================
  function mountPlayer(api, config) {
    const start = () => {
      const { canvas, fps, duration, scenes } = api;
      document.body.style.cssText = 'margin:0;background:#111;color:#ddd;font:13px/1.4 ui-monospace,Menlo,monospace;display:flex;flex-direction:column;height:100vh;overflow:hidden';
      const stage = document.createElement('div');
      stage.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:12px';
      canvas.style.cssText = 'max-width:100%;max-height:100%;box-shadow:0 10px 40px rgba(0,0,0,.6);background:#000';
      stage.appendChild(canvas);
      const bar = document.createElement('div');
      bar.style.cssText = 'padding:10px 16px 14px;display:flex;gap:12px;align-items:center;background:#1a1a1a';
      bar.innerHTML = `<button id="cvp" style="width:64px">Play</button><div id="cvtrack" style="flex:1;position:relative;height:22px;cursor:pointer"><div style="position:absolute;top:10px;left:0;right:0;height:2px;background:#444"></div><div id="cvhead" style="position:absolute;top:3px;width:2px;height:16px;background:#fff"></div></div><span id="cvtime"></span>`;
      document.body.appendChild(stage);
      document.body.appendChild(bar);
      const track = bar.querySelector('#cvtrack');
      for (const s of scenes) {
        const m = document.createElement('div');
        m.title = s.id;
        m.style.cssText = `position:absolute;top:6px;left:${(s.start / duration) * 100}%;width:1px;height:10px;background:#888`;
        track.appendChild(m);
      }
      const audios = api.info().voice.map((v) => { const a = new Audio(v.file); a.preload = 'auto'; return { ...v, a }; });
      let t = 0, playing = false, last = 0;
      const head = bar.querySelector('#cvhead'), time = bar.querySelector('#cvtime'), btn = bar.querySelector('#cvp');
      const paint = () => {
        api.drawAt(t);
        head.style.left = `${(t / duration) * 100}%`;
        const s = scenes.find((x) => t >= x.start && t < x.end) || scenes[scenes.length - 1];
        time.textContent = `${t.toFixed(2)}s / ${duration.toFixed(2)}s  f${Math.floor(t * fps)}  [${s.id}]`;
      };
      const syncAudio = () => {
        for (const v of audios) {
          const local = t - v.start;
          if (playing && local >= 0 && local < v.duration) {
            if (v.a.paused) { v.a.currentTime = local; v.a.play().catch(() => {}); }
            else if (Math.abs(v.a.currentTime - local) > 0.15) v.a.currentTime = local;
          } else if (!v.a.paused) v.a.pause();
        }
      };
      const loop = (now) => {
        if (playing) {
          t += (now - last) / 1000;
          if (t >= duration) { t = 0; }
          last = now;
          syncAudio();
          paint();
          requestAnimationFrame(loop);
        }
      };
      const toggle = () => {
        playing = !playing;
        btn.textContent = playing ? 'Pause' : 'Play';
        if (playing) { last = performance.now(); requestAnimationFrame(loop); } else syncAudio();
      };
      btn.onclick = toggle;
      const seekTo = (e) => {
        const r = track.getBoundingClientRect();
        t = clamp((e.clientX - r.left) / r.width) * duration;
        audios.forEach((v) => v.a.pause());
        paint();
        syncAudio();
      };
      track.onmousedown = (e) => { seekTo(e); window.onmousemove = seekTo; window.onmouseup = () => (window.onmousemove = null); };
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') { e.preventDefault(); toggle(); }
        if (e.code === 'ArrowRight') { t = Math.min(duration, t + (e.shiftKey ? 1 : 1 / fps)); paint(); }
        if (e.code === 'ArrowLeft') { t = Math.max(0, t - (e.shiftKey ? 1 : 1 / fps)); paint(); }
      });
      const hash = parseFloat(location.hash.slice(1));
      if (!isNaN(hash)) t = hash;
      api.ready().then(paint);
      paint();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  const CV = {
    create, ease, spring, progress, tween, springTrack, stagger, clamp, lerp, invLerp, remap,
    rand, noise, color, text, draw, fx, transitions, image, drawCover,
    subtitles: { build: buildCues, draw: drawSubtitles, estimate: estimateSpeech, align: alignWords },
    RENDER, version: '0.1.0',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV;
  root.CV = CV;
})(typeof window !== 'undefined' ? window : globalThis);
