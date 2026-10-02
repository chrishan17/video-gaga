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

test('zh cues: minChars counts spoken characters, not punctuation', () => {
  const text = '中文、日文、韩文，也能读。';
  const words = ['中文', '日文', '韩文', '也', '能', '读'].map((w, i) => ({ text: w, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const cues = CV.subtitles.build(text, words, { lang: 'zh-CN', minChars: 6 });
  assert.deepEqual(Array.from(cues, (c) => c.text), ['中文 日文 韩文', '也能读']);
});

test('speech end is the last word (+ its decay), not the clip length', () => {
  assert.ok(Math.abs(CV.speech.end({ duration: 2.86, words: [{ text: '读', start: 1.66, end: 1.99 }] }) - 2.24) < 1e-9);
  assert.equal(CV.speech.end({ duration: 1.5, words: [] }), 1.5);
  assert.equal(CV.speech.end({ duration: 1.0, words: [{ text: 'x', start: 0.2, end: 1.3 }] }), 1.0);
});

test('phrase lookup prefers exact words over substrings', () => {
  const ws = ['Press', 'Option', 'S', 'to', 'listen'].map((w, i) => ({ text: w, start: i, end: i + 0.8 }));
  assert.equal(CV.speech.find(ws, 'S'), 2, '"S" must not match inside "Press"');
  assert.equal(CV.speech.find(ws, 'Option S'), 1, 'run of words');
  assert.equal(CV.speech.find(ws, 'opt'), 1, 'substring fallback');
  assert.equal(CV.speech.find(ws, 'nothing'), null);
  const zh = [{ text: '这个', start: 0.1, end: 0.44 }, { text: '词', start: 0.44, end: 0.89 }];
  assert.equal(CV.speech.find(zh, '这个词'), 0.1, 'phrase across CJK words');
});

test('zh cues: a long phrase splits at its clause mark when both halves fit', () => {
  const text = '2023 年，全球最繁忙的机场是哪一座？';
  const words = ['2023', '年', '全球', '最', '繁忙', '的', '机场', '是', '哪一座'].map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const cues = CV.subtitles.build(text, words, { lang: 'zh-CN' });
  assert.deepEqual(Array.from(cues, (c) => c.text), ['2023 年', '全球最繁忙的机场是哪一座？']);
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

// a minimal score spec (the agent designs one per video; there are no preset styles)
const SCORE = { key: 'C', mode: 'major', progression: [0, 5, 3, 4], layers: [{ inst: 'pad', pattern: 'X---', vel: 0.06 }] };

test('cuts land on the beat grid and the video ends on a beat', () => {
  const beat = 60 / 100;
  const api = stubCreate({
    music: { ...SCORE, bpm: 100 },
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
    music: { ...SCORE, bpm: 120 },
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
  assert.equal(info.score.key, 'C');
  assert.deepEqual(info.score.progression, [0, 5, 3, 4]);
  assert.equal(info.score.layers.length, 1);
  assert.equal(info.score.voice.length, 2);
});

test('without music nothing snaps (old compositions keep their timing)', () => {
  const api = stubCreate({ scenes: [{ id: 'a', duration: 2.3, draw() {} }, { id: 'b', duration: 1.7, draw() {} }] });
  assert.equal(api.scenes[1].start, 2.3);
  assert.equal(api.duration, 4);
  assert.equal(api.info().score, null);
});

// --- music synth -----------------------------------------------------------------
// every instrument, note token and pattern feature in one spec
const FULL = {
  bpm: 104, key: 'E', mode: 'dorian', progression: [0, 0, 5, 6], sevenths: true, chordBars: 1, seed: 2,
  layers: [
    { inst: 'pad', notes: 'chord', pattern: 'X---', vel: 0.06, cutoff: [700, 1500] },
    { inst: 'sinepad', notes: 'chord', bars: 2, pattern: 'X-------', vel: 0.05, attack: 1 },
    { inst: 'keys', notes: [0, 1, 2], octave: 1, pattern: '....XXX.', gate: 3, vel: [0.04, 0.08], from: 0.3 },
    { inst: 'pluck', notes: ['root_', 2, 'fifth_', '0^'], pattern: 'XxXx', vel: 0.12, from: 0.2 },
    { inst: 'bell', kind: 'marimba', notes: ['third', 'seventh'], pattern: 'x.x.', vel: 0.08, from: 0.4 },
    { inst: 'bass', synth: true, octave: -1, notes: ['root', 'root^'], pattern: '9898 9898', vel: 0.2, from: 0.3 },
    { inst: 'lead', notes: 'root', octave: 1, pattern: 'X...', vel: 0.05, saw: 0.5, from: 0.6 },
    { inst: 'kick', pattern: 'X...x...X...x...', vel: 0.5, from: 0.5 },
  ],
  lead: { inst: 'bell', kind: 'glock', range: [74, 88], rhythm: 'melodic', vel: 0.1 },
};
const DRUMS = ['snare', 'clap', 'snap', 'rim', 'hat', 'openhat', 'shaker', 'tom'].map((inst) => ({ inst, pattern: '.X.X', vel: 0.08, from: 0.5 }));
const planOf = (spec) => ({ ...spec, duration: 8, sections: [{ start: 0, end: 4, voiced: true, energy: 0.35 }, { start: 4, end: 8, voiced: false, energy: 0.9 }], voice: [{ start: 0.5, end: 3.2 }], sfx: [{ type: 'whoosh', t: 4, dur: 0.6 }, { type: 'hit', t: 6 }] });

test('generated score is deterministic, sized to the video and not clipping', async () => {
  const { renderScore } = await import('../scripts/music.mjs');
  const specs = { full: FULL, drums1: { ...FULL, layers: [FULL.layers[0], ...DRUMS.slice(0, 4)] }, drums2: { ...FULL, layers: [FULL.layers[0], ...DRUMS.slice(4)] }, minimal: { ...SCORE, bpm: 90 }, sfxOnly: { bpm: 100, layers: [] } };
  for (const [name, spec] of Object.entries(specs)) {
    const a = renderScore(planOf(spec)), b = renderScore(planOf(spec));
    assert.equal(a.left.length, Math.ceil(8.05 * 48000), name);
    let same = true, peak = 0;
    for (let i = 0; i < a.left.length; i += 97) { if (a.left[i] !== b.left[i] || a.right[i] !== b.right[i]) same = false; peak = Math.max(peak, Math.abs(a.left[i]), Math.abs(a.right[i])); }
    assert.ok(same, `${name} not deterministic`);
    assert.ok(peak > 0.01 && peak <= 1, `${name} peak ${peak}`);
  }
});

test('the score follows the spec: harmony, layers by energy, seed', async () => {
  const { renderScore } = await import('../scripts/music.mjs');
  // 120 BPM (2 s bars), energy 0.35 for 0–8 s and 0.9 for 8–16 s; a kick `from: 0.6`
  // only plays in the second half (the final chord rings from 14 s)
  const pad = { inst: 'pad', notes: 'chord', pattern: 'X---', vel: 0.06 };
  const two = (layers) => renderScore({ ...FULL, bpm: 120, layers, lead: null, duration: 16, sections: [{ start: 0, end: 8, energy: 0.35 }, { start: 8, end: 16, energy: 0.9 }], voice: [], sfx: [] });
  const lift = (x) => {
    let a = 0, b = 0;
    for (let i = 2 * 48000; i < 13.5 * 48000; i += 7) (i < 8 * 48000 ? (a += x.bed.left[i] ** 2) : (b += x.bed.left[i] ** 2));
    return b / a;
  };
  const padOnly = two([pad]);
  const withKick = two([pad, { inst: 'kick', pattern: 'X.X.', vel: 0.6, from: 0.6 }]);
  assert.ok(lift(withKick) > lift(padOnly) * 2, `the kick enters with the energy (${lift(withKick).toFixed(2)} vs ${lift(padOnly).toFixed(2)})`);
  const unplayed = two([pad, { inst: 'kick', pattern: 'X.X.', vel: 0.6, from: 0.95 }]);
  assert.ok(Math.abs(lift(unplayed) - lift(padOnly)) < 0.05 * lift(padOnly), 'a layer above every scene\'s energy never plays');
  const a = renderScore(planOf({ ...FULL, seed: 1 })), b = renderScore(planOf({ ...FULL, seed: 2 }));
  let diff = 0;
  for (let i = 0; i < a.left.length; i += 97) diff += Math.abs(a.left[i] - b.left[i]);
  assert.ok(diff > 0, 'the seed changes the melody');
  assert.equal(a.report.key, 'E dorian');
  assert.equal(a.report.layers, FULL.layers.length);
});

test('score specs are validated against the limits', async () => {
  const { validateScore, renderScore, LIMITS } = await import('../scripts/music.mjs');
  assert.deepEqual(validateScore({ ...FULL, layers: [...FULL.layers] }).errors, []);
  const errs = (spec) => validateScore(spec).errors.join('\n');
  assert.match(errs({ ...FULL, style: 'explainer' }), /no preset styles/);
  assert.match(errs({ ...FULL, bpm: 200 }), /music\.bpm/);
  assert.match(errs({ ...FULL, key: 'H' }), /music\.key/);
  assert.match(errs({ ...FULL, mode: 'blues' }), /music\.mode/);
  assert.match(errs({ ...FULL, progression: [0, 9] }), /progression\[1\]/);
  assert.match(errs({ ...FULL, progression: [] }), /progression/);
  assert.match(errs({ ...FULL, layers: Array(LIMITS.layers + 1).fill(FULL.layers[0]) }), /at most/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kazoo', pattern: 'X' }] }), /inst must be/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kick', pattern: 'X..?', vel: 0.5 }] }), /pattern has '\?'/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kick', pattern: '-X..', vel: 0.5 }] }), /starts with a hold/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kick', pattern: 'X'.repeat(33), vel: 0.5 }] }), /steps per bar/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kick', pattern: 'X...', vel: 0.9 }] }), /vel must be in \(0, 0\.7\]/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'kick', pattern: 'X...', vel: 0.5, notes: 'root' }] }), /drum and has no notes/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'pad', pattern: 'X---', vel: 0.05, notes: ['ninth'] }] }), /not a note/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'pad', pattern: 'X---', vel: 0.05, bright: 0.5 }] }), /not an option for pad/);
  assert.match(errs({ ...FULL, layers: [{ inst: 'pad', pattern: 'X---', vel: 0.05, cutoff: [100, 99999] }] }), /cutoff/);
  assert.match(errs({ ...FULL, layers: Array(3).fill({ inst: 'hat', pattern: 'X'.repeat(16), vel: 0.05 }) }), /drum hits per bar/);
  assert.match(errs({ ...FULL, lead: { inst: 'pad', range: [60, 80], rhythm: 'sparse', vel: 0.1 } }), /lead\.inst/);
  assert.match(errs({ ...FULL, lead: { inst: 'keys', range: [60, 64], rhythm: 'sparse', vel: 0.1 } }), /lead\.range/);
  assert.match(errs({ ...FULL, tempo: 100 }), /music\.tempo is not a score option/);
  // musical advice is a warning, not an error
  const w = validateScore({ ...FULL, layers: [{ inst: 'kick', pattern: 'X...', vel: 0.5 }, { inst: 'bass', pattern: 'X---', vel: 0.2 }] });
  assert.deepEqual(w.errors, []);
  assert.ok(w.warnings.some((x) => /no harmony/.test(x)) && w.warnings.some((x) => /drums play/.test(x)));
  assert.throws(() => renderScore(planOf({ ...FULL, bpm: 10 })), /music\.bpm/);
});

