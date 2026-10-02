# Music, sound & pacing

A voice alone sounds dry, and wall-to-wall narration is tiring. video-gaga gives every composition a **soundtrack that is arranged from its own timeline**. The music, the cuts and the motion share one clock (the beat grid), and the score leaves room for the voice and fills the moments where nobody speaks.

Everything is generated locally by [`scripts/music.mjs`](../scripts/music.mjs): pure JavaScript, seeded and deterministic, with no samples, no licences and no network. You can still bring a licensed track with `--music file.mp3`.

## 1. Turn it on

```js
CV.create({
  music: { style: 'explainer', bpm: 100, seed: 3 },  // the beat grid + a generated score
  scenes: [
    { id: 'hook', voiceDelay: 2.1, energy: 0.35, draw … },            // one bar of music before the first word
    { id: 'curve', energy: 0.6, sfx: [{ at: 'ten', type: 'tick' }], draw … },
    { id: 'breath', narration: false, beats: 6, energy: 0.8, draw … }, // music-only beat: let the result land
    { id: 'end', tail: 1.6, energy: 0.45, draw … },                    // the final chord rings out with the end card
  ],
});
```

`cv render` synthesizes the score (cached in `build/music.wav`), mixes it with the voice and checks the balance. `cv music <project>` renders only the score, so the preview player can play it, and prints the arrangement: key, BPM, energy per bar, the cut times and every sound effect.

| `music` key | Default | Meaning |
|---|---|---|
| `style` | — | One of the styles below, or `'none'` (sound effects only) |
| `bpm` | the style's tempo | The beat grid. Every cut and the first syllable of every line snaps to it |
| `beatsPerBar` | 4 | |
| `snap` | `'beat'` | Where cuts land: `'beat'`, `'half'`, `'bar'` or `false`. Scenes can override with `snap` |
| `voiceOnBeat` | true | Start every voice line on an eighth note |
| `seed` | 1 | Change it to hear a different melody and voicing in the same style |
| `key` | the style's key | e.g. `'F'`, `'Bb'` (the mode comes from the style) |
| `energy` (per scene) | an arc | 0..1. Low = pad only, high = full groove. Default: quiet open, fuller middle, settled end, with music-only scenes a little higher |
| `duck` | −12 | How many dB the bed dips while someone speaks (the melody dips a further 12 dB) |
| `gap` | 7 | How many dB the music-only passages sit under the voice's speech level. The renderer measures the actual voice, so every voice gets the same balance |
| `volume` | 1 | A gain on top of that (`1.4` ≈ +3 dB) |
| `sfx` | true | Transitions play their natural sound |
| `ending` | `'resolve'` | `'resolve'` lands the tonic chord on the last downbeat and lets it ring. `'none'` lets the groove run to the end |
| `file` | — | A licensed track instead of the generated score (side-chain ducked, faded) |

## 2. Styles

| Style | BPM · key | Sound | Fits |
|---|---|---|---|
| `keynote` | 92 · A minor | dark pad, pulsing sub-bass eighths, sparse deep kick, echoing keys | launches, product reveals, 3D hero shots |
| `explainer` | 100 · D major (7ths) | FM electric-piano stabs, warm bass, rim + shaker groove, glockenspiel melody | knowledge, how-it-works, data, onboarding |
| `kinetic` | 104 · E dorian | marimba ostinato in 16ths, four-on-the-floor, claps on 2 & 4 | typography, manifestos, brand principles |
| `synthwave` | 112 · F♯ minor | 16th saw bass, plucked arpeggios, big snare, saw lead with delay | gaming, dev tools, events, night/neon |
| `acoustic` | 96 · G major | fingerpicked strings (Karplus–Strong), snaps, shaker, glockenspiel | education, habits, kids, friendly brand |
| `ambient` | 76 · C lydian (9ths) | slow sine pads, a few soft piano notes, celesta, no drums | data stories, calm, science, wellness |
| `pop` | 116 · C major | syncopated plucks, bouncing octave bass, claps, open hats | social shorts, promos, colourful brand |
| `documentary` | 84 · D minor | low string pad, pulsing plucks, piano, heartbeat toms | essays, history, journalism, serious topics |

**Choosing.** Match the *content's* emotion, not the visual style alone. A product launch filmed in a calm way may want `ambient` more than `keynote`. When unsure, ask in Phase 1 with three options (one recommended), the way you ask about voices.

## 3. How the score follows the video

