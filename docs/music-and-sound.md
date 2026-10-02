# Music, sound & pacing

A voice alone sounds dry, and wall-to-wall narration is tiring. video-gaga gives every composition a **soundtrack that is arranged from its own timeline**. The music, the cuts and the motion share one clock (the beat grid), and the score leaves room for the voice and fills the moments where nobody speaks.

Everything is generated locally by [`scripts/music.mjs`](../scripts/music.mjs): pure JavaScript, seeded and deterministic, with no samples, no licences and no network. You can still bring a licensed track with `--music file.mp3`.

## 1. Turn it on

There are no preset music styles. For every video the agent **designs the score from the brief**: tempo, key, mode, chords, which instruments play and how they build. The composition declares it in full:

```js
CV.create({
  music: {
    // the grid and the harmony
    bpm: 100, key: 'D', mode: 'major', progression: [0, 5, 3, 4], sevenths: true, seed: 3,
    // what plays, and from which scene energy up
    layers: [
      { name: 'pad', inst: 'pad', notes: 'chord', pattern: 'X---', vel: 0.06, cutoff: [900, 1500] },
      { name: 'stabs', inst: 'keys', notes: 'chord', pattern: 'X..X..X.', gate: 2.2, vel: [0.07, 0.1], from: 0.25 },
      { name: 'bass', inst: 'bass', notes: ['root', 'fifth', 'root'], octave: -1, pattern: 'X--.X-.x', vel: 0.3, from: 0.35 },
      { name: 'shaker', inst: 'shaker', pattern: 'xXxXxXxX', vel: 0.08, from: 0.4 },
      { name: 'kick', inst: 'kick', pattern: 'X... ..x. X... ....', vel: 0.5, from: 0.5 },
    ],
    // the melody that plays only where nobody speaks
    lead: { inst: 'bell', kind: 'glock', range: [74, 88], rhythm: 'melodic', vel: 0.1 },
  },
  scenes: [
    { id: 'hook', voiceDelay: 2.1, energy: 0.35, draw … },            // one bar of music before the first word
    { id: 'curve', energy: 0.6, sfx: [{ at: 'ten', type: 'tick' }], draw … },
    { id: 'breath', narration: false, beats: 6, energy: 0.8, draw … }, // music-only beat: let the result land
    { id: 'end', tail: 1.6, energy: 0.45, draw … },                    // the final chord rings out with the end card
  ],
});
```

`cv render` synthesizes the score (cached in `build/music.wav`), mixes it with the voice and checks the balance. `cv music <project>` renders only the score, so the preview player can play it, and prints the arrangement: key, BPM, chords, layers, energy per bar, the cut times, every sound effect and any **warnings** about the spec. A spec that breaks a limit (§2.4) is refused with a list of exactly what to fix.

| `music` key | Default | Meaning |
|---|---|---|
| `bpm` | — (required) | The beat grid. Every cut and the first syllable of every line snaps to it |
| `key` | — | Tonic: `C C# Db D D# Eb E F F# Gb G G# Ab A A# Bb B` |
| `mode` | — | `major`, `minor`, `dorian`, `lydian`, `mixolydian`, `phrygian` |
| `progression` | — | 1–8 scale degrees, 0 = tonic (`[0, 5, 3, 4]` = I–vi–IV–V in major). Chords are diatonic triads, voice-led |
| `sevenths` | false | Four-note chords |
| `chordBars` | 1 | Bars per chord: 1, 2 or 4 |
| `layers` | — | The parts (§2.2). `[]` with no `lead` = sound effects only, on the grid |
| `lead` | none | The melody in the gaps (§2.3), or omit it |
| `seed` | 1 | Change it to hear a different melody in the same design |
| `fills` | true | A crash and a short snare fill into a section where the energy rises |
| `beatsPerBar` | 4 | |
| `snap` | `'beat'` | Where cuts land: `'beat'`, `'half'`, `'bar'` or `false`. Scenes can override with `snap` |
| `voiceOnBeat` | true | Start every voice line on an eighth note |
| `energy` (per scene) | an arc | 0..1. Decides which layers play. Default: quiet open, fuller middle, settled end, with music-only scenes a little higher |
| `duck` | −12 | How many dB the bed dips while someone speaks (the melody dips a further 12 dB) |
| `gap` | 7 | How many dB the music-only passages sit under the voice's speech level. The renderer measures the actual voice, so every voice gets the same balance |
| `volume` | 1 | A gain on top of that (`1.4` ≈ +3 dB) |
| `sfx` | true | Transitions play their natural sound |
| `ending` | `'resolve'` | `'resolve'` lands the tonic chord on the last downbeat and lets it ring. `'none'` lets the groove run to the end |
| `file` | — | A licensed track instead of the generated score (side-chain ducked, faded) |