test('music.style is rejected: the score is designed per video', () => {
  assert.throws(() => stubCreate({ music: { style: 'explainer', bpm: 100 }, scenes: [{ id: 'a', duration: 2, draw() {} }] }), /no preset music styles/);
  assert.throws(() => stubCreate({ music: { ...SCORE }, scenes: [{ id: 'a', duration: 2, draw() {} }] }), /music\.bpm is required/);
  assert.throws(() => stubCreate({ scenes: [] }), /no scenes yet/);
});

test('music options reach the score plan', () => {
  const api = stubCreate({ music: { ...SCORE, bpm: 80, duck: -15, gap: 5, volume: 1.2, seed: 9, chordBars: 2, fills: false }, scenes: [{ id: 'a', duration: 3, draw() {} }] });
  const sc = api.info().score;
  assert.equal(sc.duck, -15);
  assert.equal(sc.gap, 5);
  assert.equal(sc.volume, 1.2);
  assert.equal(sc.seed, 9);
  assert.equal(sc.chordBars, 2);
  assert.equal(sc.fills, false);
  assert.equal(sc.mode, 'major');
});

test('scene timing ends at the last spoken word, not the clip end', () => {
  const words = [{ text: 'One', start: 0.1, end: 0.6 }, { text: 'two', start: 1.4, end: 2.2 }];
  assert.ok(Math.abs(CV.speech.end({ duration: 3.0, words }) - 2.45) < 1e-9, 'last word + 0.25 s');
  assert.equal(CV.speech.end({ duration: 2.3, words }), 2.3, 'never longer than the clip');
  assert.equal(CV.speech.end({ duration: 3.0, words, estimated: true }), 3.0, 'estimates keep their length');
  const api = stubCreate({ narration: { lang: 'en', segments: { a: { text: 'One two', duration: 3.0, words } } }, scenes: [{ id: 'a', voiceDelay: 0.5, tail: 0.5, draw() {} }] });
  assert.ok(Math.abs(api.scenes[0].dur - (0.5 + 2.45 + 0.5)) < 1e-9);
});

