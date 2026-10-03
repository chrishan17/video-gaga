---
name: video-gaga
description: Design and render motion-graphics videos (MP4) from a plain-language request. The agent writes the story, designs each frame in HTML Canvas (three.js for 3D when depth carries meaning) and renders it deterministically, with a score composed for the video on the same beat grid as the cuts, sound effects, Edge TTS narration and burned-in or file subtitles. Use when the user wants a video, animation, explainer, product teaser, kinetic typography, social short or animated infographic, or asks to turn a script, article, data or an idea into a video. It asks a few questions, shows style frames before building, and reviews its own frames before delivering.
---

# Video Gaga

Turn "I want a video about X" into a finished MP4 that helps someone say what they mean. You write the story, design the frames, choreograph the motion and compose the score; the runtime draws every frame with Canvas 2D (or three.js) as a pure function of time, renders it frame-exactly in headless Chromium and encodes it with ffmpeg. Edge TTS speaks the narration and sets the clock, and the score shares its beat grid.

## The bar

You are the writer, director, designer, motion designer, composer and editor in one, and the result is compared with what people scroll past every day. Correct is not enough: a video that is on time, readable and in sync can still be forgettable. Use your full ability, and read [docs/craft.md](docs/craft.md) before writing the brief. In short:

- **Story first.** Find the specific person, moment, object or number; write three angles and keep the strongest; give it a turn and a landing; write concrete lines, never slogans; make one line worth repeating.
- **One visual idea carries it.** A device that recurs and changes with the story. Design each frame like a poster: scale contrast, empty space, type as image, shots that vary like an editor's.
- **Motion with character.** Every move has a job, and the screen is never dead: layered entrances, a camera that keeps travelling, exits before the cut, a few signature moves. See [docs/motion-design.md](docs/motion-design.md).
- **A score that sounds produced.** Start from a reference a music supervisor would pick, write a hook, arrange the build to the story. See [docs/music-and-sound.md](docs/music-and-sound.md) §2.
- **Review like a creative director.** Look at your probes, name the weakest scene and rebuild it, read motion as filmstrips, check the encode. Iterate until it is good, not until it runs.

Presets give you a look and a toolbox, never the content: the script, the scene structure, the choreography and the score are made for each brief.

## The contract (every composition)

- One `video.html` that loads `video-gaga.js` and calls `CV.create({...})`; each scene's `draw(ctx, s)` is a **pure function of time**: no wall clock, no `Math.random`, no state between frames. That is what makes parallel, frame-exact rendering possible.
- Design at the output size: 1920×1080, 1080×1920, 1080×1080 or 1080×1350 (even sizes), 30 fps unless asked otherwise.
- Fonts come from Google Fonts `<link>` with `display=block`; the render warns on fallback.
- Nothing internal is ever on screen: no "Scene 1", "Option A", preset names, placeholders or file names.
- Captions never collide with content. Text holds long enough to read; the last frame is a resolved still held ≥ 1 s.
- Data and claims are accurate, with a source or calculation on screen when numbers are shown.

`cv` below is short for `node <skill-dir>/scripts/cv.mjs`, where the skill directory is where this file lives.

---

## 1. Understand the ask

**Setup (first run):** `cv doctor`. Fix what it reports: `npm install` in the skill directory (Playwright; `npx playwright install chromium` if no browser), ffmpeg, `uv` or `pip install edge-tts`, and let it download the instrument samples (without them the score falls back to a much cheaper synth). In a sandbox, `doctor`, `still`, `moodboard`, `render`, `tts` and `voices` need permission (Chromium, network for fonts and TTS); ask once, up front.

**Modes:** a new video from an idea; a video from material (script, article, notes, data, a URL: read it and find the one message and its beats); editing an existing composition (change it, re-probe what changed, re-render); adding narration or captions to one (write `narration.json` with segment ids = scene ids, drop fixed durations, pin hits with `s.when()`).

**Questions.** Ask only what changes the video, all in one round, in the user's language: usually length, format, voice, captions, and what you can't infer about the content (whose story, what must be remembered, brand). Give each question three concrete options with one marked **(Recommended)** and a one-line reason tied to this brief; the user can always answer in their own words. Confirm what the request already answers as assumptions instead of asking. If the user says "just make it" / "直接做", or doesn't answer, take your recommendations, list the assumptions in one short message and carry on.

