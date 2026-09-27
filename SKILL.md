---
name: canvas-video
description: Design and render motion-graphics videos (MP4) from a plain-language request. The agent designs each frame in HTML Canvas and renders it deterministically, adding Edge TTS narration and burned-in or file subtitles when needed. Use when the user wants a video, animation, explainer, product teaser, kinetic typography, social short or animated infographic, or asks to turn a script, article, data or an idea into a video. It asks a few three-option questions, shows style frames before building, and verifies the render itself.
---

# Canvas Video

Turn "I want a video about X" into a finished, professionally animated MP4. Every frame is drawn with Canvas 2D (WebGL optional) as a pure function of time, rendered frame-exactly in headless Chromium, and encoded with ffmpeg. The voice comes from free Edge TTS and drives the timeline. Captions come from the same word timings.

## Core principles

1. **Deterministic by construction.** Frame N = `draw(t = N / fps)`. There is no wall clock, no `Math.random`, and no state between frames. That property makes parallel, frame-exact rendering possible. It is non-negotiable.
2. **Show, don't tell.** People can't describe the motion style they want, but they recognise it. Show style frames rendered with their own words before building the whole thing.
3. **Motion serves meaning.** Every move directs attention or explains a change. Cool is welcome, gratuitous is not. Follow [docs/motion-design.md](docs/motion-design.md).
4. **The voice is the clock.** When there is narration, scene lengths come from the speech, and visual hits are pinned to spoken words (`s.when('word')`).
5. **Verify before you deliver.** Probe frames, look at them yourself, render, run `cv check`, and look at frames from the actual MP4. Report the numbers honestly.
6. **Zero build.** A video is one `video.html` + `canvas-video.js` + an optional `narration.json`. There is no bundler, framework or login.

## Use your full capability

You are a senior motion designer, editor and engineer in one. Plan the storyboard like a director, and write the copy like an editor: cut words before you speed up the voice. Compute data exactly. Use vision on every probe sheet and critique it as a design lead would (hierarchy, collisions, readability, rhythm). Then fix and re-probe. Parallelise independent tool calls, for example TTS while you write the next scene. Iterate until the checklist passes, not just until it runs.

## Design aesthetics (avoid "motion slop")

Your default instincts converge on generic output: everything fades in at once, crossfades everywhere, neon on dark, purple gradients, bouncy easing, particle bursts, text that never holds long enough to read. Resist all of it.
- Commit to one visual system per video: one field colour, one accent, a display + label font pair, one easing family, and 1–2 transition types.
- Reveal in causal order and give each beat a hold. Keep one focal point at a time.
- Use distinctive, fitting fonts from Google Fonts (never Arial, Inter or Roboto by default). For Chinese, Noto Sans/Serif SC or a display face that suits the tone.
- Add atmosphere (grain, paper, light, grid) only if it belongs to the concept.
- Read the full do/don't list in [docs/motion-design.md](docs/motion-design.md) §13 before building.

## Invariants (every composition)

- One HTML file that loads `canvas-video.js` and calls `CV.create({...})`, with scenes whose `draw(ctx, s)` is pure.
- Design at the output size: 1920×1080 (16:9), 1080×1920 (9:16), 1080×1080 (1:1) or 1080×1350 (4:5). Sizes must be even. 30 fps unless asked otherwise.
- Fonts come from `<link>` Google Fonts with `display=block`. The runtime waits for the glyphs actually drawn, and the render warns on fallback.
- Nothing internal is ever visible on screen: no "Scene 1", "Option A", preset names, placeholder text or file names.
- Captions never collide with content. Reserve the bottom ~12% in 16:9, and in 9:16 the lower 18% and the right 12% for platform UI.
- Hold every information beat ≥ 1 s. The last frame is a resolved still held ≥ 1 s.
- Data and claims must be accurate. Add a calculation or source footnote when showing numbers.

---

## Phase 0 — Setup check & mode

