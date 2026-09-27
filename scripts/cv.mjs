#!/usr/bin/env node
// canvas-video CLI — HTML Canvas composition → MP4 (+ Edge TTS narration, subtitles).
//
//   node scripts/cv.mjs render <project|video.html> [options]
//   node scripts/cv.mjs still  <project> [--at 1,2.5] [--sheet]
//   node scripts/cv.mjs tts    <project>
//   node scripts/cv.mjs check  <video.mp4> [--srt file.srt]
//   node scripts/cv.mjs gif    <video.mp4> [--out x.gif] [--width 480] [--fps 12]
//   node scripts/cv.mjs init   <dir> --preset <slug>
//   node scripts/cv.mjs voices [--lang zh-CN]
//
// Run `node scripts/cv.mjs help` for all options.

import { spawn, spawnSync } from 'node:child_process';
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
// Browser
// ---------------------------------------------------------------------------
async function launch() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    die('playwright is not installed. Run `npm install` in the canvas-video folder (then `npx playwright install chromium` if needed).');
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

async function openComposition(browser, html, q) {
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
  const tick = () => {
    done++;
    if (done % 10 === 0 || done === frames) {
      const pct = ((done / frames) * 100).toFixed(0);
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  ${done}/${frames} frames (${pct}%)  ${el.toFixed(1)}s   `);
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
  const music = opts.music ? path.resolve(opts.music) : info.music ? path.resolve(dir, info.music) : null;
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
  if (music && fs.existsSync(music)) {
    args.push('-stream_loop', '-1', '-i', music);
    const mv = Number(opts.musicVolume ?? 0.22);
    filter.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${mv},afade=t=in:d=0.8,afade=t=out:st=${Math.max(0, dur - 1.5).toFixed(2)}:d=1.5[mus]`);
    idx++;
    if (aout) {
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

  if (!opts.keepTemp) fs.rmSync(tmp, { recursive: true, force: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✔ ${path.relative(process.cwd(), out)}  (${secs}s)`);
  if (cues.length && subsMode !== 'none') log(`  subtitles: ${path.relative(process.cwd(), base)}.srt / .vtt (${cues.length} cues${burn ? ', burned in' : ''}${soft ? ', soft track' : ''})`);
  report(out, cues.length ? `${base}.srt` : null);
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
      const dataUrl = await page.evaluate(([f, sub, type, qv]) => { window.__CV.drawFrame(f, sub); return window.__CV.capture(type, qv); }, [f, sub, type, quality]);
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
function report(file, srt) {
  const p = ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const s = p.streams.find((x) => x.codec_type === 'subtitle');
  const dur = Number(p.format.duration);
  const [n, d] = (v.avg_frame_rate || '0/1').split('/').map(Number);
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
  const browser = await launch();
  const { page, info, errors } = await openComposition(browser, html, { render: '1', scale: String(opts.scale || 0.5), subs: opts.subs ? '1' : '0' });
  if (errors.length) log(`⚠ page errors:\n  ${errors.join('\n  ')}`);
  if (info.missingFonts?.length) log(`⚠ fonts not loaded: ${info.missingFonts.join(', ')}`);
  let times;
  if (opts.at) times = String(opts.at).split(',').map(Number);
  else {
    // default: 3 probes per scene (entering, middle, just before exit)
    times = [];
    for (const s of info.scenes) times.push(s.start + Math.min(0.5, s.dur * 0.2), s.start + s.dur * 0.55, s.start + s.dur - 0.12);
  }
  const files = [];
  for (const t of times) {
    const f = Math.min(info.totalFrames - 1, Math.max(0, Math.round(t * info.fps)));
    const url = await page.evaluate((f) => { window.__CV.drawFrame(f); return window.__CV.capture('image/png'); }, f);
    const file = path.join(outDir, `t${(f / info.fps).toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    files.push(file);
  }
  await browser.close();
  log(`✔ ${files.length} stills → ${path.relative(process.cwd(), outDir)}`);
  if (opts.sheet) {
    const cols = Number(opts.cols || 3), rows = Math.ceil(files.length / cols);
    const sheet = path.join(outDir, 'contact-sheet.png');
    const w = Math.round(640);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-pattern_type', 'glob', '-i', path.join(outDir, 't*.png'), '-vf', `scale=${w}:-2,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', sheet]);
    log(`  contact sheet → ${path.relative(process.cwd(), sheet)}`);
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
// init — scaffold a project from a preset
// ---------------------------------------------------------------------------
function init(opts) {
  const dir = path.resolve(opts._[1] || die('missing <dir>'));
  const slug = opts.preset || 'swiss-kinetic';
  const tpl = path.join(ROOT, 'presets', slug, 'template.html');
  if (!fs.existsSync(tpl)) die(`unknown preset "${slug}". Available: ${fs.readdirSync(path.join(ROOT, 'presets')).filter((d) => fs.existsSync(path.join(ROOT, 'presets', d, 'template.html'))).join(', ')}`);
  if (fs.existsSync(path.join(dir, 'video.html')) && !opts.force) die(`${dir}/video.html exists (use --force)`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'runtime', 'canvas-video.js'), path.join(dir, 'canvas-video.js'));
  let htmlSrc = fs.readFileSync(tpl, 'utf8').replace(/src="[^"]*canvas-video\.js"/, 'src="canvas-video.js"');
  if (opts.ratio) {
    const [w, h] = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] }[opts.ratio] || die('ratio must be 16:9, 9:16, 1:1 or 4:5');
    htmlSrc = htmlSrc.replace(/width:\s*\d+/, `width: ${w}`).replace(/height:\s*\d+/, `height: ${h}`);
  }
  fs.writeFileSync(path.join(dir, 'video.html'), htmlSrc);
  const narr = path.join(ROOT, 'presets', slug, 'narration.json');
  if (fs.existsSync(narr) && !fs.existsSync(path.join(dir, 'narration.json'))) fs.copyFileSync(narr, path.join(dir, 'narration.json'));
  fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\nout/\n');
  log(`✔ scaffolded ${path.relative(process.cwd(), dir) || '.'} from preset "${slug}"`);
  log(`  preview:  open ${path.join(dir, 'video.html')}`);
  log(`  render:   node ${path.relative(process.cwd(), path.join(ROOT, 'scripts', 'cv.mjs'))} render ${path.relative(process.cwd(), dir) || '.'}`);
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

const HELP = `canvas-video — Canvas motion graphics → MP4

render <project|video.html>   render to MP4 (runs Edge TTS first if narration.json exists)
    --out <file.mp4>          default <project>/out/<name>.mp4
    --subs file|burn|soft|burn+soft|none   default file (.srt + .vtt next to the MP4)
    --music <file>            background music bed (auto-ducked under narration)
    --music-volume 0.22
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
    --at 1.2,3.4  --sheet  --subs  --scale 0.5  --tts
tts <project>                 synthesize narration.json with Edge TTS (cached)
check <video.mp4> [--srt f]   ffprobe summary + A/V + subtitle sanity checks
gif <video.mp4>               palette GIF preview  [--out --width 480 --fps 12 --from --dur]
init <dir> --preset <slug>    scaffold a project from a style preset [--ratio 9:16]
voices [--lang zh-CN]         list Edge TTS voices
`;

const opts = parseArgs(process.argv.slice(2));
const cmd = opts._[0];
const main = { render, still, tts: (o) => tts(resolveProject(o._[1]).dir), check: (o) => { const issues = report(path.resolve(o._[1] || die('missing file')), o.srt ? path.resolve(o.srt) : null); process.exitCode = issues.length ? 2 : 0; }, gif, init, voices }[cmd];
if (!main) { log(HELP); process.exit(cmd && cmd !== 'help' ? 1 : 0); }
Promise.resolve(main(opts)).catch((e) => die(e.stack || e.message));