- **One clock.** The runtime moves every cut so that the middle of the transition lands on a beat, starts each voice line on an eighth note, and ends the video on a beat. Draw code reads the same grid: `s.onBeat(i)`, `s.nextBeat(t)`, `s.pulse()`.
- **Energy per scene** decides which layers play in each bar: pad → bass → groove → full kit and counter-lines.
- **The voice comes first.** While someone speaks, the bed dips 12 dB and the melody drops out. The melody plays *only in the gaps*, so a music-only beat (`narration: false, beats: 6`) gets a phrase of its own.
- **Section changes** get a crash on the downbeat and a short snare fill into it, when the energy rises.
- **A hit gets a breath.** A `hit` or `boom` effect silences the music for the half beat before it, which makes the hit land.
- **The ending resolves.** The tonic chord lands on the last downbeat that leaves at least 1 s to ring, and fades with the last frame.

## 4. Sound effects

Transitions make their natural sound automatically (see the table in [runtime-api.md](runtime-api.md#transitions)). Add others per scene:

```js
sfx: [
  { at: 'ten thousand', type: 'tick' },          // when the phrase is spoken
  { at: 2.4, type: 'hit' },                      // local seconds
  { at: (s) => s.onBeat(2), type: 'shimmer' },   // computed from the scene (beats, word times)
  { at: (s) => s.when('Orbit'), type: 'riser', dur: 1.5 },  // a riser *ends* at its time
]
```

| Type | Sound | Use for |
|---|---|---|
| `whoosh` / `swish` | air past the camera (swish is shorter and softer) | pushes, whips, wipes |
| `hit` | sub thump + burst + room; the music breathes before it | the one big reveal per video |
| `boom` | deep sub drop | a title slam, a dramatic number |
| `riser` | noise + rising tone that ends at `at` | building into a hit |
| `swell` | a soft reverse swell | ink, dissolve, gentle reveals |
| `tick` / `click` | short UI tick | markers popping, counters, list items |
| `pop` | a soft blip | a result landing, a badge appearing |
| `shimmer` | a quick bell arpeggio of the current chord | light, sparkle, a positive payoff |
| `chime` | two bell notes | an end card, a notification |
| `paper` | a sheet sliding | page transitions |
| `type` | a key press | typewriter text (one per character burst, not per letter) |
| `glitch` | stuttered digital bursts | glitch transitions, cyber styles only |

**Restraint.** Sound effects follow the same rule as motion: each one marks something that matters. A good budget is one per transition, a tick per counted item, and **at most one `hit`** per video.

## 5. Pacing: let it breathe

Narration doesn't need to run without a break. Plan the silence the way you plan the shots:

| Moment | How | Why |
|---|---|---|
| **Pre-roll** | `voiceDelay` of 1–2 bars on the first scene | the music and the first visual set the tone before anyone talks |
| **Breath before the payoff** | a `narration: false` scene with `beats: 4–8`, or a long `tail` | a result needs a moment to sink in; the melody fills it |
| **Music-only montage** | 2–4 short `beats: 2` scenes cut on the beat | rhythm carries a list better than reading it out |
| **End card** | `tail: 1.5–2.5` on the last scene | the final chord resolves under the logo |

A 30 s explainer typically carries 20–24 s of speech. A 15 s teaser might have only 6–8 s.

## 6. Mix and verification

`cv render` reports the balance from separate voice and music stems:

```
a/v sync: 4 cue onsets vs speech onsets — median 93 ms, worst 96 ms
music: 13.8 dB under the voice while it speaks, -3.9 dB vs the voice in the gaps
```

Aim for **10–18 dB under the voice** while it speaks (it warns below 9 and above 22 dB) and roughly −2 to −6 dB in the gaps. The score is levelled against the measured speech RMS of your narration, so the defaults land there for any voice. Adjust with `music.volume`, `music.gap` and `music.duck`. Word-synced sound effects are excluded from the measurement (it uses a bed-only stem, `build/music-bed.wav`). The final mix is loudness-normalised to −16 LUFS. Speech onsets are measured on the voice stem, so the sync check still works under music.

**Honest limits.** The score is synthesized: it sounds like a tasteful, simple library bed, not a composer's track. The renderer verifies what it can measure (levels, ducking, sync, clipping, every cut on the grid) but cannot judge taste. For a flagship piece, use the generated score as the tempo map and swap in a licensed track with the same BPM: `--music track.mp3` plus `music: { bpm: <its bpm>, offset: <first downbeat s> }`.
