// Unit tests for the pure parts of the runtime (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../runtime/canvas-video.js', import.meta.url), 'utf8');
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