**Setup (first run).** The skill directory is where this SKILL.md lives. Run `node <skill-dir>/scripts/cv.mjs doctor`. If something is missing:
- `cd <skill-dir> && npm install` (Playwright). If no browser is found, run `npx playwright install chromium`.
- ffmpeg: `brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux.
- Edge TTS: `uv` is recommended (the CLI runs `uv run --with edge-tts`). Otherwise `pip install edge-tts`.
- Rendering launches Chromium and fetches fonts and TTS over the network. In sandboxed agents, request permission for those commands.

**Detect the mode:**
- **A · New video from an idea.** Go to Phase 1.
- **B · From material** (script, article, notes, a deck, a CSV or data, a URL). Read it, extract the one message plus 3–6 beats, then go to Phase 1 and ask only about what the material doesn't answer.
- **C · Edit an existing composition.** Read `video.html` / `narration.json`, make the change, re-probe the affected scenes, re-render, and re-check.
- **D · Add narration or captions to an existing composition.** Write `narration.json` with segment ids = scene ids, remove fixed `duration`s so the voice drives timing, re-pin hits with `s.when()`, then re-probe and render.
- **Quick mode.** If the user says "just make it", "surprise me" or "直接做", skip the questions. Pick the recommended option for every dimension, **state your assumptions in one short list**, and go straight to Phase 3 (still show the storyboard). Offer changes after the first render.

---

## Phase 1 — Discovery questions

Ask **all questions in one round**. If a native structured-question UI exists, use it; otherwise send one concise numbered message.

**Rules**
- **Exactly 3 options per question.** Exactly **one** is marked **(Recommended)**, with a one-line reason tied to *this* brief. The user may always answer in their own words.
- **4–7 questions**, chosen to fit the video type (table below). Skip anything the request already answers, and confirm those as assumptions instead.
- Options must be concrete (durations, ratios, named voices, hex colours), never vague ("modern", "nice").
- Ask in the user's language.

**Pick dimensions by video type**

| Video type | Ask about |
|---|---|
| Product launch / teaser | length · format · voice · captions · brand colour/logo · ending/CTA |
| Knowledge explainer / tutorial | length · content readiness · voice · captions · format · pace |
| Data story / infographic | data source & accuracy · length · voice · captions · brand |
| Kinetic typography / quote / title | format · pace (tempo) · length · music |
| Social short (Reels/TikTok/Shorts/视频号) | hook · length · voice · caption style · format (default 9:16) |
| Event / promo | date & place text · format · voice · ending/CTA · vibe |
| Brand / culture / internal | audience · length · voice · captions · brand |

**Question bank** (adapt the wording and put the recommendation first or mark it)

| Dimension | Option A | Option B | Option C | Recommend when… |
|---|---|---|---|---|
| Length | 15 s | 30 s | 60 s | the shortest that fits the message (social 10–20 s, launch 15–30 s, explainer 30–90 s) |
| Format | 16:9 1920×1080 (YouTube, web, slides) | 9:16 1080×1920 (Reels, TikTok, Shorts, 视频号) | 1:1 1080×1080 (feeds, LinkedIn) | where it will be posted |
| Vibe / tone | calm & premium | clear & friendly | bold & energetic | infer from the audience and stakes |
| Pace | calm (a beat every ~2.5 s) | medium (~1.5 s) | punchy (~0.8 s, hits on beats) | social → punchy, explainer → medium, luxury → calm |
| Voice | none (text + motion only) | {best voice id} — {why} | {alternative voice id} — {why} | voice for explainers, launches and social. None for typography loops |
| Captions | burned-in, styled to the video | subtitle file only (.srt/.vtt) | none | burned-in for social (most people watch muted); file only for YouTube or accessibility pipelines |
| Brand | use my colours/logo (send hex or file) | use the style's palette | one accent you pick for me: {hex} | if they have a brand, A |
| Content | I have a script (paste it) | I have bullet points | topic only, write it for me | whichever matches what they sent |
| Language | 中文 | English | bilingual captions (voice in {X}) | the language of the request |
| Music | none (voice only) | I'll provide a licensed track | silence + subtle sound design later | none by default: canvas-video doesn't bundle music |
| Ending | logo + tagline | CTA text (URL, date, handle) | no end card | promos → CTA, explainers → takeaway line |

**Example (Chinese request "做个视频讲讲复利")**

```
1. 时长 — A. 30 秒（推荐：一个概念 + 一张图表刚好讲清，适合转发） B. 60 秒 C. 90 秒
2. 画幅 — A. 16:9 横屏（推荐：图表需要横向空间，适合 B 站/公众号） B. 9:16 竖屏 C. 1:1 方形
3. 配音 — A. 云希 YunxiNeural 男声（推荐：清晰有活力，适合知识讲解） B. 晓晓 XiaoxiaoNeural 女声 C. 不配音
4. 字幕 — A. 烧录进画面（推荐：多数人静音观看） B. 只导出 SRT/VTT C. 不要字幕
5. 内容 — A. 我来写脚本（推荐：你只给了主题，我会先给你分镜确认） B. 我有要点 C. 我有完整稿
6. 配色 — A. 用预设暖纸配色（推荐：没有品牌要求时最清晰） B. 用我的品牌色 C. 给我一个强调色方案
```

---

## Phase 2 — Style discovery (show, don't tell)

1. Read [STYLE_PRESETS.md](STYLE_PRESETS.md) (the index only).
2. Choose **3 directions**: the **recommended preset** for the mood, a **contrasting preset**, and one **wildcard**, which is a custom system designed for this brief (see "Custom / wildcard styles").
3. For each direction, build a *real first scene*: the user's actual title or hook, in the user's format and language. Use `cv init .cv-previews/style-a --preset <slug>`, replace the scenes with that one scene, then run `node <skill-dir>/scripts/cv.mjs still .cv-previews/style-a --at 0.6,1.5,2.8 --sheet --scale 0.5`.
4. **Look at the sheets yourself** and fix anything off before showing them. Then show the three contact sheets to the user.
5. Ask one question (3 options, one recommended): *"Which direction?"* → A: {name} (Recommended: {reason}) · B: {name} · C: {name}. The user can also say "mix: A's colours with C's motion".

**Preview authenticity (non-negotiable):** previews must look like the real opening of *their* video. Never render words such as "preview", "style A", "option", preset or template names, requirement notes ("bold option", "for Gen Z"), or file paths.

Skip this phase in quick mode, when the user already named a style, or when editing (Modes C and D).

---

## Phase 3 — Script & storyboard

Write `<project>/BRIEF.md` using the director's-brief template in [docs/prompt-templates.md](docs/prompt-templates.md), then show the storyboard table:

| # | scene id | voice line (exact words) | visual — the one focal point | motion & sync (which word) | transition in | ≈ s |
|---|---|---|---|---|---|---|

- One idea per scene, one sentence of narration per scene, and the payoff word at the end of the line.
- Estimate duration at ≈ 4.3 CJK characters/s or ≈ 2.5 English words/s, plus pauses. If it is too long, **cut words**.
- For data, show the numbers and how they were computed.
- Confirm with one 3-option question: *Looks good, build it (Recommended)* · *Change the script* · *Change the visuals*.

---

## Phase 4 — Build

1. **Scaffold** in the user's working directory: `node <skill-dir>/scripts/cv.mjs init <slug>-video --preset <chosen> [--ratio 9:16]`. This copies the runtime and the preset composition. For a custom wildcard, scaffold from the nearest preset and rewrite it.
2. **Read the chosen preset's `video.html` fully** and keep its design grammar. Replace the content, not the craft.
3. **Write `narration.json`** (segments = scene ids) with the chosen voice and rate. See [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md).
4. **Write the scenes.** API reference: [docs/runtime-api.md](docs/runtime-api.md). Patterns to use:
   - `s.at(start, dur, ease)` for every local move. `s.when('spoken words')` to land hits on the voice.
   - `fx.lineReveal` / `fx.charReveal` for type, `fx.countUp` for numbers, `draw.drawOn` for lines and charts.
   - Scene `transition` objects from the preset's vocabulary, and `tail` ≥ 1.0 on information-heavy scenes.
   - Scale with `s.u` if the ratio differs from the preset's.
5. **TTS:** `node <skill-dir>/scripts/cv.mjs tts <project>`. Check `build/voice/<id>.json` to see how the words were tokenised.
6. **Probe:** `node <skill-dir>/scripts/cv.mjs still <project> --sheet --subs`, which renders 3 probes per scene (entering, middle, settled). **Open the contact sheet and review it** against the checklist in [docs/motion-design.md](docs/motion-design.md) §14. Fix, then re-probe. Use `--at 1.2,3.4` to inspect exact moments, such as a hit or the middle of a transition.
7. For long pieces, render a draft first: `render --scale 0.5 --format jpeg`.

---

## Phase 5 — Render & verify

```bash
node <skill-dir>/scripts/cv.mjs render <project> --subs burn        # or file | soft | burn+soft | none
#   --motion-blur 5   (snappy moves)   --music bed.mp3 (licensed; auto-ducked)   --scale 2 (4K)
```

The render ends with an automatic `check`. Confirm and report:
- duration ≈ target, fps, resolution, and the frame count
- the audio track is present when voiced, its duration matches the video (±0.1 s), and loudness is sane
- captions: cue count, no overlaps, and the last cue ends before the video does
- **A/V sync**: median speech-onset vs caption-onset offset (normally < 120 ms). The render warns above 300 ms.

Then **extract 3–5 frames from the final MP4** (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 f.png`) at key hits and look at them. The encode is what the user sees. Fix anything wrong and re-render. Never claim a check passed that you didn't run.

