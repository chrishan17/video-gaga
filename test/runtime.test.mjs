// Unit tests for the pure parts of the runtime (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../runtime/video-gaga.js', import.meta.url), 'utf8');
const sandbox = { console, URLSearchParams };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const CV = sandbox.CV;

// Fake 2D context: every character is 1 unit wide (CJK 2) — enough to test breaking rules.
const fakeCtx = { font: '10px x', measureText: (s) => ({ width: Array.from(s).reduce((a, c) => a + (CV.text.isCJK(c) ? 2 : 1), 0) }) };

test('easing endpoints and monotonic bezier', () => {
  for (const k of ['standard', 'enter', 'exit', 'swift', 'gentle', 'outCubic', 'inOutCubic']) {
    assert.equal(CV.ease[k](0), 0, k);
    assert.ok(Math.abs(CV.ease[k](1) - 1) < 1e-6, k);
  }
  const b = CV.ease.bezier(0.2, 0, 0, 1);
  let prev = -1;
  for (let x = 0; x <= 1.0001; x += 0.01) { const y = b(x); assert.ok(y >= prev - 1e-9); prev = y; }
});

test('spring is a pure step response', () => {
  const s = CV.spring(CV.spring.presets.smooth);
  assert.equal(s(0), 0);
  assert.ok(Math.abs(s(3) - 1) < 1e-3);
  assert.equal(s(0.4), s(0.4));
  const v = CV.springTrack(10, [[0, 0], [1, 100], [2, 50]], CV.spring.presets.snappy);
  assert.ok(Math.abs(v - 50) < 1e-3);
});

