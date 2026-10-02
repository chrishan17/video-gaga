# Motion design guide

This is the bar every video-gaga composition must clear. Read it before you write a single `draw()`.

> **Motion exists to direct attention and explain change.** If you can't say what a move tells the viewer, it doesn't belong in the video. A cool move that serves the content is great. A cool move that exists only to be cool is noise.
>
> **But don't be timid.** A video where every scene is "text fades in, holds, gets pushed off" is monotonous. Give each video one or two signature moves that make it memorable *and* explain something: a camera that follows the head of a growing line, an iris that opens from the key number, a match cut, a 3D turn that shows the back of the product, a list that lands on the beat.

---

## 1. The five questions (answer before animating)

1. **What is the one idea of this scene?** One scene, one idea. If you need "and", you need two scenes.
2. **Where should the eye be, second by second?** At any moment, exactly one element should be the focus. Everything else is quieter (smaller, dimmer, still).
3. **In what order does the viewer need the information?** Reveal in *reading and causal* order: the subject before the detail, the cause before the effect, the question before the answer, the axis before the data.
4. **What changes, and why?** Every animated property should map to a real change: arrival, emphasis, transformation, relationship, or departure.
5. **When does it land?** Tie every important visual hit to a beat: a spoken word, a music beat, or the end of the previous move.

---

## 2. Easing — the texture of motion

Nothing in the real world starts or stops instantly. Pick easing by *intent*, not by habit:

| Intent | Easing (runtime name) | Curve | Notes |
|---|---|---|---|
| Element **arrives** and settles | `ease.enter` | `cubic-bezier(.05,.7,.1,1)` | Fast in, long gentle settle. Default for reveals. |
| General UI or graphic **move** A→B | `ease.standard` | `cubic-bezier(.2,0,0,1)` | Quick start, soft landing. |
| Element **leaves** | `ease.exit` | `cubic-bezier(.3,0,.8,.15)` | Accelerates away. Exits are ~30% shorter than entrances. |
| **Punchy** scene move, camera push, cut-on-action | `ease.swift` | `cubic-bezier(.55,0,.1,1)` | Strong anticipation, then a snap. |
| Ambient drift, breathing glows | `ease.gentle` / `inOutSine` | symmetric | Slow and low amplitude. Never the main event. |
| Physical objects, UI toggles | `CV.spring(spring.presets.snappy)` | closed-form spring | Use `smooth` for no overshoot. Use `bouncy` rarely. |
| Constant motion (tickers, scrolling grids, clocks) | `linear` | — | Only for things that are *meant* to be mechanical. |

**Do**
- Match easing to the metaphor: heavy things (`heavy` spring) move slowly and settle long, light UI snaps.
- Keep one easing family per video so the motion has a consistent "hand".
- For values that change target several times, use `CV.springTrack` (a sum of springs). It stays a pure function of time.

**Don't**
- `linear` on things that arrive or leave. It reads as a computer, not as design.
- Elastic or bounce easing on text or data. Overshoot on a number makes it look wrong.
- Easing in *and* out on every element. Arrivals decelerate and departures accelerate.

---

## 3. Timing — durations that feel right

At 30 fps, one frame is 33 ms. Durations scale with distance and size:

| Move | Duration |
|---|---|
| Micro feedback (tick, highlight, underline) | 150–250 ms |
| Small element enters (label, icon, caption word) | 250–400 ms |
| Headline line reveal | 500–800 ms |
| Large element or panel moves across frame | 600–900 ms |
| Scene transition | 400–800 ms (cuts: 0) |
| Camera push-in over a hold | the whole shot (slow, 2–6% scale) |

- **Stagger** related items by 40–90 ms (characters 30–60 ms, list rows 80–140 ms). Staggers longer than 150 ms read as separate events.
- **Hold.** After an information beat lands, hold it for **at least 1.0 s** (1.5 s+ for numbers and charts) before anything competes with it. The viewer needs time to read. Use `tail` on scenes so the last beat isn't cut off.
- **Reading time.** Budget ≈ 4–5 CJK characters/s or ≈ 3 English words/s of on-screen text that isn't also being spoken.
- **The first second matters.** Something meaningful must be visible or moving by 0.3 s. Social verticals need the hook in the first second.
- Total length: say it in the shortest time that still breathes. Cut words before you speed up the voice.

---

## 4. Rhythm & pacing

- **Build on a beat grid.** Set `music: { bpm, … }` and the runtime puts every cut and every voice onset on the grid. Inside a scene, the words are the fine grid (`s.when('word')`) and the beats are the coarse one (`s.onBeat(i)`, `s.nextBeat(t)`): voiced hits follow the words, music-only moves follow the beats.
- **Vary density.** Alternate fast clusters (a burst of 3 hits) with rests (a hold, a slow push). Constant intensity feels flat. Raise the scene `energy` where the story climbs and drop it before the payoff.
- **Leave room.** Plan music-only moments: a pre-roll before the first word, a held beat after the big number, an end card that rings out. See [music-and-sound.md](music-and-sound.md) §5.
- **Cut on action.** Start a transition while something is moving, not after everything has stopped dead.
- **Exits.** Every element that enters should leave in a way that matches its entrance (rise in → rise out, draw on → draw off, or simply stay and be carried by the transition). Use `s.out(d, ease.exit, overlap)` to drive exits in the last moments of a scene. Secondary elements (kickers, footnotes, labels) leave first, 0.3–0.5 s before the cut; the hero is carried by the transition. Exits are ~30% faster than entrances.
- **Beat accents are seasoning.** `s.pulse()` may breathe a dot, a glow or a cursor on the beat. Never pulse whole layouts or text.
- **End on a still.** The final frame is a poster: the logo or conclusion fully resolved, held ≥ 1 s while the final chord rings.

