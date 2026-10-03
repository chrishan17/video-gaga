#!/usr/bin/env node
// video-gaga CLI — HTML Canvas composition → MP4 (+ Edge TTS narration, subtitles).
//
//   node scripts/cv.mjs render <project|video.html> [options]
//   node scripts/cv.mjs still  <project> [--at 1,2.5] [--sheet]
//   node scripts/cv.mjs moodboard <preview> <preview> … [--wait]
//   node scripts/cv.mjs tts    <project>
//   node scripts/cv.mjs music  <project>
//   node scripts/cv.mjs check  <video.mp4> [--srt file.srt]
//   node scripts/cv.mjs gif    <video.mp4> [--out x.gif] [--width 480] [--fps 12]
//   node scripts/cv.mjs init   <dir> --preset <slug>
//   node scripts/cv.mjs voices [--lang zh-CN]
//
// Run `node scripts/cv.mjs help` for all options.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// tiny arg parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (v !== undefined) out[key] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const log = (...a) => console.log(...a);
const die = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };
const has = (bin) => spawnSync(bin, [bin.startsWith('ff') ? '-version' : '--version'], { stdio: 'ignore' }).status === 0;

function resolveProject(p) {
  if (!p) die('missing <project> argument');
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) die(`not found: ${abs}`);
  if (fs.statSync(abs).isDirectory()) {
    const html = path.join(abs, 'video.html');
    if (!fs.existsSync(html)) die(`no video.html in ${abs}`);
    return { dir: abs, html };
  }
  return { dir: path.dirname(abs), html: abs };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.stdio || ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  if (r.status !== 0) die(`ffprobe failed on ${file}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------
async function tts(dir) {
  if (!fs.existsSync(path.join(dir, 'narration.json'))) return false;
  const script = path.join(ROOT, 'scripts', 'tts.py');
  log('▸ narration (Edge TTS)');
  if (has('uv')) await run('uv', ['run', '--quiet', '--no-project', '--with', 'edge-tts>=7.2', 'python', script, dir]);
  else if (has('python3')) await run('python3', [script, dir]);
  else die('need `uv` or `python3` with edge-tts installed (pip install edge-tts)');
  return true;
}

// ---------------------------------------------------------------------------
// Music: the score is arranged from the resolved timeline (scripts/music.mjs)
// ---------------------------------------------------------------------------
async function synthMusic(dir, score, { quiet } = {}) {
  const { renderScore, writeWav } = await import('./music.mjs');
  const { soundfontPath } = await import('./soundfont.mjs');
  const voiceDb = score.voice.length ? speechLevel(dir) : null;
  const sf = soundfontPath();
  const key = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'scripts', 'music.mjs'))).update(fs.readFileSync(path.join(ROOT, 'scripts', 'soundfont.mjs')))
    .update(fs.readFileSync(path.join(ROOT, 'scripts', 'samples.mjs'))).update(JSON.stringify(score)).update(String(voiceDb)).update(fs.existsSync(sf) ? `${sf}:${fs.statSync(sf).size}` : 'synth').digest('hex').slice(0, 16);
  const file = path.join(dir, 'build', 'music.wav'), bed = path.join(dir, 'build', 'music-bed.wav');
  const meta = path.join(dir, 'build', 'music.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if ([file, bed, meta].every((f) => fs.existsSync(f)) && JSON.parse(fs.readFileSync(meta, 'utf8')).key === key) {
    if (!quiet) log('▸ music (cached)');
    return { file, bed, report: JSON.parse(fs.readFileSync(meta, 'utf8')).report };
  }
  const t0 = Date.now();
  const mix = await renderScore(score, { voiceDb: voiceDb ?? undefined, log: quiet ? () => {} : log });
  writeWav(file, mix);
  writeWav(bed, { left: mix.bed.left, right: mix.bed.right, sampleRate: mix.sampleRate });
  mix.report.voiceDb = voiceDb;
  // a score that fell back to cheaper instruments is not cached: the next render tries again
  const degraded = mix.report.engine !== 'samples' || (mix.report.warnings || []).some((w) => /could not be loaded/.test(w));
  fs.writeFileSync(meta, JSON.stringify({ key: degraded ? null : key, report: mix.report }, null, 1));
  if (!quiet) log(`▸ music: ${mix.report.key} · ${mix.report.bpm} BPM · ${mix.report.layers} layers · ${score.sfx.length} sfx · ${mix.report.engine === 'samples' ? 'sampled instruments' : 'built-in synth'} (${Date.now() - t0} ms)`);
  if (!quiet) for (const w of mix.report.warnings || []) log(`  ⚠ music: ${w}`);
  return { file, bed, report: mix.report };
}

// RMS (dBFS) of the narration while it speaks (frames above a −45 dB gate),
// so the score can sit at a fixed distance under *this* voice.
function speechLevel(dir) {
  const vdir = path.join(dir, 'build', 'voice');
  if (!fs.existsSync(vdir)) return null;
  let sum = 0, count = 0;
  for (const f of fs.readdirSync(vdir).filter((x) => x.endsWith('.mp3')).sort()) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(vdir, f), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    if (r.status !== 0) continue;
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4));
    for (let i = 0; i + 320 <= x.length; i += 320) { // 20 ms frames
      let e = 0;
      for (let j = i; j < i + 320; j++) e += x[j] * x[j];
      if (e / 320 > 3.2e-5) { sum += e; count += 320; }
    }
  }
  return count ? +(10 * Math.log10(sum / count)).toFixed(1) : null;
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
async function launch() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    die('playwright is not installed. Run `npm install` in the video-gaga folder (then `npx playwright install chromium` if needed).');
  }
  const args = ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  try {
    return await chromium.launch({ args });
  } catch (e) {
    try {
      return await chromium.launch({ args, channel: 'chrome' });
    } catch {
      die(`could not launch Chromium: ${e.message.split('\n')[0]}\nRun: npx playwright install chromium`);
    }
  }
}

// A project keeps the runtime `cv init` copied. After the skill is updated that
// copy is stale, and newer options (music.parts, scene.part …) are silently ignored.
const staleWarned = new Set();
function checkRuntime(html) {
  const local = path.join(path.dirname(html), 'video-gaga.js');
  if (staleWarned.has(local) || !fs.existsSync(local) || !/src="video-gaga\.js"/.test(fs.readFileSync(html, 'utf8'))) return;
  staleWarned.add(local);
  if (!fs.readFileSync(local).equals(fs.readFileSync(path.join(ROOT, 'runtime', 'video-gaga.js')))) log(`  ⚠ ${path.relative(process.cwd(), local)} differs from the skill's runtime (copied by an older \`cv init\`?): newer options may be ignored. Update it: cp ${path.relative(process.cwd(), path.join(ROOT, 'runtime', 'video-gaga.js'))} ${path.relative(process.cwd(), local)}`);
}

