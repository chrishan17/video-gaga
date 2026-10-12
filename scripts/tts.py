#!/usr/bin/env python3
"""Synthesize narration with Microsoft Edge TTS (rany2/edge-tts), or with
Alibaba's Qwen-TTS (`"engine": "qwen"`), and emit word-level timings that
drive the video-gaga timeline.

Usage:
    uv run --no-project --with edge-tts python scripts/tts.py <project-dir>
    # or, with edge-tts installed:  python3 scripts/tts.py <project-dir>

Reads  <project>/narration.json:
    {
      "voice": "zh-CN-YunxiNeural", "rate": "+0%", "pitch": "+0Hz", "volume": "+0%",
      "lang": "zh-CN",
      "segments": [ {"id": "hook", "text": "..."}, {"id": "s2", "text": "...", "voice": "..."} ]
    }

Writes <project>/build/voice/<id>.mp3 and <id>.json, plus
       <project>/build/narration.json and build/narration.js
       (window.CV_NARRATION = {...}) which the runtime picks up.

Durations come from the byte count of the CBR stream (48 kbit/s mono MP3),
which is exact; word offsets come from WordBoundary events (100-ns ticks).
Results are cached by a hash of (text, voice, rate, pitch, volume).

Qwen-TTS ("engine": "qwen", voice e.g. "Andre", optional "model" and
"instructions"): the Bailian cloud API (DASHSCOPE_API_KEY, and
DASHSCOPE_BASE_URL for an international-region key) returns a WAV with no
word timings, so each clip is levelled to -16 LUFS and aligned to its text
by Qwen3-ForcedAligner on this machine (scripts/align.py, Apple Silicon).
"""

import asyncio
import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# edge-tts pins certifi's CA bundle and ignores SSL_CERT_FILE, which breaks
# behind TLS-intercepting proxies (corporate networks, cloud sandboxes).
# Honor SSL_CERT_FILE when it is set; must run before edge_tts is imported.
_ca_file = os.environ.get("SSL_CERT_FILE")
if _ca_file and os.path.isfile(_ca_file):
    try:
        import certifi

        certifi.where = lambda: _ca_file
    except ImportError:
        pass

try:
    import edge_tts
except ImportError:  # pragma: no cover  (only the edge engine needs it)
    edge_tts = None

MP3_BPS = 48_000  # audio-24khz-48kbitrate-mono-mp3
TICKS = 10_000_000

# edge-tts trusts only certifi's bundle, so behind a TLS-inspecting proxy
# (corporate networks, sandboxes) every request fails certificate checks.
# Honour the standard CA variables the way curl and requests do.
_ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
if edge_tts and _ca and os.path.isfile(_ca) and hasattr(edge_tts, "communicate") and hasattr(edge_tts.communicate, "_SSL_CTX"):
    edge_tts.communicate._SSL_CTX = ssl.create_default_context(cafile=_ca)


async def synth(seg, defaults, out_dir: Path):
    if edge_tts is None:
        sys.exit(
            "edge-tts is not installed. Run with `uv run --no-project --with edge-tts python scripts/tts.py <dir>` "
            "or `pip install edge-tts`."
        )
    voice = seg.get("voice", defaults.get("voice", "en-US-AndrewNeural"))
    rate = seg.get("rate", defaults.get("rate", "+0%"))
    pitch = seg.get("pitch", defaults.get("pitch", "+0Hz"))
    volume = seg.get("volume", defaults.get("volume", "+0%"))
    text = seg["text"].strip()
    key = hashlib.sha1(json.dumps([text, voice, rate, pitch, volume]).encode()).hexdigest()[:16]
    mp3 = out_dir / f"{seg['id']}.mp3"
    meta_path = out_dir / f"{seg['id']}.json"
    if mp3.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text("utf-8"))
        if meta.get("key") == key:
            return meta, True

    last_err = None
    for attempt in range(4):
        try:
            comm = edge_tts.Communicate(
                text, voice, rate=rate, pitch=pitch, volume=volume, boundary="WordBoundary"
            )
            audio = bytearray()
            words = []
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / TICKS
                    words.append(
                        {
                            "text": chunk["text"],
                            "start": round(start, 4),
                            "end": round(start + chunk["duration"] / TICKS, 4),
                        }
                    )
            if not audio:
                raise RuntimeError("no audio received")
            mp3.write_bytes(bytes(audio))
            duration = len(audio) * 8 / MP3_BPS
            meta = {
                "id": seg["id"],
                "key": key,
                "text": text,
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "duration": round(duration, 4),
                "words": words,
            }
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
            return meta, False
        except Exception as e:  # network hiccups, 403 clock-skew, etc.
            last_err = e
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"TTS failed for segment {seg['id']!r}: {last_err}")

