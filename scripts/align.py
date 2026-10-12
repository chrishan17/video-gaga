#!/usr/bin/env python3
"""Word timings for narration clips that came without them (Qwen-TTS), from
Qwen3-ForcedAligner running locally on Apple Silicon through mlx-audio.

Usage:
    uv run --no-project --with mlx-audio python scripts/align.py <jobs.json>

<jobs.json> is a list of {"audio": "<wav>", "text": "...", "language": "English", "out": "<words.json>"};
each out file gets [{"text", "start", "end"}, ...] in seconds. The model is
loaded once for the whole list (~1 GB download the first time).
"""

import json
import sys
from pathlib import Path

MODEL = "mlx-community/Qwen3-ForcedAligner-0.6B-8bit"


def main(jobs_path: Path):
    jobs = json.loads(jobs_path.read_text("utf-8"))
    if not jobs:
        return
    try:
        from mlx_audio.stt.utils import load_model
    except ImportError:
        sys.exit("mlx-audio is not installed (needs Apple Silicon): uv run --with mlx-audio …")
    model = load_model(MODEL)
    for job in jobs:
        res = model.generate(job["audio"], text=job["text"], language=job.get("language", "English"))
        words = [{"text": it.text, "start": round(it.start_time, 4), "end": round(it.end_time, 4)} for it in res.items]
        Path(job["out"]).write_text(json.dumps(words, ensure_ascii=False), "utf-8")
        print(f"  [align ] {Path(job['out']).stem:<14} {len(words):3d} words")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