async function openComposition(browser, html, q) {
  checkRuntime(html);
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `${pathToFileURL(html).href}?${new URLSearchParams(q)}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  const ok = await page.waitForFunction(() => !!window.__CV, null, { timeout: 30000 }).then(() => true, () => false);
  if (!ok) die(`composition did not call CV.create() — page errors:\n  ${errors.join('\n  ') || '(none)'}`);
  await page.evaluate(() => window.__CV.ready());
  const info = await page.evaluate(() => window.__CV.info());
  return { page, info, errors };
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
async function render(opts) {
  const t0 = Date.now();
  const { dir, html } = resolveProject(opts._[1]);
  if (!has('ffmpeg')) die('ffmpeg not found (macOS: brew install ffmpeg)');
  const name = path.basename(dir);
  const out = path.resolve(opts.out || path.join(dir, 'out', `${name}.mp4`));
  fs.mkdirSync(path.dirname(out), { recursive: true });

  if (!opts.noTts) await tts(dir);

  const subsMode = String(opts.subs ?? 'file'); // file | burn | soft | burn+soft | none
  const burn = subsMode.includes('burn');
  const scale = Number(opts.scale || 1);
  const mb = Math.max(1, Number(opts.motionBlur || 1) | 0);
  const shutter = Number(opts.shutter ?? 0.5); // fraction of a frame the shutter is open
  const fmt = opts.format === 'jpeg' ? 'jpeg' : 'png';
  const quality = Number(opts.quality ?? 0.95);

  log('▸ loading composition');
  const browser = await launch();
  const q = { render: '1', scale: String(scale), subs: burn ? '1' : '0' };
  const probe = await openComposition(browser, html, q);
  const info = probe.info;
  if (probe.errors.length) log(`  ⚠ page errors:\n    ${probe.errors.join('\n    ')}`);
  if (info.missingFonts?.length) log(`  ⚠ fonts not loaded (fallback used): ${info.missingFonts.join(', ')}`);
  const est = info.scenes.filter((s) => s.estimated);
  if (est.length) log(`  ⚠ ${est.length} scene(s) use estimated speech timing (no TTS audio): ${est.map((s) => s.id).join(', ')}`);
  await probe.page.close();

  const { fps } = info;
  const from = Math.max(0, Math.round(Number(opts.from || 0) * fps));
  const to = Math.min(info.totalFrames, opts.to ? Math.round(Number(opts.to) * fps) : info.totalFrames);
  const frames = to - from;
  if (frames <= 0) die('nothing to render (check --from/--to)');
  const pw = info.pixelWidth, ph = info.pixelHeight;
  if (pw % 2 || ph % 2) die(`output size must be even for H.264 (got ${pw}x${ph})`);
  log(`  ${info.width}x${info.height} @${fps}fps${scale !== 1 ? ` (x${scale} → ${pw}x${ph})` : ''}, ${(frames / fps).toFixed(2)}s, ${frames} frames, ${info.scenes.length} scenes`);

  const cpu = os.cpus().length;
  const workers = Math.max(1, Math.min(Number(opts.workers || Math.min(6, Math.max(1, Math.floor(cpu / 2)))), Math.ceil(frames / 15)));
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, 'build', '.render-'));
  const crf = String(opts.crf ?? 18);
  const x264preset = String(opts.x264Preset || 'medium');

  log(`▸ rendering with ${workers} worker(s)${mb > 1 ? `, motion blur ${mb} subframes` : ''} [${fmt}]`);
  const chunk = Math.ceil(frames / workers);
  let done = 0;
  const tFrames = Date.now();
  const tick = () => {
    done++;
    const every = process.stdout.isTTY ? 10 : Math.max(1, Math.round(frames / 4));
    if (done % every === 0 || done === frames) {
      const pct = ((done / frames) * 100).toFixed(0);
      const el = (Date.now() - t0) / 1000;
      // long renders: say how long is left (from the frame rate so far)
      const eta = done < frames && done > workers * 5 ? `, ~${Math.ceil(((frames - done) * (Date.now() - tFrames)) / (done * 1000))}s left` : '';
      process.stdout.write(`\r  ${done}/${frames} frames (${pct}%)  ${el.toFixed(1)}s${eta}   `);
    }
  };

  const segFiles = [];
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const a = from + w * chunk, b = Math.min(to, a + chunk);
    if (a >= b) continue;
    const seg = path.join(tmp, `seg-${String(w).padStart(3, '0')}.mp4`);
    segFiles.push(seg);
    jobs.push(renderChunk({ browser, html, q, a, b, fps, mb, shutter, fmt, quality, seg, crf, x264preset, tick }));
  }
  await Promise.all(jobs);
  process.stdout.write('\n');
  await browser.close();

  // concat video segments
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const videoOnly = path.join(tmp, 'video.mp4');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', videoOnly]);

  // subtitles
  const base = out.replace(/\.mp4$/i, '');
  const cues = info.cues.map((c) => ({ ...c, start: c.start - from / fps, end: c.end - from / fps })).filter((c) => c.end > 0 && c.start < frames / fps);
  if (cues.length && subsMode !== 'none') {
    fs.writeFileSync(`${base}.srt`, toSRT(cues));
    fs.writeFileSync(`${base}.vtt`, toVTT(cues));
  }

  // audio mix + mux
  log('▸ muxing');
  const dur = frames / fps;
  const voice = info.voice.map((v) => ({ ...v, start: v.start - from / fps })).filter((v) => v.start + v.duration > 0 && v.start < dur);
  // music: --music <file> (licensed track, side-chain ducked) > music.file in
  // the composition > the generated score (already arranged around the voice)
  let music = null, generated = false;
  if (!opts.noMusic) {
    if (opts.music && opts.music !== true) music = path.resolve(opts.music);
    else if (info.music) music = path.resolve(dir, info.music);
    else if (info.score) { const sm = await synthMusic(dir, info.score); music = sm.file; generated = sm; }
  }
  const args = ['-y', '-loglevel', 'error', '-i', videoOnly];
  let filter = [];
  let idx = 1;
  const voiceLabels = [];
  for (const v of voice) {
    const f = path.resolve(dir, v.file);
    if (!fs.existsSync(f)) { log(`  ⚠ missing voice file ${f}`); continue; }
    const skip = Math.max(0, -v.start);
    args.push('-i', f);
    const delay = Math.round(Math.max(0, v.start) * 1000);
    filter.push(`[${idx}:a]atrim=start=${skip.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}:all=1[v${idx}]`);
    voiceLabels.push(`[v${idx}]`);
    idx++;
  }
  let aout = null;
  if (voiceLabels.length) {
    filter.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0:dropout_transition=0,apad[voice]`);
    aout = '[voice]';
  }
  // remembered to render a voice-only stem for the sync and balance checks
  // (args.slice(3) keeps the video as input 0 so the stream labels still match)
  const voiceStemSpec = voiceLabels.length ? { inputs: args.slice(3), filter: filter.slice() } : null;
  if (music && fs.existsSync(music)) {
    if (generated) {
      // the score already fades, ducks under the voice and ends on the last frame
      args.push('-ss', (from / fps).toFixed(3), '-i', music);
      filter.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${Number(opts.musicVolume ?? 1)}[mus]`);
    } else {
      args.push('-stream_loop', '-1', '-i', music);
      const mv = Number(opts.musicVolume ?? 0.22);
      filter.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${mv},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, dur - 1.5).toFixed(2)}:d=1.5[mus]`);
    }
    idx++;
    if (aout && generated) {
      filter.push(`[voice][mus]amix=inputs=2:normalize=0,apad[mixed]`);
      aout = '[mixed]';
    } else if (aout) {
      filter.push(`[voice]asplit=2[vk][vm]`);
      filter.push(`[mus][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[duck]`);
      filter.push(`[vm][duck]amix=inputs=2:normalize=0,apad[mixed]`);
      aout = '[mixed]';
    } else {
      filter.push(`[mus]apad[mixed]`);
      aout = '[mixed]';
    }
  }
  const soft = subsMode.includes('soft') && cues.length;
  if (soft) args.push('-i', `${base}.srt`);
  if (aout) {
    filter.push(`${aout}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`);
    args.push('-filter_complex', filter.join(';'), '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
  } else args.push('-map', '0:v');
  if (soft) args.push('-map', `${idx}:s`, '-c:s', 'mov_text', '-metadata:s:s:0', `language=${/^zh/.test(info.lang) ? 'chi' : /^ja/.test(info.lang) ? 'jpn' : 'eng'}`);
  args.push('-c:v', 'copy', '-t', dur.toFixed(3), '-movflags', '+faststart', out);
  await run('ffmpeg', args);

  // stems for the checks: speech onsets can't be found under music, and the
  // music/voice balance needs both signals separately
  let stems = null;
  if (voiceStemSpec) {
    const vf = path.join(tmp, 'voice.f32');
    await run('ffmpeg', ['-y', '-loglevel', 'error', ...voiceStemSpec.inputs, '-filter_complex', voiceStemSpec.filter.join(';'), '-map', '[voice]', '-t', dur.toFixed(3), '-ac', '1', '-ar', '48000', '-f', 'f32le', vf]);
    // spans = the spoken part of each line (not the clip's trailing silence), as the score ducks
    stems = { voice: fs.readFileSync(vf), spans: voice.map((v) => [v.start, v.start + (v.speech ?? v.duration)]) };
    if (music && fs.existsSync(music)) {
      const mf = path.join(tmp, 'music.f32');
      const mvol = generated ? Number(opts.musicVolume ?? 1) : Number(opts.musicVolume ?? 0.22);
      // generated: measure the bed without sound effects (word-synced ticks aren't "music")
      await run('ffmpeg', ['-y', '-loglevel', 'error', ...(generated ? ['-ss', (from / fps).toFixed(3)] : ['-stream_loop', '-1']), '-i', generated ? generated.bed : music, '-af', `volume=${mvol}`, '-t', dur.toFixed(3), '-ac', '1', '-ar', '48000', '-f', 'f32le', mf]);
      stems.music = fs.readFileSync(mf);
      stems.ducked = !generated; // a plain track is side-chain ducked in the real mix
    }
    // keep the voice stem next to the build so a later `cv check <mp4>` can measure sync too
    const wav = path.join(dir, 'build', 'voice-stem.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', '48000', '-ac', '1', '-i', vf, wav]);
    stems.voiceWav = wav;
    fs.writeFileSync(path.join(dir, 'build', 'voice-stem.json'), JSON.stringify({ video: path.basename(out), from: from / fps, music: !!music }));
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✔ ${path.relative(process.cwd(), out)}  (${secs}s)`);
  if (cues.length && subsMode !== 'none') log(`  subtitles: ${path.relative(process.cwd(), base)}.srt / .vtt (${cues.length} cues${burn ? ', burned in' : ''}${soft ? ', soft track' : ''})`);
  report(out, cues.length ? `${base}.srt` : null, stems, voice.map((v) => ({ ...v, file: path.resolve(dir, v.file) })));
  if (!opts.keepTemp) fs.rmSync(tmp, { recursive: true, force: true });
}

async function renderChunk({ browser, html, q, a, b, fps, mb, shutter, fmt, quality, seg, crf, x264preset, tick }) {
  const { page } = await openComposition(browser, html, q);
  const rate = fps * mb;
  const vf = [];
  if (mb > 1) vf.push(`tmix=frames=${mb}`, `select='eq(mod(n\\,${mb})\\,${mb - 1})'`, `setpts=N/(${fps}*TB)`);
  vf.push('scale=out_color_matrix=bt709:out_range=tv', 'format=yuv420p');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(rate), '-c:v', fmt === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-vf', vf.join(','),
    '-c:v', 'libx264', '-preset', x264preset, '-crf', crf, '-r', String(fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    seg,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
  for (let f = a; f < b; f++) {
    for (let k = 0; k < mb; k++) {
      // subframe offsets centred on the frame time, spanning `shutter` of a frame
      const sub = mb > 1 ? (k / (mb - 1) - 0.5) * shutter : 0;
      const dataUrl = await page.evaluate(async ([f, sub, type, qv]) => { await window.__CV.renderFrame(f, sub); return window.__CV.capture(type, qv); }, [f, sub, type, quality]);
      const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    tick();
  }
  ff.stdin.end();
  await exited;
  await page.close();
}

// ---------------------------------------------------------------------------
// subtitles
// ---------------------------------------------------------------------------
function ts(t, sep) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}
const toSRT = (cues) => cues.map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n');
const toVTT = (cues) => `WEBVTT\n\n${cues.map((c) => `${ts(c.start, '.')} --> ${ts(c.end, '.')}\n${c.text}\n`).join('\n')}`;

// ---------------------------------------------------------------------------
// check / report
// ---------------------------------------------------------------------------
// Speech onsets (s) in an audio/video file: the ends of silences.
function speechOnsets(file, minSilence) {
  const sd = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-map', '0:a', '-af', `silencedetect=noise=-38dB:d=${minSilence}`, '-f', 'null', '-'], { encoding: 'utf8' });
  const onsets = [0, ...[...sd.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))];
  const firstSilence = sd.stderr.match(/silence_start: ([\d.]+)/);
  if (!firstSilence || Number(firstSilence[1]) > 0.05) return onsets; // audio did not start silent
  return onsets.slice(1);
}

// stems: { voiceWav, music, voice, spans, noSync } from the renderer (speech
// onsets can't be found under music, so they're measured on the voice stem).
// voice: [{id, file, start}] from the renderer. Lets sync be checked for every
// clip, including lines that have no caption cue.
function report(file, srt, stems = null, voice = []) {
  const speechSrc = stems?.voiceWav || file;
  const p = ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const s = p.streams.find((x) => x.codec_type === 'subtitle');
  const dur = Number(p.format.duration);
  // r_frame_rate is the stream's nominal rate; avg_frame_rate drifts (30.001) after concat
  const [n, d] = (v.r_frame_rate || v.avg_frame_rate || '0/1').split('/').map(Number);
  const issues = [];
  log(`  video: ${v.codec_name} ${v.width}x${v.height} ${(n / d).toFixed(3)}fps ${v.pix_fmt}, ${v.nb_frames ?? '?'} frames, ${dur.toFixed(3)}s`);
  if (a) {
    const ad = Number(a.duration || dur);
    log(`  audio: ${a.codec_name} ${a.sample_rate}Hz ${a.channels}ch, ${ad.toFixed(3)}s`);
    if (Math.abs(ad - Number(v.duration || dur)) > 0.1) issues.push(`audio/video duration differ by ${(ad - Number(v.duration)).toFixed(3)}s`);
    const vd = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const mean = vd.stderr.match(/mean_volume: ([-\d.]+) dB/)?.[1], max = vd.stderr.match(/max_volume: ([-\d.]+) dB/)?.[1];
    if (mean) log(`  loudness: mean ${mean} dB, peak ${max} dB`);
    if (mean && Number(mean) < -50) issues.push('audio track is (near) silent');
  } else log('  audio: none');
  if (s) log(`  subtitle track: ${s.codec_name}`);
  if (srt && fs.existsSync(srt)) {
    const body = fs.readFileSync(srt, 'utf8');
    const times = [...body.matchAll(/(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})/g)];
    const toS = (m, o) => Number(m[o]) * 3600 + Number(m[o + 1]) * 60 + Number(m[o + 2]) + Number(m[o + 3]) / 1000;
    let prevEnd = 0, overlaps = 0;
    for (const m of times) { if (toS(m, 1) < prevEnd - 1e-3) overlaps++; prevEnd = toS(m, 5); }
    log(`  srt: ${times.length} cues, first ${times.length ? toS(times[0], 1).toFixed(2) : '-'}s, last ends ${prevEnd.toFixed(2)}s`);
    if (prevEnd > dur + 0.05) issues.push(`last subtitle ends after video (${prevEnd.toFixed(2)}s > ${dur.toFixed(2)}s)`);
    if (overlaps) issues.push(`${overlaps} overlapping subtitle cues`);
    // A/V sync: every cue that follows a pause should start where speech starts.
    if (a && times.length && stems?.noSync) log('  a/v sync: n/a (the track has music; re-run `cv render` to measure on the voice stem)');
    else if (a && times.length) {
      const onsets = speechOnsets(speechSrc, 0.18);
      const offs = [];
      let lastEnd = -1;
      for (const m of times) {
        const st = toS(m, 1);
        if (st - lastEnd > 0.3) {
          const near = onsets.reduce((b, o) => (Math.abs(o - st) < Math.abs(b - st) ? o : b), Infinity);
          if (Number.isFinite(near)) offs.push(st - near);
        }
        lastEnd = toS(m, 5);
      }
      if (offs.length) {
        const abs = offs.map(Math.abs).sort((x, y) => x - y);
        const med = abs[Math.floor(abs.length / 2)], worst = abs[abs.length - 1];
        log(`  a/v sync: ${offs.length} cue onsets vs speech onsets — median ${(med * 1000).toFixed(0)} ms, worst ${(worst * 1000).toFixed(0)} ms`);
        if (worst > 0.3) issues.push(`subtitle/speech onset mismatch up to ${(worst * 1000).toFixed(0)} ms`);
      }
    }
  }
  // music ↔ voice balance (from the stems): the bed should sit well under speech
  if (stems?.music && stems.voice) {
    const v = new Float32Array(stems.voice.buffer, stems.voice.byteOffset, stems.voice.byteLength / 4);
    const m = new Float32Array(stems.music.buffer, stems.music.byteOffset, stems.music.byteLength / 4);
    const inSpan = (i) => stems.spans.some(([a, b]) => i >= a * 48000 && i < b * 48000);
    let vs = 0, ms = 0, mg = 0, nv = 0, ng = 0;
    for (let i = 0; i < Math.min(v.length, m.length); i += 4) {
      if (inSpan(i)) { vs += v[i] * v[i]; ms += m[i] * m[i]; nv++; } else { mg += m[i] * m[i]; ng++; }
    }
    const dB = (x, n) => 10 * Math.log10(x / Math.max(1, n) + 1e-12);
    const under = dB(vs, nv) - dB(ms, nv), gaps = dB(mg, ng) - dB(vs, nv);
    log(`  music: ${under.toFixed(1)} dB under the voice while it speaks${stems.ducked ? ' (before side-chain ducking)' : ''}, ${gaps >= 0 ? '+' : ''}${gaps.toFixed(1)} dB vs the voice in the gaps`);
    if (!stems.ducked && nv && under < 9) issues.push(`music is only ${under.toFixed(1)} dB under the voice (aim for 10–18 dB; lower music.volume or deepen music.duck)`);
    if (!stems.ducked && nv && under > 22) issues.push(`music is ${under.toFixed(1)} dB under the voice — probably inaudible (raise music.volume)`);
  }
  // Voice placement: each clip's own speech onset, shifted to where the timeline
  // put it, should match an onset in the final mix (covers uncaptioned lines).
  const clips = a ? voice.filter((c) => fs.existsSync(c.file) && c.start >= 0 && c.start < dur) : [];
  if (clips.length) {
    const onsets = speechOnsets(speechSrc, 0.1);
    const offs = clips.map((c) => {
      const expect = c.start + (speechOnsets(c.file, 0.05)[0] ?? 0);
      const near = onsets.reduce((b, o) => (Math.abs(o - expect) < Math.abs(b - expect) ? o : b), Infinity);
      return { id: c.id, off: near - expect };
    });
    const abs = offs.map((o) => Math.abs(o.off)).sort((x, y) => x - y);
    const med = abs[Math.floor(abs.length / 2)], worst = offs.reduce((b, o) => (Math.abs(o.off) > Math.abs(b.off) ? o : b));
    log(`  voice sync: ${clips.length} clips vs speech onsets — median ${(med * 1000).toFixed(0)} ms, worst ${(Math.abs(worst.off) * 1000).toFixed(0)} ms (${worst.id})`);
    if (Math.abs(worst.off) > 0.15) issues.push(`voice clip "${worst.id}" starts ${(worst.off * 1000).toFixed(0)} ms off its timeline position`);
  }
  if (issues.length) log(`  ⚠ ${issues.join('\n  ⚠ ')}`);
  else log('  checks: ok');
  return issues;
}

// ---------------------------------------------------------------------------
// still frames / contact sheet (for self-review before a full render)
// ---------------------------------------------------------------------------
async function still(opts) {
  const { dir, html } = resolveProject(opts._[1]);
  if (!opts.noTts && opts.tts) await tts(dir);
  const outDir = path.resolve(opts.out || path.join(dir, 'build', 'stills'));
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^t[\d.]+\.png$|^contact-sheet(-\d+)?\.png$/.test(f)) fs.rmSync(path.join(outDir, f));
  const browser = await launch();
  const { page, info, errors } = await openComposition(browser, html, { render: '1', scale: String(opts.scale || 0.5), subs: opts.subs ? '1' : '0' });
  if (errors.length) log(`⚠ page errors:\n  ${errors.join('\n  ')}`);
  if (info.missingFonts?.length) log(`⚠ fonts not loaded: ${info.missingFonts.join(', ')}`);
  let times;
  if (opts.at) times = String(opts.at).split(',').map(Number);
  else {
    // default: 3 probes per scene (entering, middle, just before exit)
    // --scenes hook,curve or --scenes rule..wonky: probe only those scenes (long videos)
    const pick = opts.scenes ? String(opts.scenes).split(',').flatMap((x) => {
      const [a, b] = x.split('..');
      const ia = info.scenes.findIndex((s) => s.id === a), ib = b ? info.scenes.findIndex((s) => s.id === b) : ia;
      if (ia < 0 || ib < 0) die(`--scenes: no scene "${ia < 0 ? a : b}" (scenes: ${info.scenes.map((s) => s.id).join(', ')})`);
      return info.scenes.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).map((s) => s.id);
    }) : null;
    times = [];
    info.scenes.forEach((s, i) => {
      if (pick && !pick.includes(s.id)) return;
      const next = info.scenes[i + 1];
      const settled = (next && next.start < s.start + s.dur ? next.start : s.start + s.dur) - 0.1;
      times.push(s.start + Math.min(0.5, s.dur * 0.2), s.start + s.dur * 0.5, settled);
    });
  }
  const files = [];
  for (const t of times) {
    const f = Math.min(info.totalFrames - 1, Math.max(0, Math.round(t * info.fps)));
    const url = await page.evaluate(async (f) => { await window.__CV.renderFrame(f); return window.__CV.capture('image/png'); }, f);
    const file = path.join(outDir, `t${(f / info.fps).toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    files.push(file);
  }
  await browser.close();
  log(`✔ ${files.length} stills → ${path.relative(process.cwd(), outDir)}`);
  if (opts.sheet) {
    // a long video makes one sheet too tall to read: split it into pages of
    // `--rows` rows (default 6, i.e. 6 scenes at 3 probes each)
    const cols = Number(opts.cols || 3), perPage = cols * Number(opts.rows || 6);
    const sorted = files.slice().sort();
    const pages = Math.ceil(sorted.length / perPage);
    const tmpList = path.join(outDir, '.sheet.txt');
    for (let k = 0; k < pages; k++) {
      const part = sorted.slice(k * perPage, (k + 1) * perPage);
      const sheet = path.join(outDir, pages > 1 ? `contact-sheet-${k + 1}.png` : 'contact-sheet.png');
      fs.writeFileSync(tmpList, part.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', tmpList, '-vf', `scale=640:-2,tile=${cols}x${Math.ceil(part.length / cols)}:padding=6:color=0x222222`, '-frames:v', '1', sheet]);
      const span = (f) => path.basename(f).slice(1, -4).replace(/^0+(?=\d)/, '');
      log(`  contact sheet → ${path.relative(process.cwd(), sheet)}${pages > 1 ? `  (${span(part[0])}–${span(part[part.length - 1])}s)` : ''}`);
    }
    fs.rmSync(tmpList, { force: true });
  }
  log(`  timeline: ${info.scenes.map((s) => `${s.id} ${s.start.toFixed(2)}–${(s.start + s.dur).toFixed(2)}s`).join(' | ')}`);
}

// ---------------------------------------------------------------------------
// gif preview (for READMEs)
// ---------------------------------------------------------------------------
async function gif(opts) {
  const src = path.resolve(opts._[1] || die('missing <video.mp4>'));
  const out = path.resolve(opts.out || src.replace(/\.mp4$/i, '.gif'));
  const width = Number(opts.width || 480), rate = Number(opts.fps || 12);
  const trim = [];
  if (opts.from) trim.push('-ss', String(opts.from));
  if (opts.dur) trim.push('-t', String(opts.dur));
  const vf = `fps=${rate},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${opts.colors || 128}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...trim, '-i', src, '-vf', vf, '-loop', '0', out]);
  log(`✔ ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

// ---------------------------------------------------------------------------
// init — scaffold a project from a preset's style (not its example video)
// ---------------------------------------------------------------------------
async function init(opts) {
  const dir = path.resolve(opts._[1] || die('missing <dir>'));
  const slug = opts.preset || 'swiss-kinetic';
  const tpl = path.join(ROOT, 'presets', slug, 'video.html');
  if (!fs.existsSync(tpl)) die(`unknown preset "${slug}". Available: ${fs.readdirSync(path.join(ROOT, 'presets')).filter((d) => fs.existsSync(path.join(ROOT, 'presets', d, 'video.html'))).join(', ')}`);
  if (fs.existsSync(path.join(dir, 'video.html')) && !opts.force) die(`${dir}/video.html exists (use --force)`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'runtime', 'video-gaga.js'), path.join(dir, 'video-gaga.js'));
  // (older compositions loaded canvas-video.js)
  const { scaffoldFromPreset } = await import('./scaffold.mjs');
  const { html, kept, dropped } = scaffoldFromPreset(fs.readFileSync(tpl, 'utf8'), { slug });
  let htmlSrc = html.replace(/src="[^"]*(?:video-gaga|canvas-video)\.js"/, 'src="video-gaga.js"');
  htmlSrc = htmlSrc.replace(/<title>[^<]*<\/title>/, `<title>${path.basename(dir)}</title>`);
  if (opts.ratio) {
    const [w, h] = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }[opts.ratio] || die('ratio must be 16:9, 9:16, 1:1 or 4:5');
    htmlSrc = htmlSrc.replace(/width:\s*\d+/, `width: ${w}`).replace(/height:\s*\d+/, `height: ${h}`);
  }
  fs.writeFileSync(path.join(dir, 'video.html'), htmlSrc);
  // the example's narration.json is not copied: the words are written for this brief
  fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\nout/\n');
  log(`✔ scaffolded ${path.relative(process.cwd(), dir) || '.'} from the "${slug}" style`);
  log(`  kept:     ${kept.join(' · ')} · CV.create look (size, fonts, transition, captions, overlay)`);
  log(`  left out: the example's scenes, score and narration${dropped.length ? ` · ${dropped.join(' · ')}` : ''}`);
  log(`  next:     write the scenes, narration.json and the score (music: { … }) for this brief`);
  log(`  preview:  open ${path.join(dir, 'video.html')}`);
  log(`  render:   node ${path.relative(process.cwd(), path.join(ROOT, 'scripts', 'cv.mjs'))} render ${path.relative(process.cwd(), dir) || '.'}`);
}