## 2. Concept

Before choosing a style, find the video ([docs/craft.md](docs/craft.md) §1–2): three angles in one line each, the one you choose, the line worth repeating, the turn, and the visual device. For a long piece (over ~90 s), also the chapters (below).

## 3. Style frames (show, don't tell)

People can't describe the look they want, but they recognise it.
1. Read [STYLE_PRESETS.md](STYLE_PRESETS.md). Pick three directions: the best fit, a contrast, and a custom wildcard designed for this brief (or built from the user's brand). Mark one as recommended.
2. For each, `cv init .cv-previews/style-a --preset <slug> --ratio <ratio>` copies only the style (THEME, KIT helpers, transition, captions, overlay). Write the real opening scene of *this* video: the user's own hook, language, format and brand colours, using the device you found. `cv still .cv-previews/style-a --at 0.6,1.5,2.8 --sheet`.
3. Look at the sheets and fix them before anyone sees them. Write `moodboard.json` in each preview: `name`, a one-line `pitch`, `"recommended": true` on exactly one, `keywords`, a `motion` line and a `music` direction.
4. `cv moodboard .cv-previews/style-a .cv-previews/style-b .cv-previews/style-c --title "<their title>" --wait` opens a page with the three side by side (motion sample, key frames, palette, type, music) and returns the user's click. If their browser isn't on this machine, run it without `--wait` and send them the HTML; in a text-only UI, stack the sheets into one image with ffmpeg `vstack`. Without a click, ask which direction (or a mix, "A's colours with C's motion").

Previews must look like the real opening of their video: never "preview", "style A", preset names or notes on screen. Skip this step in quick mode, when the user already named a style, or when editing.

## 4. Brief and storyboard

Write `<project>/BRIEF.md` from the template in [docs/craft.md](docs/craft.md) §4 and show the storyboard (scene · voice line or music-only · picture · motion & sync · transition · energy · sfx · seconds), with the score in one line under it. Ask for a go-ahead (build it, change the script, change the visuals) unless in quick mode.

- The structure comes from this story, never from a preset's example video.
- Scenes on the voice: usually one sentence per scene, the payoff word at the end of the line.
- Plan silence: a music-only pre-roll, a breath before the payoff, an end card that rings out ([docs/music-and-sound.md](docs/music-and-sound.md) §5).
- **Duration:** ≈ 4.3 CJK characters/s or ≈ 2.5 English words/s, plus ~1 s per voiced scene (voice delay, decay, beat snapping), plus the music-only moments. Too long? Cut words, then scenes; don't speed up the voice.
- When a line is already on screen as type, give the scene `captions: 'file'` so it isn't shown twice.
- **Long videos** (over ~90 s): 3–6 chapters with an arc and a way to show where the viewer is (a chapter card or a corner tag drawn by `overlay`); a callback to the opening at the end; one `music.parts` entry per chapter with `part` on its first scene; a 4–8 beat music-only breath between chapters; the picture changes every 5–8 s. Budget ~1.2 s per voiced scene on top of the speech plus up to a bar per chapter (measured: 128 s of speech and 26 scenes → 182 s). See [examples/take-your-time](examples/take-your-time/BRIEF.md).

## 5. Build

1. `cv init <slug>-video --preset <chosen> [--ratio 9:16]` copies the style only. For a custom style, start from the nearest preset and rewrite THEME and KIT.
2. The KIT is a toolbox, not a menu: use what serves this story, change or delete the rest, and **write new helpers** for the moves this video needs. Open `presets/<slug>/video.html` only to see how a helper is called, then build your own scenes.
3. `narration.json`: segments = scene ids, the chosen voice and rate ([docs/narration-and-subtitles.md](docs/narration-and-subtitles.md)).
4. The score in `CV.create({ music: { … } })`: `bpm`, `key`, `mode`, `progression`, `layers` (each with its `from` energy), `lead`, `seed`, and an `energy` on every scene that follows the story ([docs/music-and-sound.md](docs/music-and-sound.md) §2). `cv music` refuses a spec that breaks a limit and says what to fix; fix its warnings too.
5. The scenes ([docs/runtime-api.md](docs/runtime-api.md)): `s.at(start, dur, ease)` for local moves, `s.when('spoken words')` to land hits on the voice, `s.onBeat(i)` for music-only moments, `fx.wordReveal({ sync: s })` and friends for type, `s.out()` and `exit:` for exits, `tail` for the hold after the last word. Several voices in a row (a dialogue, accents): one scene per clip joined by `cut`s over an identical layout. 3D only when depth carries meaning ([docs/three-d.md](docs/three-d.md)). Key symbols (⌘ ⌥ ⇧) are missing from most fonts: draw them.
6. `cv tts <project>`, then `cv music <project>` (key, BPM, energy per bar, the mix, every cut and sfx). `build/voice/<id>.json` shows how the words were tokenised.

## 6. Review (the loop that makes it good)

Follow [docs/craft.md](docs/craft.md) §3 at every stage. On the build:
- `cv still <project> --sheet --subs` renders three probes per scene (entering, middle, settled) on contact sheets of six scenes; open every page. Judge them as a design lead would, check the mechanical list ([docs/motion-design.md](docs/motion-design.md) §9), rebuild the weakest scene, re-probe with `--scenes a,b` or `--scenes a..c`. At least two passes.
- Read each signature move as a filmstrip: `cv still <project> --at <6–8 close times> --sheet`.
- For long pieces, render a draft (`cv render --scale 0.5 --format jpeg`) and check a chapter at full size with `--from/--to`. A full 1080p render takes about twice the video's length on 4 cores.

## 7. Render and verify

```bash
cv render <project> --subs burn      # or file | soft | burn+soft | none
#   --motion-blur 5 (snappy moves)   --music track.mp3 (licensed, replaces the score)   --no-music   --scale 2 (4K)
```

The render ends with `cv check`. Confirm and report: duration, fps, resolution; audio present and matching the video (±0.1 s); captions (count, no overlaps, last cue inside the video); A/V sync (median < 120 ms) and per-clip voice sync (< 20 ms typical); music 10–18 dB under the voice while it speaks and ≈ −2…−6 dB in the gaps (adjust `music.volume`, `duck`, `gap`). Then pull 3–5 frames from the MP4 (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 f.png`) at key moments and look at them. Never claim a check you didn't run.

## 8. Deliver and iterate

Tell the user the MP4 (and .srt/.vtt) paths, length, format, voice and style; the check results in a line each; the score in one line (feel, reference, BPM, key, the hook). Say honestly which part you think is weakest. You can't hear the audio, so ask them to listen and tell you which part of the music or sound is off. Mention how to tweak (open `video.html`: Space plays, ←/→ steps frames; colours and fonts in `T`; words in `narration.json`) and the natural next steps: one note at a time, another ratio, a GIF (`cv gif`), 4K (`--scale 2`). Clean up `.cv-previews/` once a style is picked.

---

## Files

| File | What | When |
|---|---|---|
| [docs/craft.md](docs/craft.md) | Story, picture, the review loop, the brief template | Before the concept; at every review |
| [STYLE_PRESETS.md](STYLE_PRESETS.md) | The 13 styles: look, palette, type, motion character, KIT | Step 3 |
| [docs/motion-design.md](docs/motion-design.md) | Motion language: easing, principles, camera, transitions, type, mechanical checks | Before building; when reviewing |
| [docs/music-and-sound.md](docs/music-and-sound.md) | Score direction, the spec and its limits, parts, sfx, pacing, mix | Concept, brief and build |
| [docs/narration-and-subtitles.md](docs/narration-and-subtitles.md) | Voices, writing for the ear, captions, troubleshooting | Brief and build |
| [docs/runtime-api.md](docs/runtime-api.md) | `CV.create`, scenes, timing, fx, text, transitions, captions | Build |
| [docs/three-d.md](docs/three-d.md) | three.js in a composition | When a scene needs depth |
| `presets/<slug>/video.html` | A style's THEME and KIT, plus an example video that shows the helpers in use | Build, to see how a helper is called |
| [examples/take-your-time](examples/take-your-time/BRIEF.md) | A three-minute piece with a strong brief | Long videos; what a good brief looks like |
| [docs/tech-selection.md](docs/tech-selection.md), [docs/prompt-templates.md](docs/prompt-templates.md) | Why this stack; prompts people have used (for users) | Only when asked |
| `scripts/cv.mjs` | `doctor · init · tts · music · still · moodboard · render · check · gif · voices` | Always via the commands above |
