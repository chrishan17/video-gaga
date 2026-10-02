---
name: video-gaga
description: Design and render motion-graphics videos (MP4) from a plain-language request. The agent designs each frame in HTML Canvas (three.js for 3D when depth carries meaning) and renders it deterministically, with a generated music score on the same beat grid as the cuts, sound effects, Edge TTS narration with room to breathe, and burned-in or file subtitles. Use when the user wants a video, animation, explainer, product teaser, kinetic typography, social short or animated infographic, or asks to turn a script, article, data or an idea into a video. It asks a few three-option questions, shows style frames before building, and verifies the render itself.
---

# Video Gaga

Turn "I want a video about X" into a finished, professionally animated MP4. Every frame is drawn with Canvas 2D (or three.js for 3D) as a pure function of time, rendered frame-exactly in headless Chromium, and encoded with ffmpeg. The voice comes from free Edge TTS and drives the timeline. A score generated from that same timeline gives it rhythm: cuts land on the beat, the music dips under the voice and fills the pauses. Captions come from the same word timings.

## Core principles

1. **Deterministic by construction.** Frame N = `draw(t = N / fps)`. There is no wall clock, no `Math.random`, and no state between frames. That property makes parallel, frame-exact rendering possible. It is non-negotiable.
2. **Show, don't tell.** People can't describe the motion style they want, but they recognise it. Show style frames rendered with their own words before building the whole thing.
3. **Motion serves meaning.** Every move directs attention or explains a change. Cool is welcome, gratuitous is not. Follow [docs/motion-design.md](docs/motion-design.md).
4. **The voice is the clock, the music is the pulse.** Scene lengths come from the speech; visual hits are pinned to spoken words (`s.when('word')`, `fx.wordReveal({ sync: s })`). The music's beat grid places the cuts and the first syllable of every line, and carries the moments without voice.
5. **Leave room.** Narration is not wall-to-wall: a music-only pre-roll, a held beat before the payoff, an end card that rings out. Silence is a design decision. Read [docs/music-and-sound.md](docs/music-and-sound.md) §5.
6. **Verify before you deliver.** Probe frames, look at them yourself, render, run `cv check`, and look at frames from the actual MP4. Report the numbers honestly.
7. **Presets set the look, never the content.** A preset contributes its palette, type, motion helpers, transitions and caption style. The script, the scene structure, the choreography and the music are designed for each brief. `cv init` copies only the style, and there are no music presets: you compose the score (§ Phase 1 and [docs/music-and-sound.md](docs/music-and-sound.md) §2).
8. **Zero build.** A video is one `video.html` + `video-gaga.js` + an optional `narration.json`. There is no bundler, framework or login. three.js, when used, comes from a pinned CDN import map.

## Use your full capability

You are a senior motion designer, editor and engineer in one. Plan the storyboard like a director, and write the copy like an editor: cut words before you speed up the voice. Compute data exactly. Use vision on every probe sheet and critique it as a design lead would (hierarchy, collisions, readability, rhythm). Then fix and re-probe. Parallelise independent tool calls, for example TTS while you write the next scene. Iterate until the checklist passes, not just until it runs.

## Design aesthetics (avoid "motion slop")

Your default instincts converge on generic output: everything fades in at once, crossfades everywhere, neon on dark, purple gradients, bouncy easing, particle bursts, text that never holds long enough to read. Resist all of it.
- Commit to one visual system per video: one field colour, one accent, a display + label font pair, one easing family, and 1–2 transition types.
- Reveal in causal order and give each beat a hold. Keep one focal point at a time.
- **Every scene has an entrance, a hold *and* an exit.** Secondary elements leave just before the cut (`s.out()`, `exit:` on reveals) so the cut happens on action. A frame that is only shoved off by the next scene feels like a slideshow.
- **Calibrated flair.** Each video earns one or two signature moves (a camera that follows the data, a match cut, an iris from the key number, a 3D turn) that make it memorable. They must still explain something. Everything else stays quiet.
- Use distinctive, fitting fonts from Google Fonts (never Arial, Inter or Roboto by default). For Chinese, Noto Sans/Serif SC or a display face that suits the tone.
- Add atmosphere (grain, paper, light, grid) only if it belongs to the concept.
- Read the full do/don't list in [docs/motion-design.md](docs/motion-design.md) §13 before building.