test('seeded rand is reproducible', () => {
  const a = CV.rand(42), b = CV.rand(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('CJK wrap obeys kinsoku (no line starts with closing punctuation)', () => {
  const lines = CV.text.wrap(fakeCtx, '画布就是你的摄影棚，每一帧都由代码精确绘制。然后导出成 MP4 视频！', 18);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(!/^[，。、！？）]/.test(l), `bad line start: ${l}`);
  assert.ok(lines.join('').includes('MP4'), 'latin word kept whole');
});

test('zh cues: split at punctuation, strip commas/periods, keep ？', () => {
  const text = '每年多赚 8%，三十年后会怎样？';
  const words = ['每年', '多', '赚', '8%', '三十', '年', '后', '会', '怎样'].map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const cues = CV.subtitles.build(text, words, { lang: 'zh-CN', minChars: 4 });
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '每年多赚 8%');
  assert.equal(cues[1].text, '三十年后会怎样？');
  assert.ok(cues[0].end <= cues[1].start);
});

test('en cues: long sentence splits into balanced chunks, no orphan', () => {
  const text = 'What if your computer could think one step ahead?';
  const ws = text.replace('?', '').split(' ').map((w, i) => ({ text: w, start: i * 0.25, end: i * 0.25 + 0.2 }));
  const cues = CV.subtitles.build(text, ws, { lang: 'en-US', maxChars: 30 });
  assert.equal(cues.length, 2);
  const [a, b] = cues.map((c) => c.text.length);
  assert.ok(Math.abs(a - b) < 12, `unbalanced: ${cues.map((c) => c.text)}`);
  assert.ok(cues[1].text.endsWith('?'));
});

test('speech estimate is plausible', () => {
  const zh = CV.subtitles.estimate('画布就是你的摄影棚。', 'zh-CN');
  assert.ok(zh.duration > 1.5 && zh.duration < 4, String(zh.duration));
  const en = CV.subtitles.estimate('Every frame, drawn by code.', 'en-US');
  assert.ok(en.duration > 1 && en.duration < 3.5, String(en.duration));
});

test('countUp / typewriter formatting', () => {
  assert.equal(CV.fx.countUp(1, 0, 12500), '12,500');
  assert.equal(CV.fx.countUp(0.5, 0, 0.9, { decimals: 1 }), '0.5');
  assert.equal(CV.fx.typewriter('上海见', 2 / 3), '上海');
});

// --- beat grid & pacing (CV.create with a stub canvas, no browser) ------------
function stubCreate(config) {
  const ctx = new Proxy({}, { get: () => () => ({}) });
  class Off { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctx; } }
  const sb = { console, URLSearchParams, OffscreenCanvas: Off };
  sb.globalThis = sb;
  vm.runInNewContext(src, sb);
  return sb.CV.create({ canvas: new Off(1920, 1080), ...config });
}

test('cuts land on the beat grid and the video ends on a beat', () => {
  const beat = 60 / 100;
  const api = stubCreate({
    music: { style: 'explainer', bpm: 100 },
    transition: { type: 'push', duration: 0.6 },
    scenes: [{ id: 'a', duration: 2.3, draw() {} }, { id: 'b', duration: 3.1, draw() {} }, { id: 'c', narration: false, beats: 6, draw() {} }],
  });
  const [a, b, c] = api.scenes;
  for (const s of [b, c]) {
    const mid = s.start + 0.3;
    assert.ok(Math.abs(mid / beat - Math.round(mid / beat)) < 1e-6, `transition midpoint ${mid} not on a beat`);
  }
  assert.ok(Math.abs(c.end - (c.start + 0.3) - 6 * beat) < 1e-6, 'beats: 6 → six beats from the cut');
  assert.ok(Math.abs(api.duration / beat - Math.round(api.duration / beat)) < 1e-6, 'ends on a beat');
  assert.ok(a.end >= 2.3 && Math.abs(a.end - b.start - 0.6) < 1e-6, 'overlap preserved');
});

test('voice starts on an eighth note; sfx resolve phrases, functions and transitions', () => {
  const words = [{ text: 'Hello', start: 0.1, end: 0.4 }, { text: 'world', start: 0.5, end: 0.9 }];
  const api = stubCreate({
    music: { style: 'pop', bpm: 120 },
    narration: { lang: 'en', segments: { a: { text: 'Hello world', duration: 1, words }, b: { text: 'Hello world', duration: 1, words } } },
    scenes: [
      { id: 'a', sfx: [{ at: 'world', type: 'tick' }, { at: (s) => s.onBeat(2), type: 'pop' }], draw() {} },
      { id: 'b', transition: { type: 'whip', duration: 0.4 }, draw() {} },
    ],
  });
  const half = 60 / 120 / 2;
  for (const s of api.scenes) {
    const onset = s.start + s.voiceDelay + 0.1;
    assert.ok(Math.abs(onset / half - Math.round(onset / half)) < 1e-6, `voice onset ${onset} off the grid`);
  }
  const a = api.scenes[0];
  const tick = api.sfx.find((e) => e.type === 'tick'), pop = api.sfx.find((e) => e.type === 'pop');
  assert.ok(Math.abs(tick.t - (a.start + a.voiceDelay + 0.5)) < 1e-6, 'phrase sfx at the word');
  assert.ok(Math.abs(pop.t - 1.0) < 1e-6, 'function sfx at beat 2');
  assert.ok(api.sfx.some((e) => e.type === 'whoosh' && e.transition), 'whip makes a whoosh');
  const info = api.info();
  assert.equal(info.score.style, 'pop');
  assert.equal(info.score.voice.length, 2);
});

test('without music nothing snaps (old compositions keep their timing)', () => {
  const api = stubCreate({ scenes: [{ id: 'a', duration: 2.3, draw() {} }, { id: 'b', duration: 1.7, draw() {} }] });
  assert.equal(api.scenes[1].start, 2.3);
  assert.equal(api.duration, 4);
  assert.equal(api.info().score, null);
});

// --- music synth -----------------------------------------------------------------
test('generated score is deterministic, sized to the video and not clipping', async () => {
  const { renderScore, styles } = await import('../scripts/music.mjs');
  const plan = (style) => ({ style, bpm: styles[style].bpm, seed: 2, duration: 8, sections: [{ start: 0, end: 4, voiced: true }, { start: 4, end: 8, voiced: false }], voice: [{ start: 0.5, end: 3.2 }], sfx: [{ type: 'whoosh', t: 4, dur: 0.6 }, { type: 'hit', t: 6 }] });
  for (const style of Object.keys(styles)) {
    const a = renderScore(plan(style)), b = renderScore(plan(style));
    assert.equal(a.left.length, Math.ceil(8.05 * 48000), style);
    let same = true, peak = 0;
    for (let i = 0; i < a.left.length; i += 97) { if (a.left[i] !== b.left[i] || a.right[i] !== b.right[i]) same = false; peak = Math.max(peak, Math.abs(a.left[i]), Math.abs(a.right[i])); }
    assert.ok(same, `${style} not deterministic`);
    assert.ok(peak > 0.01 && peak <= 1, `${style} peak ${peak}`);
  }
});

test('music options reach the score plan', () => {
  const api = stubCreate({ music: { style: 'ambient', bpm: 80, duck: -15, gap: 5, volume: 1.2, seed: 9 }, scenes: [{ id: 'a', duration: 3, draw() {} }] });
  const sc = api.info().score;
  assert.equal(sc.duck, -15);
  assert.equal(sc.gap, 5);
  assert.equal(sc.volume, 1.2);
  assert.equal(sc.seed, 9);
});

test('scene timing ends at the last spoken word, not the clip end', () => {
  const words = [{ text: 'One', start: 0.1, end: 0.6 }, { text: 'two', start: 1.4, end: 2.2 }];
  assert.ok(Math.abs(CV.subtitles.speechLen({ duration: 3.0, words }) - 2.45) < 1e-9, 'last word + 0.25 s');
  assert.equal(CV.subtitles.speechLen({ duration: 2.3, words }), 2.3, 'never longer than the clip');
  assert.equal(CV.subtitles.speechLen({ duration: 3.0, words, estimated: true }), 3.0, 'estimates keep their length');
  const api = stubCreate({ narration: { lang: 'en', segments: { a: { text: 'One two', duration: 3.0, words } } }, scenes: [{ id: 'a', voiceDelay: 0.5, tail: 0.5, draw() {} }] });
  assert.ok(Math.abs(api.scenes[0].dur - (0.5 + 2.45 + 0.5)) < 1e-9);
});
