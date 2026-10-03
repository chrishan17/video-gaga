# Motion design

Motion does two jobs: it tells the eye where to look and what changed, and it gives the piece life and a character of its own. The two don't conflict. A slow push during a hold has a job (it keeps the shot alive while the viewer reads), and so does a word that slams up from a mask (it says "this one"). What has no job is motion added because a frame felt empty: wobbling text, random particles, everything pulsing to the beat. A frame that feels empty usually needs a better idea, not more movement.

Aim for motion that looks designed by a person with taste: a clear focal point, layers moving at different speeds, moves with weight and timing, cuts on action. Look at studio work you admire and ask how they would move this.

## 1. Before you animate a scene

- **What is the one idea, and where is the eye, second by second?** One focal point at a time; everything else is quieter (smaller, dimmer, slower).
- **In what order does the viewer need things?** Subject before detail, cause before effect, question before answer, axis before data.
- **What changes, and why?** Every animated property maps to a change in meaning: arrival, emphasis, transformation, relationship, departure.
- **When does it land?** On a spoken word (`s.when('word')`), on a beat (`s.onBeat(i)`), or on the end of the previous move.
- **How does it leave?** Secondary elements leave before the cut (`s.out()`, `exit:` on reveals), so the cut happens on action. A scene that is only shoved off by the next one feels like a slideshow.

## 2. Easing: the hand of the video

| Intent | Runtime name | Feel |
|---|---|---|
| arrives and settles | `ease.enter` | fast in, long settle. The default for reveals |
| moves A → B | `ease.standard` | quick start, soft landing |
| leaves | `ease.exit` | accelerates away; exits are shorter than entrances |
| snap, push, cut on action | `ease.swift` | anticipation, then a snap |
| ambient drift, breathing light | `ease.gentle`, `inOutSine` | slow, low amplitude, never the main event |
| physical objects | `CV.spring(spring.presets.…)` | real weight and overshoot; `CV.springTrack` for a value that re-targets |
| mechanical things | `linear` | tickers, clocks, conveyor grids only |

Choose one family per video so the motion has a consistent hand. Heavy things move slowly and settle long; light things snap. Overshoot belongs to objects and titles, not to numbers or data, which look wrong when they wobble.

## 3. Principles that make motion feel made

- **Anticipation and follow-through.** A small move against the direction before a big one; a settle, a lag or a secondary wobble after it. This is the difference between an object and a rectangle.
- **Overlap and cascade.** Related elements arrive staggered, with parts of one object trailing the lead part. A cascade of three layers reads as one rich moment; three separate events read as clutter. Stagger tightly (tens of milliseconds) so they belong together.
- **Contrast of speed.** Fast against slow is what gives rhythm: a quick hit, then a long drift; a burst of three cuts, then a held shot. Constant speed is flat.
- **Arcs.** Natural motion travels on curves. Straight-line moves read as UI.
- **Depth.** Build shots from layers (background, supporting shapes, the hero, small accents) that move at different rates, so even a hold has parallax.
- **Holds are alive, not frozen.** During a hold the camera still drifts, light moves, texture breathes. Only the final poster frame sits perfectly still.
- **Signature moves.** Give each video a few moves that are its own and that explain something: the camera following the head of a growing line, an iris opening out of the key number, a match cut where one shape becomes the next, the visual device ([craft.md](craft.md) §2) transforming. These are what people remember.

## 4. Readability

Motion is wasted if the viewer can't read what lands.
- Something meaningful is visible or moving within the first ~0.3 s; vertical social video needs the hook in the first second.
- Hold every information beat at least ~1 s after it lands (longer for numbers and charts) before anything competes with it. Use `tail` so the last beat isn't cut off.
- On-screen text that isn't spoken needs reading time: roughly 4–5 CJK characters or 3 English words per second.
- Nothing smaller than ~24 px on a 1080p frame. Keep critical content inside the title-safe 90%, and clear of the caption zone (bottom ~12% at 16:9; the lower 18% and right 12% at 9:16 for platform UI).

## 5. Camera

A virtual camera (`CV.draw.camera`) turns a layout into a shot. Keep camera motion slower than content motion, but keep it moving.

| Move | Says |
|---|---|
| push-in over a hold | importance, intimacy, "look closer" |
| arrive-push on entry | the hero appears |
| pan / track | the next item is related, in the same space |
| pull-out | context, the bigger picture |
| parallax drift | depth and life |
| match cut | continuity: shape A becomes shape B |
| a short, damped shake | a literal impact, once |

## 6. Cuts and transitions

A cut on the beat is the default and almost always works. Every other transition says something, so choose it for what it says and keep the vocabulary small (one or two types, plus at most one special move for the biggest change). The full list is in [runtime-api.md](runtime-api.md#transitions).

| Transition | Says |
|---|---|
| `cut` | the default: energy, continuity, anything on a beat |
| `fade` / dissolve | time passes, a mood shifts, the ending |
| `dip` to black or colour | a chapter break, a reveal after a hook |
| `push`, `whip` | next, in sequence (whip: with energy) |
| `wipe`, `stripes`, `blinds` | graphic and editorial energy, a grid |
| `iris` | a focus point grows into the next scene (once) |
| `ink`, dissolve | memory, an idea spreading |
| `zoom`, `zoomBlur` | going into something |
| `split` | the frame opens onto a reveal |
| `flash` light leak | warmth, a premium reveal |
| `glitch`, `pixelate` | digital worlds only, short |
| custom (a paper slide, a morph, a handscroll) | the style's own physical metaphor |

With music on, each transition plays its natural sound at its midpoint, which lands on the beat.

## 7. Type in motion

- Animate lines or words for anything longer than a title; per-character reveals are for a hero word.
- Mask reveals (`fx.lineReveal`), scale and blur arrivals, tracking that closes in on one word, a highlighter or underline that draws on: these look designed. A plain opacity fade looks default.
- Reveal words as they are spoken (`fx.wordReveal({ sync: s })`). Numbers count up (`fx.countUp`, `fx.roll`) and then hold, with the unit arriving with or after the number.
- CJK: wrap with `CV.text.wrap` (kinsoku-aware), don't letter-space body text, and prefer short lines with a deliberate break.

## 8. Sound and picture

- The voice sets the clock. Visual hits are pinned to their words; a visual may lead the word slightly (the eye is faster than the ear) but should not trail it.
- The music sets the pulse. Cuts and the first syllable of every line land on the grid; music-only moves follow the beats. Let the energy of the motion follow the score's energy.
- Beat accents are seasoning: a dot, a glow or a cursor may pulse; whole layouts and text never do.
- Sound effects mark what matters: a transition, a counted item, the one big reveal. Not every element.

## 9. Mechanical checks (on the probe sheets)

These catch broken output. Taste is judged separately ([craft.md](craft.md) §3).
- [ ] One clear focal point in every probe frame; nothing overlaps by accident; no text in the caption zone.
- [ ] Every word on screen is readable at the probe's size and holds long enough to read.
- [ ] Visual hits land on their spoken words (check the `when()` targets).
- [ ] Nothing internal on screen: no "Scene 1", "Option A", preset names, placeholders or file names.
- [ ] Secondary elements leave before the cut; nothing pops off abruptly.
- [ ] The middle probe of each scene shows motion in progress.
- [ ] The last frame is a resolved still held ≥ 1 s.
- [ ] Fonts loaded (no fallback warning); CJK line breaks are clean.
- [ ] No more than 3 flashes per second and no big full-screen luminance flicker (photosensitivity).