// ---------------------------------------------------------------------------
// moodboard — the style directions side by side on one page, for the user to pick
// ---------------------------------------------------------------------------
async function moodboard(opts) {
  const dirs = opts._.slice(1).map((p) => resolveProject(p));
  if (dirs.length < 2) die('give two or more preview projects: cv moodboard .cv-previews/style-a .cv-previews/style-b .cv-previews/style-c');
  if (!has('ffmpeg')) die('ffmpeg not found (macOS: brew install ffmpeg)');
  const { themeFromHtml, describeScore, buildMoodboardPage } = await import('./moodboard.mjs');
  const out = path.resolve(opts.out || path.join(path.dirname(dirs[0].dir), 'moodboard.html'));
  const outDir = path.dirname(out);
  fs.mkdirSync(outDir, { recursive: true });
  const clipMax = Number(opts.clip ?? 6);
  const rel = (f) => path.relative(outDir, f).split(path.sep).join('/');
  const directions = [], fontLinks = [];
  let lang = opts.lang ? String(opts.lang) : null;
  const browser = await launch();
  for (const [i, { dir, html }] of dirs.entries()) {
    const letter = String.fromCharCode(65 + i);
    const metaFile = path.join(dir, 'moodboard.json');
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
    const theme = themeFromHtml(fs.readFileSync(html, 'utf8'));
    fontLinks.push(...theme.fontLinks);
    const mb = path.join(dir, 'build', 'moodboard');
    fs.rmSync(mb, { recursive: true, force: true });
    fs.mkdirSync(mb, { recursive: true });

    // three frames (entering, middle, settled) from the preview, at half size
    const { page, info, errors } = await openComposition(browser, html, { render: '1', scale: '0.5', subs: '0' });
    if (errors.length) log(`  ⚠ ${letter} page errors:\n    ${errors.join('\n    ')}`);
    if (info.missingFonts?.length) log(`  ⚠ ${letter} fonts not loaded: ${info.missingFonts.join(', ')}`);
    lang ??= info.lang;
    const len = Math.min(info.duration, clipMax);
    const frames = [];
    for (const [k, t] of [len * 0.2, len * 0.5, Math.max(0, len - 0.1)].entries()) {
      const f = Math.min(info.totalFrames - 1, Math.round(t * info.fps));
      const url = await page.evaluate(async (f) => { await window.__CV.renderFrame(f); return window.__CV.capture('image/jpeg', 0.88); }, f);
      const file = path.join(mb, `frame-${k + 1}.jpg`);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      frames.push(file);
    }
    await page.close();

    // a looping motion sample (with the draft score, if this direction has one)
    let clip = null;
    if (!opts.noClip) {
      const scale = [0.5, 0.4, 0.25].find((s) => Math.round(info.width * s) % 2 === 0 && Math.round(info.height * s) % 2 === 0) || 1;
      const file = path.join(mb, 'clip.mp4');
      log(`▸ ${letter}: motion sample (${len.toFixed(1)}s)`);
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'render', dir, '--out', file, '--to', len.toFixed(2), '--scale', String(scale), '--subs', 'none', '--no-tts', '--format', 'jpeg', '--crf', '23'], { encoding: 'utf8' });
      if (fs.existsSync(file)) clip = file;
      else log(`  ⚠ ${letter}: no motion sample (render failed):\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-4).join('\n')}`);
    }
    const hasSound = !!(clip && ffprobe(clip).streams.some((s) => s.codec_type === 'audio'));

    const palette = (meta.palette || theme.colors).slice(0, 8).map((c) => (typeof c === 'string' ? { hex: c } : { hex: c.hex, name: c.name ?? c.note ?? '' }));
    const type = (meta.type || theme.fonts.map((f) => ({ family: f.family, stack: f.stack, role: f.name }))).slice(0, 4);
    directions.push({
      id: path.basename(dir), letter, name: meta.name || path.basename(dir), pitch: meta.pitch, recommended: !!meta.recommended,
      keywords: meta.keywords, ratio: [info.width, info.height],
      clip: clip && rel(clip), poster: rel(frames[2]), frames: frames.map(rel), hasSound,
      palette, type: type.map((t) => ({ ...t, sample: t.sample ?? meta.title ?? opts.title })),
      motion: meta.motion, music: meta.music || describeScore(info.score),
    });
    log(`  ${letter}  ${directions.at(-1).name}${meta.recommended ? '  (recommended)' : ''}${fs.existsSync(metaFile) ? '' : '  · no moodboard.json: name, pitch, motion and music are missing'}`);
  }
  await browser.close();
  if (directions.filter((d) => d.recommended).length !== 1) log('  ⚠ mark exactly one direction "recommended": true in its moodboard.json');
  const title = opts.title ? String(opts.title) : '';
  // the page speaks the user's language: their title and the directions' names, else the composition's
  if (!opts.lang && !/^(ja|ko)/.test(lang || '') && /[\u3400-\u9fff]/.test([title, ...directions.flatMap((d) => [d.name, d.pitch])].join(''))) lang = 'zh';
  fs.writeFileSync(out, buildMoodboardPage({ title, lang: lang || 'en', directions, fontLinks }));
  log(`✔ moodboard → ${path.relative(process.cwd(), out)}  (${directions.length} directions)`);
  if (opts.wait) return waitForPick(out, dirs.map((d) => d.dir), opts);
  if (opts.open) openInBrowser(pathToFileURL(out).href);
}

function openInBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
}

// Serve the page on localhost and wait for the user's click; prints the pick.
async function waitForPick(out, dirs, opts) {
  const http = await import('node:http');
  const root = [path.dirname(out), ...dirs].reduce((a, b) => { while (!(b + path.sep).startsWith(a + path.sep) && a !== path.dirname(a)) a = path.dirname(a); return a; });
  const types = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const page = '/' + path.relative(root, out).split(path.sep).map(encodeURIComponent).join('/');
  const pickPath = page.replace(/[^/]*$/, 'pick');
  const pickFile = path.join(path.dirname(out), 'pick.json');
  const pick = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === pickPath) {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
        req.on('end', () => {
          let p;
          try { p = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
          res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
          server.close();
          resolve(p);
        });
        return;
      }
      const file = path.join(root, decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
      const size = fs.statSync(file).size, type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      if (range) { // video seeking
        const a = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const b = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 });
        fs.createReadStream(file, { start: a, end: b }).pipe(res);
      } else {
        res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
        fs.createReadStream(file).pipe(res);
      }
    });
    server.listen(Number(opts.port || 0), '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}${page}`;
      log(`▸ waiting for a pick at ${url}`);
      if (!opts.noOpen) openInBrowser(url);
    });
    const secs = Number(opts.timeout ?? 600);
    if (secs > 0) setTimeout(() => { server.close(); resolve(null); }, secs * 1000).unref();
  });
  if (!pick) { log('✖ no pick before the timeout: ask the user in the chat which direction they want'); process.exitCode = 3; return; }
  const dir = dirs.find((d) => path.basename(d) === pick.id);
  fs.writeFileSync(pickFile, JSON.stringify({ ...pick, dir }, null, 1));
  log(`✔ picked ${pick.letter}: ${pick.name}  (${dir ? path.relative(process.cwd(), dir) : pick.id})`);
  if (pick.note) log(`  note: ${pick.note}`);
}

