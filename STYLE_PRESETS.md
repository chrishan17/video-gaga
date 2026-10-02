# Style presets

Five motion-design systems, each shipped as a working composition in `presets/<slug>/video.html` (with `narration.json` where voiced). **Read this index first. Read a preset's full `video.html` only after the user has picked it**, then treat that file as the design recipe: its palette, type, motion grammar and transitions. For a Phase 2 preview, read only its `THEME` object and first scene.

Every preset exposes a `THEME` / `T` object at the top (colours and fonts) so it can be re-branded without touching the motion code.

| Mood the user wants | Suggested presets |
|---|---|
| Impressed · premium · "launch" | Launch Keynote, Swiss Kinetic |
| Understand · learn · trust the numbers | Clear Explainer, Paper Sketch |
| Excited · hype · social | Neon Circuit, Swiss Kinetic |
| Warm · friendly · human | Paper Sketch, Clear Explainer |
| Bold · design-led · editorial | Swiss Kinetic, Launch Keynote |

---

## 1. Launch Keynote — `launch-keynote`

<img src="docs/media/launch-keynote.jpg" width="480" alt="Launch Keynote">

- **Vibe:** dark stage, one hero object, and light as the storyteller. Calm confidence.
- **Best for:** product launches, feature reveals, teasers, investor or event openers.
- **Avoid for:** playful or kids content, dense data.
- **Format:** 16:9 · 15–30 s · narration (EN: AndrewNeural −4%; ZH: YunyangNeural)
- **Palette:** `#050506` stage · `#F5F5F7` ink · `#86868B` dim · one accent `#4D7CFF` (swap for the brand)
- **Type:** Geist 600/800 display (tight tracking) · Geist Mono labels in tracked caps
- **Motion signature:** hairline of light opening · masked line reveals · specular sweep across the product name · slow camera arrive-push (0.9→1) and drift · a core grid lighting up in a radial wave · numbers counting on the spoken word
- **Transitions:** zoom-through into the reveal · push-up into specs · fade to the end card
- **Captions:** small, boxed, low-contrast box
- **Pacing:** medium-slow. Hold the hero, let it breathe.

## 2. Clear Explainer — `clear-explainer`

<img src="docs/media/clear-explainer.jpg" width="480" alt="Clear Explainer">

- **Vibe:** a well-edited explainer channel. Warm paper, ink type, functional colour.
- **Best for:** knowledge and science explainers, finance and data stories, how-it-works, onboarding, internal training.
- **Avoid for:** luxury and mood pieces.
- **Format:** 16:9 · 20–60 s · narration (ZH: YunxiNeural +6–10%; EN: AvaNeural)
- **Palette:** `#F3EFE6` paper · `#1D2433` ink · `#6B7180` muted · coral `#E4572E` = *the point* · teal `#1B998B` = *the evidence*
- **Type:** Noto Sans SC 900/700/500 · DM Mono for labels, axes and kickers
- **Motion signature:** chapter progress bar · kicker `01 / 04` · highlighter pill growing behind the key term · equations assembling term by term on the words · axes → grid → a curve drawn in time order, with markers popping as the line passes · a live value riding the head of the line · a calculation footnote
- **Transitions:** push-left (sequential chapters) only
- **Captions:** ink box, paper text, 42 px
- **Pacing:** steady. Every visual appears on the word that introduces it.

## 3. Swiss Kinetic — `swiss-kinetic`

<img src="docs/media/swiss-kinetic.jpg" width="320" alt="Swiss Kinetic">

- **Vibe:** International Typographic Style in motion. Grid, one red, type as image.
- **Best for:** quotes, manifestos, brand principles, event titles, social squares, typographic intros.
- **Avoid for:** long narration, dense explanation.
- **Format:** 1:1 (also 16:9 and 9:16) · 8–15 s · usually no voice (optionally music, cut on the beat)
- **Palette:** `#F2F0EB` paper · `#111111` ink · `#E62E2D` red (one red, always)
- **Type:** Archivo 900/700/500 · huge display sizes, negative tracking, tracked caps labels
- **Motion signature:** 12-column grid drawing on · snap easing `bezier(.7,0,.1,1)` · a word slamming up from a mask on the beat · inverted field for contrast · tracking closing in on the key word · **match cut** (the red square becomes the full stop) · hierarchy by subtraction (everything else recedes)
- **Transitions:** hard cuts on the beat · push-up at most. No fades.
- **Captions:** none, or bottom-left in Archivo 500 caps
- **Pacing:** 100 BPM beat grid (0.6 s); something happens on every beat or half-beat.
- **Render tip:** `--motion-blur 5` for the snaps.

