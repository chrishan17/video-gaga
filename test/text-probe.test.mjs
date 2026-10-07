// gaga still looks at the text on each probe: cut off by the frame edge, or in
// the caption band. Text still sliding in is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const gaga = path.join(ROOT, 'scripts', 'gaga.mjs');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { /* skipped below */ }

const html = `<!doctype html><html><body><script src="video-gaga.js"></script><script>
CV.create({
  width: 1920, height: 1080, fps: 30, background: '#fff', lang: 'en',
  scenes: [{
    id: 'probe', duration: 4, say: 'A short line so the video has a caption.',
    draw(ctx, s) {
      ctx.fillStyle = '#000';
      ctx.font = '80px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TITLE', 960, 400);
      ctx.fillText('LOW', 960, 972);
      ctx.textAlign = 'left';
      ctx.fillText('EDGE', -60, 600);
      ctx.fillText('SLIDE', -300 + 500 * CV.clamp((s.t - 0.3) / 0.4), 200);
    },
  }],
});
</script></body></html>`;

test('gaga still points at text cut off by the edge or in the caption band', { skip: !chromium && 'playwright not installed', timeout: 120000 }, async (t) => {
  try { const b = await chromium.launch(); await b.close(); } catch (e) { t.skip(`chromium unavailable: ${e.message.split('\n')[0]}`); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaga-text-'));
  try {
    fs.writeFileSync(path.join(dir, 'video.html'), html);
    fs.copyFileSync(path.join(ROOT, 'runtime', 'video-gaga.js'), path.join(dir, 'video-gaga.js'));
    const r = spawnSync(process.execPath, [gaga, 'still', dir, '--at', '0.5,2'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /text: 4 to look at/);
    assert.match(r.stdout, /look: 0\.50s "EDGE" cut off by the frame edge/);
    assert.match(r.stdout, /look: 2\.00s "LOW" in the caption band/);
    assert.doesNotMatch(r.stdout, /"TITLE"|"SLIDE"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