// music — render the score on its own (for previewing in the player, or listening)
async function musicCmd(opts) {
  const { dir, html } = resolveProject(opts._[1]);
  const browser = await launch();
  const { page, info, errors } = await openComposition(browser, html, { render: '1', scale: '0.25', subs: '0' });
  if (errors.length) log(`⚠ page errors:\n  ${errors.join('\n  ')}`);
  await page.close();
  await browser.close();
  if (!info.score) die('this composition has no generated music (design one: music: { bpm, key, mode, progression, layers, lead } in CV.create, see docs/music-and-sound.md)');
  const { file, report } = await synthMusic(dir, info.score);
  log(`✔ ${path.relative(process.cwd(), file)}  ${info.duration.toFixed(2)}s`);
  log(`  ${report.key} · ${report.bpm} BPM · chords ${report.progression} · ${report.layers} layers${report.lead ? ` + ${report.lead} lead` : ''} · bar energy ${report.bars.join(' ')}`);
  if (report.parts) log(`  parts (name@bar): ${report.parts.join(' ')}`);
  if (report.mixDb) log(`  mix (dB of the whole): ${Object.entries(report.mixDb).map(([k, v]) => `${k} ${v}`).join(' · ')} · ${report.engine === 'samples' ? 'sampled instruments' : 'built-in synth (no samples: run cv doctor)'}`);
  log(`  peak ${report.peakDb} dBFS · gaps ${report.gapDb ?? '—'} dB vs the voice (${report.voiceDb ?? '—'} dBFS speech), dips ${report.voiceDuckDb} dB while it speaks · final chord ${report.endChordAt != null ? `at ${report.endChordAt}s` : 'none'}`);
  const L = report.listen;
  if (L) log(`  listen: ${L.ghost ? `${L.ghost.length} ghostly 4-bar window(s)` : 'ghost check needs the samples'} · melody ${L.melodyDb ?? '—'} dB over the rest in 500 Hz–4 kHz (≥ 3) · loudness range ${L.rangeLU ?? '—'} LU · sfx ${L.sfxDb ? `${L.sfxDb.median} dB median over the music (${L.sfxDb.min} … ${L.sfxDb.max})` : '—'}`);
  log(`  sfx: ${info.score.sfx.map((e) => `${e.type}@${e.t.toFixed(2)}`).join(' ') || 'none'}`);
  log(`  cuts on the grid: ${info.scenes.slice(1).map((s) => s.start.toFixed(2)).join(' ')}`);
  if (report.unknownSfx) log(`  ⚠ unknown sfx types: ${report.unknownSfx.join(', ')}`);
}