---

## Phase 6 — Deliver & iterate

Tell the user:
- the MP4 path (and the `.srt`/`.vtt` paths), duration, format, voice and style
- the check results in one line each (duration, audio, sync, captions)
- how to preview and tweak: open `video.html` in a browser (Space to play, ←/→ to step frames). Colours and fonts live in the `T` object at the top, and the words live in `narration.json`.
- offer the natural next steps: *revise one note at a time* ("slower", "bigger numbers", "swap the voice"), another aspect ratio, a GIF preview (`cv gif`), a 4K render (`--scale 2`), or a captions-only file.

Clean up `.cv-previews/` after the user has picked a style.

---

## Supporting files

| File | Purpose | When to read |
|---|---|---|
| [STYLE_PRESETS.md](STYLE_PRESETS.md) | Index of the 5 presets: mood, palette, type, motion signature | Phase 2 |
| `presets/<slug>/video.html` | The full design recipe for one preset (a working composition) | Phase 4, after the pick only |
| `presets/<slug>/narration.json` | Example narration spec for that preset | Phase 4 |
| [docs/motion-design.md](docs/motion-design.md) | Motion principles, timing tables, transitions, anti-patterns, QA checklist | Before building, and when reviewing probes |
| [docs/runtime-api.md](docs/runtime-api.md) | `CV.create`, scenes, `s.at` / `s.when`, fx, text, transitions, captions | Phase 4 |
| [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md) | Edge TTS voices, writing for the ear, caption rules, troubleshooting | Phases 1, 3 and 4 |
| [docs/prompt-templates.md](docs/prompt-templates.md) | Proven prompt patterns (with sources) and the director's-brief template | Phases 1 and 3 |
| [docs/tech-selection.md](docs/tech-selection.md) | Why Canvas + Playwright + ffmpeg + Edge TTS | When asked about the stack |
| `runtime/canvas-video.js` | The runtime (copied into each project by `cv init`) | When debugging |
| `scripts/cv.mjs` | CLI: `doctor · init · tts · still · render · check · gif · voices` | Always via the commands above |
| `scripts/tts.py` | Edge TTS with WordBoundary timings (called by the CLI) | Rarely |