The thirteen presets each carry the score designed for their own example video. Read them as worked examples of the spec, not as styles to reuse: a new video gets a new score.

## 2. Designing the score

### 2.1 From the brief to the sound

Design from the **content's emotion and the audience**, not from the visual preset. Decide these in order, and say them in one line in the storyboard (Phase 3) and in the music question (Phase 1):

1. **Feeling in three words** ("curious, bright, trustworthy"; "tense, then relieved"; "warm, homemade").
2. **Tempo** from the pace of the edit and the voice:

   | Feel | BPM |
   |---|---|
   | still, reflective, wellness, science wonder | 60–80 |
   | measured, serious, documentary, premium | 80–95 |
   | clear, friendly, explanatory | 95–108 |
   | upbeat, social, promotional | 108–124 |
   | urgent, hype, sport, gaming | 124–150 |

3. **Mode** for the colour: `major` bright and open; `lydian` wonder, space, lift; `mixolydian` relaxed, sunny, a little rough; `dorian` cool, minimal, confident; `minor` serious, cinematic, premium-dark; `phrygian` tense, exotic, ominous (use sparingly).
4. **Progression**: 4 chords suit most videos. Loops that work: `[0, 5, 3, 4]` (I–vi–IV–V, warm), `[0, 4, 5, 3]` (I–V–vi–IV, anthemic), `[5, 3, 0, 4]` (vi–IV–I–V, pop), `[0, 3, 5, 4]` (lydian/major float), `[0, 5, 2, 6]` (minor, cinematic), `[0, 0, 5, 6]` (dorian vamp, hypnotic). A single chord (`[0]`) is a drone. Slow it down with `chordBars: 2` for calm pieces.
5. **Instruments** that belong to the subject: a fingerpicked `pluck` and `snap` for handmade/human, `bell` marimba/kalimba for playful precision, `keys` for intelligence and clarity, synth `bass` (`synth: true`) and `lead` saws for tech/night, `sinepad` and a low `bass` for space and calm, `tom` heartbeats for gravity. Two or three timbres plus drums is plenty.
6. **The build**: assign each layer a `from` energy so the score grows with the story, typically in 3–4 tiers: harmony (`from: 0`), then bass/pulse (≈0.3), then groove (≈0.5), then the extra drive (≈0.7–0.85). Then give scenes `energy` values that follow the emotional arc.

### 2.2 Layers

A layer is one part, repeated every bar (or every `bars` bars), playing in the bars whose energy is in `[from, to)`.