test('music parts: a scene part holds until the next one, and a new part starts on a bar', () => {
  const bar = (60 / 100) * 4;
  const api = stubCreate({
    music: { ...SCORE, bpm: 100, parts: { low: { mode: 'minor', progression: [0, 5] }, lift: { progression: [5, 3, 0, 4] } } },
    transition: { type: 'push', duration: 0.6 },
    scenes: [
      { id: 'a', duration: 2.3, draw() {} },
      { id: 'b', part: 'low', duration: 3.1, draw() {} },
      { id: 'c', duration: 1.7, draw() {} },
      { id: 'd', part: 'lift', duration: 2.2, draw() {} },
    ],
  });
  const [, b, c, d] = api.scenes;
  for (const s of [b, d]) {
    const mid = s.start + 0.3;
    assert.ok(Math.abs(mid / bar - Math.round(mid / bar)) < 1e-6, `chapter cut ${mid} not on a bar line`);
  }
  const beat = 60 / 100, cm = c.start + 0.3;
  assert.ok(Math.abs(cm / beat - Math.round(cm / beat)) < 1e-6 && Math.abs(cm / bar - Math.round(cm / bar)) > 1e-6, 'other cuts stay on the beat');
  const sc = api.info().score;
  assert.deepEqual(sc.sections.map((s) => s.part ?? null), [null, 'low', 'low', 'lift']);
  assert.equal(sc.parts.low.mode, 'minor');
  assert.throws(() => stubCreate({ music: { ...SCORE, bpm: 100, parts: {} }, scenes: [{ id: 'a', part: 'nope', duration: 2, draw() {} }] }), /part 'nope' is not defined/);
});

