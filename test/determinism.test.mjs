// Determinism: a frame must be identical no matter what was rendered before it
// or in which page. Renders sample frames of every preset forward and in a
// shuffled order in two separate pages and compares pixel hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { /* skipped below */ }

const compositions = (dir) => (fs.existsSync(path.join(ROOT, dir)) ? fs.readdirSync(path.join(ROOT, dir)) : [])
  .filter((d) => fs.existsSync(path.join(ROOT, dir, d, 'video.html'))).map((d) => `${dir}/${d}`);
const presets = [...compositions('presets'), ...compositions('examples')];

test('frames are pure functions of time', { skip: !chromium && 'playwright not installed', timeout: 180000 }, async (t) => {
  let browser;
  try { browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); }
  catch (e) { t.skip(`chromium unavailable: ${e.message.split('\n')[0]}`); return; }
  try {
    for (const slug of presets) {
      const url = `${pathToFileURL(path.join(ROOT, slug, 'video.html')).href}?render=1&scale=0.25`;
      const open = async () => {
        const p = await browser.newPage();
        await p.goto(url);
        await p.waitForFunction(() => !!window.__CV);
        await p.evaluate(() => window.__CV.ready());
        return p;
      };
      const [a, b] = [await open(), await open()];
      const total = await a.evaluate(() => window.__CV.totalFrames);
      const frames = Array.from({ length: 12 }, (_, i) => Math.floor((i * (total - 1)) / 11));
      const shot = (p, f) => p.evaluate((f) => { window.__CV.drawFrame(f); return window.__CV.capture('image/png'); }, f);
      const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');
      const fwd = {};
      for (const f of frames) fwd[f] = hash(await shot(a, f));
      const shuffled = [...frames].sort((x, y) => ((x * 7919) % 13) - ((y * 7919) % 13));
      for (const f of shuffled) assert.equal(hash(await shot(b, f)), fwd[f], `${slug}: frame ${f} differs between pages/orders`);
      await a.close();
      await b.close();
    }
  } finally {
    await browser.close();
  }
});