QWEN_BASE = "https://dashscope.aliyuncs.com/api/v1"
QWEN_LANG = {"en": "English", "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "de": "German", "fr": "French",
             "es": "Spanish", "it": "Italian", "pt": "Portuguese", "ru": "Russian"}
QWEN_MAX_CHARS = 600


def ffmpeg(*args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "ffmpeg failed")
    return r.stderr


def probe_duration(path: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def qwen_synth(seg, defaults, out_dir: Path):
    """One Qwen-TTS clip: <id>.wav (levelled, for alignment) and <id>.mp3 (for the mix).
    Returns (meta, cached, needs_alignment)."""
    voice = seg.get("voice", defaults.get("voice", "Andre"))
    model = seg.get("model", defaults.get("model", "qwen3-tts-flash"))
    instructions = seg.get("instructions", defaults.get("instructions"))
    lang = seg.get("lang", defaults.get("lang", "en-US"))
    language = QWEN_LANG.get(lang[:2].lower(), "English")
    text = seg["text"].strip()
    key = hashlib.sha1(json.dumps(["qwen", text, voice, model, instructions, language]).encode()).hexdigest()[:16]
    mp3, wav = out_dir / f"{seg['id']}.mp3", out_dir / f"{seg['id']}.wav"
    meta_path = out_dir / f"{seg['id']}.json"
    if mp3.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text("utf-8"))
        if meta.get("key") == key and meta.get("words"):
            return meta, True, False
        if meta.get("key") == key and wav.exists():  # audio is paid for: only the alignment is missing
            return meta, True, True
    if len(text) > QWEN_MAX_CHARS:
        raise RuntimeError(f"segment {seg['id']!r} has {len(text)} characters; Qwen-TTS takes at most {QWEN_MAX_CHARS}")
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        sys.exit("engine qwen needs DASHSCOPE_API_KEY (Alibaba Bailian); for an international-region key also set "
                 "DASHSCOPE_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1")
    base = (os.environ.get("DASHSCOPE_BASE_URL") or QWEN_BASE).rstrip("/")
    body = {"model": model, "input": {"text": text, "voice": voice, "language_type": language}}
    if instructions:
        body["input"].update(instructions=instructions, optimize_instructions=True)
    req = urllib.request.Request(f"{base}/services/aigc/multimodal-generation/generation",
                                 data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.load(r)
            url = (resp.get("output") or {}).get("audio", {}).get("url")
            if not url:
                raise RuntimeError(f"no audio in response: {json.dumps(resp, ensure_ascii=False)[:300]}")
            raw = out_dir / f"{seg['id']}.raw.wav"
            with urllib.request.urlopen(url, timeout=120) as r:  # the link expires in 24 h: fetch it now
                raw.write_bytes(r.read())
            break
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}"
            if e.code < 500 and e.code != 429:
                raise RuntimeError(f"Qwen-TTS failed for segment {seg['id']!r}: {last_err}")
        except Exception as e:  # network hiccups
            last_err = e
        time.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(f"Qwen-TTS failed for segment {seg['id']!r}: {last_err}")
    # level every clip to the same loudness (Qwen clips vary between calls), then a mono MP3 for the mix
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", ffmpeg("-i", str(raw), "-af", "ebur128", "-f", "null", "-"))
    gain = -16.0 - float(m[-1]) if m else 0.0
    ffmpeg("-i", str(raw), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89", "-ac", "1", "-ar", "24000", str(wav))
    ffmpeg("-i", str(wav), "-c:a", "libmp3lame", "-b:a", "96k", str(mp3))
    raw.unlink()
    meta = {
        "id": seg["id"], "key": key, "engine": "qwen", "text": text, "voice": voice, "model": model,
        "language": language, "duration": round(probe_duration(mp3), 4), "words": [],
        "request_id": resp.get("request_id"),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
    return meta, False, True


def align(project: Path, jobs):
    """Word timings for Qwen clips, one aligner process for all of them."""
    if not jobs:
        return
    jobs_path = project / "build" / "voice" / "_align.json"
    jobs_path.write_text(json.dumps(jobs, ensure_ascii=False), "utf-8")
    script = Path(__file__).with_name("align.py")
    cmd = (["uv", "run", "--quiet", "--no-project", "--with", "mlx-audio", "python", str(script), str(jobs_path)]
           if shutil.which("uv") else [sys.executable, str(script), str(jobs_path)])
    subprocess.run(cmd, check=True)
    jobs_path.unlink()


async def main(project: Path):
    spec_path = project / "narration.json"
    if not spec_path.exists():
        sys.exit(f"no narration.json in {project}")
    spec = json.loads(spec_path.read_text("utf-8"))
    out_dir = project / "build" / "voice"
    out_dir.mkdir(parents=True, exist_ok=True)

    segments = {}
    total = 0.0
    metas, jobs = [], []
    # Sequential on purpose: the services rate-limit bursts of connections.
    for seg in spec["segments"]:
        if seg.get("engine", spec.get("engine", "edge")) == "qwen":
            meta, cached, needs = qwen_synth(seg, spec, out_dir)
            if needs:
                jobs.append({"audio": str(out_dir / f"{seg['id']}.wav"), "text": meta["text"],
                             "language": meta["language"], "out": str(out_dir / f"{seg['id']}.words.json")})
        else:
            meta, cached = await synth(seg, spec, out_dir)
        metas.append((seg, meta, cached))
    align(project, jobs)
    for seg, meta, cached in metas:
        words_path = out_dir / f"{seg['id']}.words.json"
        if meta.get("engine") == "qwen" and words_path.exists():
            meta["words"] = json.loads(words_path.read_text("utf-8"))
            (out_dir / f"{seg['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
            words_path.unlink()
        total += meta["duration"]
        segments[seg["id"]] = {
            "text": meta["text"],
            "duration": meta["duration"],
            "words": meta["words"],
            "file": f"build/voice/{seg['id']}.mp3",
            "voice": meta["voice"],
        }
        tag = "cached" if cached else "synth "
        print(f"  [{tag}] {seg['id']:<14} {meta['duration']:6.2f}s  {len(meta['words']):3d} words  {meta['voice']}")

    narration = {
        "voice": spec.get("voice"),
        "lang": spec.get("lang") or (spec.get("voice", "en-US")[:5] if spec.get("engine", "edge") == "edge" else "en-US"),
        "segments": segments,
    }
    build = project / "build"
    (build / "narration.json").write_text(json.dumps(narration, ensure_ascii=False, indent=1), "utf-8")
    (build / "narration.js").write_text(
        "// generated by scripts/tts.py — do not edit\nwindow.CV_NARRATION = "
        + json.dumps(narration, ensure_ascii=False)
        + ";\n",
        "utf-8",
    )
    print(f"  narration: {len(segments)} segments, {total:.2f}s of speech → {build / 'narration.js'}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(Path(sys.argv[1]).resolve()))