| Key | Meaning |
|---|---|
| `inst` | pitched: `pad` (warm saw pad), `sinepad` (soft sine pad), `keys` (FM electric piano), `pluck` (plucked string), `bell` (`kind`: `glock`, `marimba`, `kalimba`, `celesta`), `bass` (`synth: true` for a filtered saw), `lead` (saw lead) · drums: `kick`, `snare`, `clap`, `snap`, `rim`, `hat`, `openhat`, `shaker`, `tom` (`pitch` Hz) |
| `pattern` | Steps across the bar(s), equal length: `X` hit, `x` soft hit (0.6), `1`–`9` hit at n/9, `-` hold the previous note one more step, `.` rest. Spaces are ignored. `'X---'` = a whole-bar note, `'X.x.X.x.'` = eighths, 16 characters = sixteenths |
| `bars` | 1, 2 or 4: how many bars the pattern spans |
| `notes` | pitched only: `'chord'` (all chord tones), or a list cycled per hit: `root`, `third`, `fifth`, `seventh`, or a chord-tone index `0`–`7` of the voiced chord (`3` on a triad = the bottom note an octave up); add `^` / `_` for an octave up / down (`'root_'`, `'0^'`). Default: `'chord'` (`'root'` for bass) |
| `octave` | Shift the whole layer −2…+2 octaves |
| `vel` | Loudness of a full hit, or `[low, high]` scaled by the scene energy. Capped per instrument (§2.4) |
| `gate` | Note length as a fraction of its steps (default 0.9; 1 for pads); above 1 lets notes ring over the next hit |
| `from`, `to` | The energy range the layer plays in (default 0 and 1) |
| `pan` | −1…1 for single notes (chords spread on their own) |
| sound | per instrument: `cutoff`, `attack`, `release` (pad) · `bright`, `decay`, `echo`, `verb`, `strum` (keys, pluck) · `kind`, `echo`, `verb` (bell) · `synth`, `cutoff`, `envDecay`, `decay`, `release` (bass) · `saw`, `cutoff`, `echo`, `verb` (lead) · `pitch` (tom). Any number may be `[low, high]` by energy |

### 2.3 The lead

`lead: { inst, range: [lowMidi, highMidi], rhythm, vel, …sound }`: `inst` is `keys`, `bell`, `pluck` or `lead`; `rhythm` is `sparse` (long notes, reflective), `melodic` (a singable line) or `rhythmic` (short, syncopated). Two seeded motifs are composed from the progression, snapped to chord tones on strong beats, and played **only where nobody is speaking**. Keep the range above the voice (MIDI ≥ 66 for a lead that sings, at least 7 semitones wide).

### 2.4 Rules and limits

`scripts/music.mjs` enforces these (`validateScore`, `LIMITS`); a spec that breaks one is refused with the exact field to fix:

- `bpm` 60–150; `progression` 1–8 degrees 0–6; `chordBars` 1, 2 or 4; known `key` and `mode`.
- At most **8 layers**, at most **32 steps per bar** per layer, and at most **40 drum hits per bar** across all drum layers at full energy.
- Loudest hit per instrument: pad/sinepad 0.12 · keys/pluck/bell 0.2 · lead 0.12 · bass 0.35 · kick 0.7 · snare 0.35 · clap 0.3 · snap 0.25 · rim 0.2 · hat/shaker 0.12 · openhat 0.1 · tom 0.5. Lead `vel` ≤ 0.15. (The mix is normalised against the voice afterwards; these keep one part from swamping the others.)
- Notes stay inside MIDI 28–100 (folded by octaves); sound options stay in safe ranges (e.g. `cutoff` 80–8000 Hz, `echo` ≤ 0.6).
- Unknown keys are errors, so typos never pass silently. Everything is synthesized: no samples, no external audio.

And these are **design rules** (warnings from `cv music`, and things to check yourself):

- Something harmonic plays at low energy (a pad, keys or pluck with `from` ≤ 0.3), so quiet scenes are not empty.
- No drums below energy 0.3: the quietest, most intimate moments stay drum-free.
- Layers enter with energy (`from`), so the score builds and breathes with the story rather than playing flat.
- Leave the voice its band: keep busy parts (arps, 16ths) at `from` ≥ 0.45 or in music-only scenes, and prefer pads, bass and sparse keys under narration.
- One signature sound per video (a marimba ostinato, a heartbeat tom, a saw arp), not five.
- Ask, don't assume: in Phase 1 offer three concrete score designs for *this* brief (one recommended), e.g. "A. 96 BPM G major, fingerpicked guitar + snaps, glockenspiel melody (recommended: warm and homemade, like the topic)".

## 3. How the score follows the video

- **One clock.** The runtime moves every cut so that the middle of the transition lands on a beat, starts each voice line on an eighth note, and ends the video on a beat. Draw code reads the same grid: `s.onBeat(i)`, `s.nextBeat(t)`, `s.pulse()`.
- **Energy per scene** decides which layers play in each bar (each layer's `from`/`to`), so the arrangement builds the way you designed it: harmony → bass → groove → full kit.
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