## Invariants (every composition)

- One HTML file that loads `video-gaga.js` and calls `CV.create({...})`, with scenes whose `draw(ctx, s)` is pure.
- Design at the output size: 1920×1080 (16:9), 1080×1920 (9:16), 1080×1080 (1:1) or 1080×1350 (4:5). Sizes must be even. 30 fps unless asked otherwise.
- Fonts come from `<link>` Google Fonts with `display=block`. The runtime waits for the glyphs actually drawn, and the render warns on fallback.
- Nothing internal is ever visible on screen: no "Scene 1", "Option A", preset names, placeholder text or file names.
- Captions never collide with content. Reserve the bottom ~12% in 16:9, and in 9:16 the lower 18% and the right 12% for platform UI.
- Hold every information beat ≥ 1 s. The last frame is a resolved still held ≥ 1 s.
- Data and claims must be accurate. Add a calculation or source footnote when showing numbers.

---

## Phase 0 — Setup check & mode

**Setup (first run).** The skill directory is where this SKILL.md lives. Below, `cv` is short for `node <skill-dir>/scripts/cv.mjs`. Run `cv doctor`. If something is missing:
- `cd <skill-dir> && npm install` (Playwright). If no browser is found, run `npx playwright install chromium`.
- ffmpeg: `brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux.
- Edge TTS: `uv` is recommended (the CLI runs `uv run --with edge-tts`). Otherwise `pip install edge-tts`.
- **Sandboxed agents:** `cv doctor`, `still`, `render`, `tts` and `voices` need permission. They launch Chromium, which creates a temp profile outside the workspace. They also fetch fonts and TTS over the network, and uv writes its cache to `~/.cache/uv`. `init`, `check` and `gif` run fine inside the sandbox. Ask once, up front, instead of discovering it one command at a time.

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
- **Exactly 3 options per question.** Exactly **one** is marked **(Recommended)**, with a one-line reason tied to *this* brief. The user may always answer in their own words. In a label + description UI, put "(Recommended)" in the label and the reason in the description.
- **4–7 questions**, chosen to fit the video type (table below). Skip anything the request already answers, and confirm those as assumptions instead. If the UI caps a round (often at 4), ask the most decision-relevant ones and list the rest as stated assumptions in the same message.
- If a question times out or the user is away, take the recommended option, say so, and continue. This applies to the Phase 2 and Phase 3 questions too.
- Options must be concrete (durations, ratios, named voices, hex colours), never vague ("modern", "nice").
- Ask in the user's language.

**Pick dimensions by video type**

| Video type | Ask about |
|---|---|
| Product launch / teaser | length · format · voice · captions · brand colour/logo · ending/CTA |
| Knowledge explainer / tutorial | length · content readiness · voice · captions · format · pace |
| Data story / infographic | data source & accuracy · length · voice · captions · brand |
| Kinetic typography / quote / title | format · pace (tempo) · length · music (score design) |
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
| Voice (audio products) | narrator only | narrator + the product's own audio (real voices, accents, languages) | product audio only, no narrator | anything that speaks, reads or translates: let it be heard |
| Captions | burned-in, styled to the video | subtitle file only (.srt/.vtt) | none | burned-in for social (most people watch muted); file only for YouTube or accessibility pipelines |
| Brand | use my colours/logo (send hex or file) | use the style's palette | one accent you pick for me: {hex} | if they have a brand, A |
| Content | I have a script (paste it) | I have bullet points | topic only, write it for me | whichever matches what they sent |
| Language | 中文 | English | bilingual captions (voice in {X}) | the language of the request |
| Music | a score designed for this brief: {feel in 3 words} · {bpm} BPM {key} {mode} · {2–3 instruments} — {why} | a contrasting design: {feel} · {bpm} BPM {mode} · {instruments} | my own licensed track (send it + its BPM) / none | a generated score by default (a voice alone is dry). Design it from the content's emotion, not the visual preset: see [docs/music-and-sound.md](docs/music-and-sound.md) §2.1 |
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
2. Choose **3 directions**: the **best-fit preset** for the mood, a **contrasting preset**, and one **wildcard**, which is a custom system designed for this brief (see "Custom / wildcard styles"). Recommend whichever of the three fits best. When the brand already has a documented visual language (a brand board, a design system, a live site), the wildcard built from it is often the right pick.
3. For each direction, build a *real first scene*: the user's actual title or hook, in the user's format and language, already in the brand colours if they are known. Run `cv init .cv-previews/style-a --preset <slug> --ratio <chosen>`: it copies the style (THEME, KIT helpers, transition, captions, overlay) with no scenes. Read the preset's first example scene for its motion grammar, write your own one scene into the empty `scenes` array, then run `cv still .cv-previews/style-a --at 0.6,1.5,2.8 --sheet`.
4. **Look at the sheets yourself** and fix anything off before showing them. If the user wants to *hear* a direction, write a draft score for this brief into it and run `cv music .cv-previews/style-a` (renders `build/music.wav`). Then show all three to the user. In a text-only question UI, stack them into one comparison image (top to bottom = A, B, C, with no labels drawn on it) and include the image and the file paths in the question:
   `ffmpeg -i .cv-previews/style-a/build/stills/contact-sheet.png -i …/style-b/… -i …/style-c/… -filter_complex vstack=inputs=3 .cv-previews/styles.png`
5. Ask one question (3 options, one recommended): *"Which direction?"* → A: {name} (Recommended: {reason}) · B: {name} · C: {name}. The user can also say "mix: A's colours with C's motion".

**Preview authenticity (non-negotiable):** previews must look like the real opening of *their* video. Never render words such as "preview", "style A", "option", preset or template names, requirement notes ("bold option", "for Gen Z"), or file paths.

Skip this phase in quick mode, when the user already named a style, or when editing (Modes C and D).

---

## Phase 3 — Script & storyboard

Write `<project>/BRIEF.md` using the director's-brief template in [docs/prompt-templates.md](docs/prompt-templates.md), then show the storyboard table:

| # | scene id | voice line (exact words, or — for music only) | visual — the one focal point | motion & sync (which word / beat) | exit | transition in | music energy · sfx | ≈ s |
|---|---|---|---|---|---|---|---|---|

Under the table, one line for the **score design**: feel in three words · BPM · key and mode · progression · the layers and at which energy each enters · the lead (or none). Example: *curious, bright, trustworthy · 100 BPM D major · I–vi–IV–V with sevenths · pad from 0, key stabs 0.25, bass 0.35, shaker 0.4, kick 0.5 · glockenspiel lead in the gaps.*

- **The structure comes from the content.** Choose the number of scenes, their order and the signature moves from what this message needs, never from the preset's example video.

- One idea per scene, one sentence of narration per scene, and the payoff word at the end of the line.
- **Plan the silence.** Include at least one music-only moment (pre-roll, a `beats: 4–8` breath before the payoff, or the end card). Aim for speech on roughly 65–80% of the runtime in explainers and 40–60% in teasers.
- Give each scene an `energy` (0..1) so the score builds and resolves with the story, and choose sfx with restraint (one per transition, ticks for counted items, at most one `hit`).
- Estimate duration at ≈ 4.3 CJK characters/s or ≈ 2.5 English words/s, plus pauses, **plus ~1 s per voiced scene** (voice delay, the last syllable's decay and the tail; with music, snapping to the beat adds up to half a beat more), plus the music-only moments. A sequence of short clips (accents, languages, a dialogue) costs about 1 s per clip, however few the words. If it is too long, **cut words**, then scenes.
- Captions carry the narrator. When a narrator line is already on screen as type (a title question, a tagline), or the picture already shows what is said, give that scene `captions: 'file'`. It stays in the .srt/.vtt but isn't burned in twice.
- For data, show the numbers and how they were computed.
- Confirm with one 3-option question: *Looks good, build it (Recommended)* · *Change the script* · *Change the visuals*.

---

## Phase 4 — Build

1. **Scaffold** in the user's working directory: `cv init <slug>-video --preset <chosen> [--ratio 9:16]`. This copies the runtime and only the preset's *style*: the `THEME` (palette, fonts), its `KIT` helpers (the style's reusable motion and drawing functions) and the look of `CV.create` (size, transition, captions, overlay). The example's scenes, score and narration are left out on purpose. For a custom wildcard, scaffold from the nearest preset and rewrite the THEME and KIT.
2. **Read the chosen preset's `video.html`** (in the skill's `presets/`) to learn its design grammar: how its KIT helpers are used, its easing, holds, exits and transitions. Apply that grammar to *this* storyboard. Don't copy the example's scenes, structure, layouts or data. The KIT helpers are an optional toolbox, not a menu to fill: use the ones that serve this story, change or delete the rest, and **invent new helpers and moves** when the brief calls for something the preset never did. Generating what this video needs is the job; reusing the example is the shortcut to avoid.
3. **Write `narration.json`** (segments = scene ids) with the chosen voice and rate. See [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md).
4. **Write the score** in `CV.create({ music: { … } })` from the score-design line: `bpm`, `key`, `mode`, `progression`, `layers` (each with its `from` energy), `lead`, `seed`, and give every scene an `energy` that follows the story ([docs/music-and-sound.md](docs/music-and-sound.md) §2). `cv music` refuses a spec that breaks a limit and lists what to fix; fix its warnings too.
5. **Write the scenes.** API reference: [docs/runtime-api.md](docs/runtime-api.md). Patterns to use:
   - `s.at(start, dur, ease)` for every local move. `s.when('spoken words')` to land hits on the voice; `s.onBeat(i)` / `s.nextBeat(t)` for moves in music-only moments.
   - `fx.wordReveal({ sync: s })` / `fx.lineReveal` / `fx.charReveal` for type, `fx.countUp` / `fx.roll` for numbers, `draw.drawOn` / `draw.arrow` for lines and charts, `fx.highlight` for the key term.
   - Exits: `s.out(0.4, ease.exit, overlap)` and the `exit:` option on reveals.
   - Scene `transition` objects from the preset's vocabulary (the full list is in [docs/runtime-api.md](docs/runtime-api.md#transitions)), and `tail` ≥ 1.0 on information-heavy scenes. `tail` is the hold after the **last spoken word**, and `s.voiceEnd` is when that word has ended.
   - Several voices in a row (accents, languages, a dialogue): one scene per clip, each with its own `voice` in narration.json, joined by `cut` transitions over an identical layout so the cuts are invisible.
   - 3D: only when depth carries meaning. Follow [docs/three-d.md](docs/three-d.md) (`CV.three`, build once, set everything from `s.t`).
   - Scale with `s.u` if the ratio differs from the preset's.
   - Key symbols (⌘ ⌥ ⇧ ⌃) are missing from most display fonts and fall back silently: draw them as paths or use a font that has them.
6. **TTS + music:** `cv tts <project>`, then `cv music <project>`, which prints the key, BPM, energy per bar, every cut time and every sfx (the preview player then plays the score). Check `build/voice/<id>.json` to see how the words were tokenised.
7. **Probe:** `cv still <project> --sheet --subs`, which renders 3 probes per scene (entering, middle, settled). **Open the contact sheet and review it** against the checklist in [docs/motion-design.md](docs/motion-design.md) §14. Fix, then re-probe. Use `--at 1.2,3.4` to inspect exact moments, such as a hit or the middle of a transition. With more than ~6 scenes the sheet gets small, so open the individual stills at the hits.
8. For long pieces, render a draft first: `render --scale 0.5 --format jpeg`.

---

## Phase 5 — Render & verify

```bash
cv render <project> --subs burn        # or file | soft | burn+soft | none
#   --motion-blur 5   (snappy moves)   --music track.mp3 (licensed, replaces the score)   --no-music   --scale 2 (4K)
```

The render ends with an automatic `check`. Confirm and report:
- duration ≈ target, fps, resolution, and the frame count
- the audio track is present when voiced, its duration matches the video (±0.1 s), and loudness is sane
- captions: cue count, no overlaps, and the last cue ends before the video does
- **A/V sync**: median speech-onset vs caption-onset offset (normally < 120 ms, measured on the voice stem). The render warns above 300 ms.
- **Voice sync**: every voice clip's onset vs where the timeline placed it, including lines with no caption (normally < 20 ms). The render warns above 150 ms.
- **music balance**: dB under the voice while it speaks (aim 10–18) and vs the voice in the gaps (≈ −2…−6). Adjust `music.volume` / `music.duck`.

Then **extract 3–5 frames from the final MP4** (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 f.png`) at key hits and look at them. The encode is what the user sees. Fix anything wrong and re-render. Never claim a check passed that you didn't run.