---

## 5. Hierarchy — one focus at a time

- **Scale, weight, colour, motion, position** are the levers. Motion is the loudest, so when something new moves in, everything else should be still.
- **Subtract to emphasise.** Dim what's already been said (see the Swiss preset's final ledger, where nine rows recede and row 10 turns red). This is stronger than enlarging the new thing.
- **Accent colour is a pointer.** Use it for *the one thing*: the number, the answer, the brand. If everything is accent-coloured, nothing is.
- Text sizes on a 1080p frame: headline 90–160 px, key number 150–260 px, body 40–56 px, labels 24–32 px (mono or tracked caps). Nothing below 24 px.
- **Safe areas.** Keep critical content inside 90% of the frame (title-safe). Keep captions clear of content: bottom 10% for 16:9, and for 9:16 keep the lower 18% and right 12% clear for platform UI.

---

## 6. Camera language

A virtual camera (`CV.draw.camera`) turns a flat layout into a shot:

| Move | Meaning | How |
|---|---|---|
| **Push-in** (slow zoom 1.00→1.05 over a hold) | importance, intimacy, "look closer" | `zoom: lerp(1, 1.05, s.p)` |
| **Arrive-push** (0.9→1 on entry) | the hero appears | `ease.enter`, 1–1.5 s |
| **Pan / track** | move to the next item in space, show that items are related | translate the camera, not every element |
| **Pull-out** | reveal context, "the bigger picture" | zoom < 1 at the end of a sequence |
| **Match cut** | continuity: shape A becomes shape B | end A and start B with the same shape in the same place (Swiss: the square becomes the full stop) |
| **Whip / push transition** | energy, sequence | `push` transition with `ease.swift` |

Keep camera motion slow relative to content motion. Never shake the camera for "energy" unless the story is literally an impact.

---

## 7. Transitions — each one means something

| Transition | Use it when | Avoid when |
|---|---|---|
| **Cut** | the default. On a beat, between related shots, anything energetic | — |
| **Fade / crossfade** | time passes, mood shifts, the ending | between every scene (it turns mushy) |
| **Dip to black/colour** | a chapter break, a reveal after a hook | fast sequences |
| **Push / slide** | sequential steps, "next" | unrelated topics |
| **Whip** (`whip`) | a fast "next" with motion blur: social, energetic lists | calm pieces, more than every other cut |
| **Wipe** | a graphic, editorial energy (angled, with a colour edge) | calm pieces |
| **Stripes** (`stripes`) | brand-coloured bands sweep the frame: pop, promos | serious topics |
| **Blinds** (`blinds`) | structured, typographic, grid-based styles | organic styles |
| **Split** (`split`) | the old frame opens onto a reveal (doors) | sequences |
| **Clock** (`clock`) | time passing, a process cycle | more than once |
| **Iris** | a focus point grows into the next scene (open from the key number) | more than once per video |
| **Ink / dissolve** | organic spread, memory, an idea taking hold | crisp tech pieces |
| **Zoom through** (`zoom`, `zoomBlur`) | going "into" something (an idea, a product) | lateral moves |
| **Cube / flip** | rotating to the next face of a topic, a before/after card | more than one per video |
| **Light leak** (`flash`) | warmth, a premium reveal, film looks | data, UI |
| **Glitch / pixelate** | digital or cyber aesthetics only, ≤ 0.4 s | anything serious or calm |
| **Custom (paper slide, morph)** | the style has a physical metaphor | if it costs readability |

Use **one or two** transition types per video, plus at most one special for the single most important change (for example an iris out of the payoff number). Consistency is style. With music on, every transition plays its natural sound at its midpoint, which lands on the beat.

---

## 8. Information reveal order