async function voices(opts) {
  const lang = opts.lang ? String(opts.lang) : null;
  const cmd = has('uv') ? ['uv', ['run', '--quiet', '--no-project', '--with', 'edge-tts', 'edge-tts', '--list-voices']] : ['edge-tts', ['--list-voices']];
  const r = spawnSync(cmd[0], cmd[1], { encoding: 'utf8' });
  if (r.status !== 0) die(r.stderr || 'edge-tts failed');
  const lines = r.stdout.split('\n');
  log(lines.slice(0, 2).join('\n'));
  log(lines.slice(2).filter((l) => !lang || l.startsWith(lang)).join('\n'));
}

async function doctor() {
  let ok = true;
  const row = (good, name, detail) => { log(`  ${good ? '✔' : '✖'} ${name.padEnd(18)} ${detail}`); if (!good) ok = false; };
  const major = Number(process.versions.node.split('.')[0]);
  row(major >= 18, 'node', `v${process.versions.node}${major >= 18 ? '' : ' (need ≥ 18)'}`);
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  row(ff.status === 0 && /libx264/.test(ff.stdout), 'ffmpeg + libx264', ff.status === 0 ? (/libx264/.test(ff.stdout) ? 'ok' : 'ffmpeg found but libx264 missing') : 'not found — brew install ffmpeg / apt install ffmpeg');
  row(has('ffprobe'), 'ffprobe', has('ffprobe') ? 'ok' : 'not found (ships with ffmpeg)');
  let pw = null;
  try { pw = await import('playwright'); row(true, 'playwright', 'ok'); } catch { row(false, 'playwright', `not installed — cd ${ROOT} && npm install`); }
  if (pw) {
    try {
      const b = await pw.chromium.launch({ args: ['--allow-file-access-from-files'] });
      const v = b.version();
      await b.close();
      row(true, 'chromium', `headless ${v}`);
    } catch (e) {
      const msg = e.message.split('\n')[0];
      row(false, 'chromium', /EPERM|operation not permitted|sandbox/i.test(msg)
        ? `blocked by a sandbox: ${msg}\n${' '.repeat(23)}→ run doctor, still, render and tts with browser/filesystem permission`
        : `cannot launch: ${msg}\n${' '.repeat(23)}→ npx playwright install chromium`);
    }
  }
  const uv = has('uv');
  const py = spawnSync('python3', ['-c', 'import edge_tts;print(edge_tts.__version__)'], { encoding: 'utf8' });
  row(uv || py.status === 0, 'edge-tts', uv ? 'via uv (fetched on first use)' : py.status === 0 ? `python edge-tts ${py.stdout.trim()}` : 'install uv (recommended) or pip install edge-tts');
  // the instrument samples for the score (downloaded once, 40 MB)
  const { loadSoundfont, SOUNDFONT } = await import('./soundfont.mjs');
  const sf = await loadSoundfont({ log });
  row(!sf.error, 'instrument samples', sf.error ? `${sf.error}\n${' '.repeat(23)}→ without them the score falls back to a much cheaper synth` : `${path.basename(sf.file)} (${SOUNDFONT.license})`);
  // the multi-sampled piano and strings: fetched per note on first use (not required)
  const { cacheReport } = await import('./samples.mjs');
  const cached = Object.entries(cacheReport()).map(([k, v]) => `${k} ${v.cached}/${v.total}`).join(' · ');
  log(`  ${'·'} ${'recorded piano/strings'.padEnd(18)} ${cached} cached (the rest download the first time a score plays them)`);
  log(ok ? '\nReady to render.' : '\nFix the ✖ items above, then re-run doctor.');
  process.exitCode = ok ? 0 : 1;
}