## 4. Neon Circuit — `neon-circuit`

<img src="docs/media/neon-circuit.jpg" width="220" alt="Neon Circuit">

- **Vibe:** night city, CRT and HUD. Energy with discipline.
- **Best for:** hackathons, gaming, esports, dev tools, event promos, music drops. **Vertical social shorts.**
- **Avoid for:** finance, healthcare, calm or luxury.
- **Format:** 9:16 · 12–20 s · narration (ZH: YunjianNeural; EN: GuyNeural or BrianNeural +6%)
- **Palette:** `#07060D` ink-violet black · magenta `#FF2E88` = energy · cyan `#00E5FF` = information · `#EDEBFF` text · `#5B5875` dim
- **Type:** Chakra Petch 700/500 (Latin, numerals) · ZCOOL QingKe HuangYou (Chinese display) · Noto Sans SC 900 captions
- **Motion signature:** hook in the first second (a ticking clock) · RGB split that fires *on the hit* and decays within 6 frames · slide-in numerals on the beat · perspective floor grid · seeded skyline with blinking windows · terminal typewriter · neon-tube flicker-on (seeded, deterministic) · scanlines + HUD corners + REC dot + timecode
- **Transitions:** glitch (0.4 s, magenta tint) only
- **Captions:** big (68 px), outlined, **karaoke highlight** in cyan, baseline at 80% height (clear of platform UI)
- **Pacing:** fast. A hit every 1–1.5 s.

## 5. Paper Sketch — `paper-sketch`

<img src="docs/media/paper-sketch.jpg" width="480" alt="Paper Sketch">

- **Vibe:** a friendly teacher drawing on paper. Warm, handmade, patient.
- **Best for:** education, habits and self-improvement, kids, onboarding, "how it works" for non-technical audiences, internal culture.
- **Avoid for:** premium tech launches, anything that must feel precise and corporate.
- **Format:** 16:9 · 15–45 s · narration (ZH: XiaoxiaoNeural +0–4%; EN: EmmaNeural)
- **Palette:** `#F1E9D8` paper (with fibre texture + edge vignette) · `#2B2A28` pencil ink · marker `rgba(255,216,77,.75)` (multiply) · watercolour red `#D1495B`, green `#4F8A4B`, blue `#3D6FB6`
- **Type:** ZCOOL KuaiLe (titles) · Long Cang (handwritten notes) · Caveat (Latin annotations) · Noto Sans SC captions
- **Motion signature:** strokes drawn in the order a hand would draw them · **boiling lines** (the jitter re-seeds every 3 frames, i.e. animated on threes) · watercolour washes fading in after the outline · highlighter swipe under the key term · hand-drawn arrows with late arrowheads · a ringing bell with decaying rotation
- **Transitions:** custom **page slide** (a new sheet slides over with a soft shadow and a slight rotation)
- **Captions:** cream paper box, ink text
- **Pacing:** relaxed. Draw on the word, then hold.

---

## Custom / wildcard styles

If none fits, design a custom system and offer it as the wildcard in Phase 2. It needs:
1. A **visual thesis** in one sentence ("a museum wall label that comes alive").
2. A committed palette (1 field, 1 accent, 1 neutral) and a type pairing (display + label). No Inter/Roboto/Arial defaults. Don't reach for purple gradients or neon-on-dark unless the brief asks.
3. A **motion grammar**: signature easing, 3–4 signature moves, 1–2 transition types, a caption style.
4. One recognisable atmospheric device (grain, paper, scanlines, grid, light).

Start from the closest preset's `video.html` and change the grammar, not just the colours.

## Adapting a preset to another aspect ratio

`cv init <dir> --preset <slug> --ratio 9:16` rewrites `width`/`height`. Then re-lay out using `s.W`, `s.H` and `s.u`:
- **16:9 → 9:16:** stack horizontal rows vertically, bring content toward the centre (40–60% of the height), put captions at 0.78–0.8 H, raise type sizes about 1.2× relative to width, and keep the lower 18% free of key content.
- **→ 1:1:** a tighter grid, fewer items per scene, and bigger type.