- **Frame, then content.** Axes before data. Container before items. Question before answer.
- **Build equations term by term** on the spoken words (the explainer's `72 ÷ 8% = 9`).
- **Draw lines in reading direction** (left→right, top→bottom), and draw charts in the direction time flows.
- **Numbers count up** over 0.6–1.2 s with `ease.outQuart`, then hold. Show units and labels *with* or *after* the number, never before it.
- **Label on arrival.** A marker gets its label as it appears, not in a batch at the end.
- **Never reveal what you'll immediately hide.** If it's on screen, it should matter.

---

## 9. Typography in motion

- Animate **lines or words, not letters**, for anything longer than a short title. Per-character reveals are for a hero word.
- **Mask reveals** (text rising out of an invisible box, `fx.lineReveal`) look designed. Plain fade-ins look default.
- **Tracking animation** (wide → tight) is a strong move for a single display word.
- **CJK:** use `CV.text.wrap` (kinsoku-aware, never starts a line with `，。！？`). Don't letter-space Chinese body text. Chinese headlines hold 8–12 characters per line at 110–150 px.
- Use font weights for hierarchy (900/700/400). Two families maximum: display + mono/label.
- Specify the webfonts in `<link>`. The runtime waits for every font and glyph actually drawn. The render warns if a font fell back.

---

## 10. Colour & atmosphere

- **One dominant field, one accent, one neutral.** Add a second accent only if it has a job (for example coral = the point, teal = the evidence).
- Add depth with gradients, vignettes and a touch of grain (`draw.grain` 0.03–0.06), not with drop shadows everywhere.
- Grain also prevents gradient banding after H.264 compression.
- Light and dark themes are both valid. Choose by content and mood, not by default.

---

## 11. Sound ↔ picture

- **Narration drives the timeline.** Scene duration comes from the voice (`voiceDelay + speech + tail`). Never cut a voice line mid-word.
- **Sync visual hits to words** with `s.when('phrase')`: the number counts up *as it is said*, the term appears *as it is named*. A visual may lead the word by 0–150 ms (the eye is faster than the ear). It should never trail by more than 200 ms.
- Leave 150–300 ms of air before the first word of a scene, and 400–800 ms after the last one.
- **Music is on by default.** You design a score for each video (`music: { bpm, key, mode, progression, layers, lead }`) and it is arranged from the timeline: it dips 12 dB under speech, plays its melody only in the gaps, crashes into rising sections and resolves on the last downbeat. Design it from the content's emotion, not from the visual preset. See [music-and-sound.md](music-and-sound.md) §2.
- **Sound effects mark what matters**: transitions whoosh, counted items tick, the one big reveal gets a `hit` (the music breathes for half a beat before it). Never put a sound on every element.
- Balance: the bed sits 10–18 dB under the voice while it speaks. `cv render` measures it.

---

## 12. Captions (subtitles)

- Burned-in captions are part of the design. Use the preset's typography, keep contrast ≥ 4.5:1 (box or stroke), and place them consistently.
- One line of CJK per cue (≤ 18 characters for 16:9, ≤ 12 for 9:16). English ≤ 42 characters per line.
- Chinese captions drop commas and full stops (spaces instead) and keep `？！`.
- A cue must be on screen ≥ 0.8 s and must never overlap with the next cue.
- Karaoke highlight (word-level) suits social shorts. Plain captions suit explainers and brand pieces.
- Don't say the same words twice on screen. When the narrator's line is already set as type (a title question, the closing tagline), or the picture already shows what is heard, the type replaces the burned caption. Use `captions: 'file'` so the line still reaches the .srt/.vtt.

---

## 13. Anti-patterns ("motion slop") — do not ship

- ❌ Everything fades in at once from opacity 0 over 1 s, with the same ease and the same delay.
- ❌ Constant floating/bobbing of every element "to feel alive".
- ❌ Particle bursts, lens flares, shockwave rings, RGB split, camera shake, used as decoration.
- ❌ Bouncy or elastic easing on text, numbers or UI chrome.
- ❌ Crossfades between every scene. Random transition types in one video.
- ❌ Neon-glow-on-dark as a default, or purple→blue gradients as a default. Choose them only if the brief calls for them.
- ❌ Text on screen for less time than it takes to read it, or text that's never given focus.
- ❌ Numbers that never hold, or charts without axes and units.
- ❌ Visuals that ignore the narration (the chart draws before the voice mentions it, or long after).
- ❌ Dead air at the end, or cut-off voice at the end.
- ❌ Wall-to-wall narration with no music-only moment, or a dry voice with no music bed.
- ❌ Scenes that only enter and hold, then get shoved off: no exits, no cut on action.
- ❌ Everything pulsing to the beat, or a sound effect on every element.
- ❌ 3D for decoration (a spinning logo that could be flat).
- ❌ More than 3 flashes per second, or big full-screen luminance flicker (photosensitivity).
- ❌ Internal words on screen: "Scene 1", "Title here", "preset", "Option A", placeholders.

## 14. Quality checklist (run on the probes before the full render)

- [ ] Each scene has one clear focal point in every probe frame.
- [ ] Nothing overlaps unintentionally, and no text collides with the caption zone.
- [ ] Every word on screen is readable at the probe's size and holds long enough.
- [ ] Visual hits land on their spoken words (check `when()` targets).
- [ ] Transitions are consistent, the cut lands on action, and the last frame is a resolved still.
- [ ] Secondary elements exit before the cut; nothing pops off abruptly.
- [ ] At least one music-only moment; `cv music` shows energy rising and falling with the story.
- [ ] The render reports the music 10–18 dB under the voice and sync < 120 ms median.
- [ ] Fonts loaded (no fallback warning) and CJK line breaks are clean.
- [ ] The video fits the requested length, and the voice isn't rushed.