test('music parts change the harmony from their bar, and are validated', async () => {
  const { renderScore, validateScore } = await import('../scripts/music.mjs');
  const bar = (60 / 120) * 4;
  const plan = (parts, secParts) => ({ ...FULL, bpm: 120, lead: { inst: 'bell', range: [72, 86], rhythm: 'melodic', vel: 0.1 }, ...(parts ? { parts } : {}), duration: 8 * bar,
    sections: [{ start: 0, end: 4 * bar, energy: 0.5, part: secParts[0] }, { start: 4 * bar, end: 8 * bar, energy: 0.5, part: secParts[1] }], voice: [], sfx: [] });
  const parts = { b: { key: 'A', mode: 'minor', progression: [5], seed: 3, lead: { rhythm: 'sparse' } } };
  const same = renderScore(plan(parts, [undefined, undefined])), moved = renderScore(plan(parts, [undefined, 'b']));
  assert.deepEqual(moved.report.parts, ['main@1', 'b@5']);
  // the mix is levelled as a whole, so compare after matching the gain
  const misfit = (a0, a1) => {
    let ab = 0, bb = 0, d = 0, n = 0;
    for (let i = a0; i < a1; i += 13) { ab += same.left[i] * moved.left[i]; bb += moved.left[i] ** 2; }
    const k = ab / bb;
    for (let i = a0; i < a1; i += 13) { d += Math.abs(same.left[i] - k * moved.left[i]); n += Math.abs(same.left[i]); }
    return d / n;
  };
  assert.ok(misfit(0, 3.5 * bar * 48000) < 0.01, 'bars before the part are unchanged');
  assert.ok(misfit(5 * bar * 48000, 7 * bar * 48000) > 0.3, 'the part changes what plays');
  const errs = (p, secParts = [undefined, 'b']) => validateScore(plan(p, secParts)).errors.join('\n');
  assert.equal(errs(parts), '');
  assert.match(errs({ b: { layers: [] } }), /parts\.b\.layers is not a part option/);
  assert.match(errs({ b: { progression: [9] } }), /parts\.b\.progression\[0\]/);
  assert.match(errs({ b: { lead: { rhythm: 'waltz' } } }), /parts\.b\.lead\.rhythm/);
  assert.match(errs({ c: {} }), /part 'b' is not in music\.parts/);
  // one loop for minutes on end gets a warning
  const long = renderScore({ ...SCORE, bpm: 120, duration: 90, sections: [{ start: 0, end: 90, energy: 0.5 }], voice: [], sfx: [] });
  assert.ok(long.report.warnings.some((w) => /music\.parts/.test(w)));
});