const HELP = `video-gaga — Canvas motion graphics → MP4

doctor                        check node, ffmpeg, Playwright/Chromium, Edge TTS and the instrument samples

render <project|video.html>   render to MP4 (runs Edge TTS first if narration.json exists)
    --out <file.mp4>          default <project>/out/<name>.mp4
    --subs file|burn|soft|burn+soft|none   default file (.srt + .vtt next to the MP4)
    --music <file>            a licensed music track instead of the generated score (side-chain ducked)
    --music-volume <x>        default 1 for the generated score, 0.22 for a track
    --no-music                render without music and sound effects
    --motion-blur <n>         render n subframes per frame and blend (3–5 is plenty)
    --shutter 0.5             shutter angle as fraction of a frame (with --motion-blur)
    --scale 0.5               draft at half resolution (2 = 4K from a 1080p design)
    --from <s> --to <s>       render a time range only
    --workers <n>             parallel browser pages (default: min(6, cpus/2))
    --format png|jpeg         frame transfer format (png = lossless, jpeg = faster)
    --crf 18 --x264-preset medium
    --no-tts                  skip TTS even if narration.json exists
    --keep-temp
still <project>               export PNG probes (3 per scene) for review
    --at 1.2,3.4  --scenes a,b | a..c  --sheet [--rows 6]  --subs  --scale 0.5  --tts
moodboard <preview> <preview> …   the style directions side by side on one HTML page (motion
                              sample, frames, palette, type, music direction) for the user to pick
    --out <file.html>         default moodboard.html next to the previews
    --title "…"               type specimen text (the user's title)   --clip 6 (seconds)   --no-clip
    --open                    open it in the browser
    --wait                    serve it on localhost, open it, and wait for the click (prints the pick,
                              writes pick.json)  [--timeout 600 --port 0 --no-open]
tts <project>                 synthesize narration.json with Edge TTS (cached)
music <project>               render the generated score to build/music.wav (the preview player plays it)
check <video.mp4> [--srt f]   ffprobe summary + A/V + subtitle sanity checks
                              (render runs it too, adding per-clip voice sync)
gif <video.mp4>               palette GIF preview  [--out --width 480 --fps 12 --from --dur]
init <dir> --preset <slug>    scaffold a project in a preset's style: its THEME and KIT helpers,
                              without the example's scenes, score or narration [--ratio 9:16]
voices [--lang zh-CN]         list Edge TTS voices
`;

