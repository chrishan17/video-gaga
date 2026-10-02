// cv init scaffolds a preset's style, never its example video.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scaffoldFromPreset, danglingNames } from '../scripts/scaffold.mjs';

const root = new URL('../presets/', import.meta.url);
const presets = fs.readdirSync(root).filter((d) => fs.existsSync(new URL(`${d}/video.html`, root)));

test('every preset scaffolds to its style only', () => {
  assert.ok(presets.length >= 10);
  for (const slug of presets) {
    const src = fs.readFileSync(new URL(`${slug}/video.html`, root), 'utf8');
    const { html, kept, dropped } = scaffoldFromPreset(src, { slug });
    assert.ok(kept.some((k) => /^THEME/.test(k)), `${slug}: THEME kept`);
    assert.ok(kept.every((k) => /^(THEME|KIT)\b/.test(k)), `${slug}: only THEME and KIT sections kept`);
    assert.ok(dropped.every((k) => !/^(THEME|KIT)\b/.test(k)), slug);
    // no example scenes, no example score, no inline example blocks
    const scenes = html.match(/^ {2}scenes: \[\n([\s\S]*?)^ {2}\],/m);
    assert.ok(scenes, `${slug}: has a scenes array`);
    assert.ok(scenes[1].split('\n').every((l) => !l.trim() || l.trim().startsWith('//')), `${slug}: scenes array is empty`);
    assert.doesNotMatch(html, /^ {2}music:/m, `${slug}: no music property`);
    assert.doesNotMatch(html, /<example>|=== EXAMPLE/, `${slug}: no example code`);
    assert.match(html, /CV\.create\(\{/);
    assert.deepEqual(danglingNames(src), [], `${slug}: kept code uses names from dropped sections`);
  }
});

test('presets declare their own score instead of a style', () => {
  for (const slug of presets) {
    const src = fs.readFileSync(new URL(`${slug}/video.html`, root), 'utf8');
    assert.doesNotMatch(src, /music: \{ style:/, slug);
    assert.match(src, /^ {2}music: \{\n {4}bpm: \d+/m, slug);
  }
});