---

## Phase 6 — Deliver & iterate

Tell the user:
- the MP4 path (and the `.srt`/`.vtt` paths), duration, format, voice and style
- the check results in one line each (duration, audio, sync, captions, music balance), and the score in one line (feel, BPM, key and mode, instruments)
- how to preview and tweak: open `video.html` in a browser (Space to play, ←/→ to step frames). Colours and fonts live in the `T` object at the top, and the words live in `narration.json`.
- offer the natural next steps: *revise one note at a time* ("slower", "bigger numbers", "swap the voice"), another aspect ratio, a GIF preview (`cv gif`), a 4K render (`--scale 2`), or a captions-only file.

Clean up `.cv-previews/` after the user has picked a style.

---

## Supporting files

| File | Purpose | When to read |
|---|---|---|
| [STYLE_PRESETS.md](STYLE_PRESETS.md) | Index of the 11 presets: mood, palette, type, motion signature | Phase 2 |
| `presets/<slug>/video.html` | One preset: its THEME and KIT (the style), plus an example video that shows its grammar (EXAMPLE sections, scenes, score) | Phase 4, after the pick (for Phase 2 previews, its first scene) |
| `presets/<slug>/narration.json` | The example video's narration (a format reference, never reused) | Phase 4, for the format |
| [docs/motion-design.md](docs/motion-design.md) | Motion principles, timing tables, transitions, anti-patterns, QA checklist | Before building, and when reviewing probes |
| [docs/runtime-api.md](docs/runtime-api.md) | `CV.create`, scenes, `s.at` / `s.when`, fx, text, transitions, captions | Phase 4 |
| [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md) | Edge TTS voices, writing for the ear, caption rules, troubleshooting | Phases 1, 3 and 4 |
| [docs/music-and-sound.md](docs/music-and-sound.md) | Designing the score from the brief (spec, rules, limits), the beat grid, energy, sfx, pacing & silence, mix checks | Phases 1, 3 and 4 |
| [docs/three-d.md](docs/three-d.md) | three.js in a composition: when 3D earns it, the pattern, the rules | Phase 4, when a scene needs depth |
| [docs/prompt-templates.md](docs/prompt-templates.md) | Proven prompt patterns (with sources) and the director's-brief template | Phases 1 and 3 |
| [docs/tech-selection.md](docs/tech-selection.md) | Why Canvas + Playwright + ffmpeg + Edge TTS | When asked about the stack |
| `runtime/video-gaga.js` | The runtime (copied into each project by `cv init`) | When debugging |
| `scripts/cv.mjs` | CLI: `doctor · init · tts · music · still · render · check · gif · voices` | Always via the commands above |
| `scripts/music.mjs` | The score spec validator (`LIMITS`) and deterministic synthesizer (called by the CLI) | When a spec is refused or sounds wrong |
| `scripts/tts.py` | Edge TTS with WordBoundary timings (called by the CLI) | Rarely |