const opts = parseArgs(process.argv.slice(2));
const cmd = opts._[0];
// Standalone check: speech onsets can't be found on a track with music, so use
// the voice stem `cv render` leaves in <project>/build when it belongs to this MP4.
function checkCmd(o) {
  const file = path.resolve(o._[1] || die('missing file'));
  let stems = null;
  for (const b of [path.join(path.dirname(file), '..', 'build'), path.join(path.dirname(file), 'build')]) {
    const meta = path.join(b, 'voice-stem.json'), wav = path.join(b, 'voice-stem.wav');
    if (fs.existsSync(meta) && fs.existsSync(wav)) {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (m.video === path.basename(file) && !m.from) stems = { voiceWav: wav };
      else if (m.music) stems = { noSync: true };
      break;
    }
  }
  const issues = report(file, o.srt ? path.resolve(o.srt) : null, stems);
  process.exitCode = issues.length ? 2 : 0;
}

const main = { doctor, render, still, moodboard, music: musicCmd, tts: (o) => tts(resolveProject(o._[1]).dir), check: checkCmd, gif, init, voices }[cmd];
if (!main) { log(HELP); process.exit(cmd && cmd !== 'help' ? 1 : 0); }
Promise.resolve(main(opts)).catch((e) => die(e.stack || e.message));
