# Music, sound & pacing

A voice alone sounds dry, and wall-to-wall narration is tiring. video-gaga gives every composition a **soundtrack that is arranged from its own timeline**. The music, the cuts and the motion share one clock (the beat grid), and the score leaves room for the voice and fills the moments where nobody speaks.

The score is arranged by [`scripts/music.mjs`](../scripts/music.mjs) and **played by real instrument samples**: a General MIDI SoundFont (MuseScore General, MIT licence) rendered offline by [spessasynth_core](https://github.com/spessasus/spessasynth_core). Grand and felt piano, electric piano, string section, choir, nylon and steel guitars, harp, koto, mallets, basses, brass, winds and eight drum kits. It is seeded and deterministic: the same spec renders the same samples every time. The 40 MB sample bank downloads once to `~/.cache/video-gaga` on the first render (`cv doctor` fetches and checks it; `VIDEO_GAGA_SOUNDFONT=/path/to/bank.sf2` uses another General MIDI bank). Without it the score falls back to a small built-in synthesizer that sounds much cheaper, and `cv music` / `cv render` say so. You can still bring a licensed track with `--music file.mp3`.

## 1. Turn it on

There are no preset music styles. For every video the agent **designs the score from the brief**: tempo, key, mode, chords, which instruments play and how they build. The composition declares it in full:

```js
CV.create({
  music: {
    // the grid and the harmony
    bpm: 104, key: 'A', mode: 'major', progression: [0, 4, 5, 3], seed: 3, kit: 'room',
    // what plays, and from which scene energy up
    layers: [
      { name: 'piano', inst: 'piano', notes: [0, 2, 1, 2], pattern: 'X.x.X.x.', vel: [0.1, 0.14] },
      { name: 'strings', inst: 'strings', notes: 'chord', pattern: 'X---', vel: [0.05, 0.09], from: 0.35 },
      { name: 'bass', inst: 'bass', notes: ['root', 'root', 'fifth'], octave: -1, pattern: 'X..x..X.', vel: 0.26, from: 0.3 },
      { name: 'kick', inst: 'kick', pattern: 'X...X...', vel: 0.45, from: 0.45 },
      { name: 'clap', inst: 'clap', pattern: '..X...X.', vel: 0.2, from: 0.45 },
      { name: 'shaker', inst: 'shaker', pattern: 'xXxXxXxXxXxXxXxX', vel: 0.06, from: 0.6 },
    ],
    // the melody that plays only where nobody speaks
    lead: { inst: 'bell', kind: 'glock', range: [76, 91], rhythm: 'melodic', vel: 0.11 },
  },
  scenes: [
    { id: 'hook', voiceDelay: 2.1, energy: 0.45, draw … },            // a bar of music before the first word
    { id: 'curve', energy: 0.6, sfx: [{ at: 'ten', type: 'tick' }], draw … },
    { id: 'breath', narration: false, beats: 6, energy: 0.85, draw … }, // music-only beat: let the result land
    { id: 'end', tail: 1.6, energy: 0.55, draw … },                    // the final chord rings out with the end card
  ],
});
```

`cv render` renders the score (cached in `build/music.wav`), mixes it with the voice and checks the balance. `cv music <project>` renders only the score, so the preview player can play it, and prints the arrangement: key, BPM, chords, layers, energy per bar, **how loud each part of the mix is** (`mix: bed · keys · drums · lead · reverb`, dB of the whole), the cut times, every sound effect and any **warnings** about the spec. A spec that breaks a limit (§2.4) is refused with a list of exactly what to fix.

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
| `kit` | `'standard'` | The drum kit: `standard`, `room` (live, warm), `power` (big rock), `electronic`, `808` (hip-hop, trap, modern pop), `jazz`, `brush` (soft, intimate), `orchestra` (concert percussion) |
| `swing` | 0 | 0–0.5: delays every other eighth/sixteenth (0.15–0.3 = a lazy, human groove). Layers can set their own |
| `seed` | 1 | Change it to hear a different melody in the same design |
| `fills` | true | A fill and a crash into a section where the energy rises (only where the score has drums) |
| `beatsPerBar` | 4 | |
| `snap` | `'beat'` | Where cuts land: `'beat'`, `'half'`, `'bar'` or `false`. Scenes can override with `snap` |
| `voiceOnBeat` | true | Start every voice line on an eighth note |
| `energy` (per scene) | an arc | 0..1. Decides which layers play. Default: a confident open, a fuller middle, a settled end, with music-only scenes a little higher |
| `duck` | −10 | How many dB the bed dips while someone speaks (the melody dips a further 12 dB) |
| `gap` | 6 | How many dB the music-only passages sit under the voice's speech level. The renderer measures the actual voice, so every voice gets the same balance |
| `volume` | 1 | A gain on top of that (`1.4` ≈ +3 dB) |
| `sfx` | true | Transitions play their natural sound |
| `parts` | — | Chapters of a long score: `{ name: { key, mode, progression, chordBars, sevenths, seed, lead } }`, chosen by a scene's `part` (§2.5) |
| `ending` | `'resolve'` | `'resolve'` lands the tonic chord on the last downbeat and lets the score's own instruments ring. `'none'` lets the groove run to the end |
| `file` | — | A licensed track instead of the generated score (side-chain ducked, faded) |

The thirteen presets each carry the score designed for their own example video. Read them as worked examples of the spec, not as styles to reuse: a new video gets a new score.

## 2. Designing the score

### 2.1 From the brief to the sound

Aim for what people hear in good short videos today: **a produced track with a groove and a hook**, not a sound bed. It has a clear pulse early on (a kick and a clap or snare, or a rhythmic piano or guitar figure), a bass that locks with the kick, one or two harmonic instruments with a character that fits the subject, and a memorable melody in the gaps. It builds, peaks, and lands. Quiet and serious subjects still move: a felt piano ostinato and brushed drums are calm, but they are not a drone.

Design from the **content's emotion and the audience**, not from the visual preset. Decide these in order, and say them in one line in the storyboard (Phase 3) and in the music question (Phase 1):

1. **Feeling in three words** ("curious, bright, trustworthy"; "tense, then relieved"; "warm, homemade").
2. **Tempo** from the pace of the edit and the voice:

   | Feel | BPM |
   |---|---|
   | reflective, wellness, documentary, cinematic | 70–90 |
   | clear, friendly, explanatory, warm | 90–110 |
   | upbeat, social, lifestyle, promotional | 110–126 |
   | urgent, hype, sport, gaming | 126–150 |

3. **Mode** for the colour: `major` bright and open (most videos); `lydian` wonder, space, lift; `mixolydian` relaxed, sunny, a little rough; `dorian` cool, minimal, confident; `minor` serious, cinematic, premium-dark; `phrygian` tense, exotic, ominous (rarely). Vary the key between videos: there is no default key.
4. **Progression**: 4 chords suit most videos. Loops that work: `[0, 4, 5, 3]` (I–V–vi–IV, anthemic), `[5, 3, 0, 4]` (vi–IV–I–V, pop), `[0, 5, 3, 4]` (I–vi–IV–V, warm), `[0, 3, 5, 4]` (lydian/major float), `[3, 4, 0, 0]` (IV–V–I, uplifting), `[0, 5, 2, 6]` (minor, cinematic), `[0, 0, 5, 6]` (dorian vamp). `chordBars: 2` slows the harmony for calm pieces. A single chord (`[0]`) is a drone: avoid it for a whole video.
5. **Instruments** that belong to the subject. Two or three pitched timbres plus drums is plenty, and one of them is the signature sound:

   | Subject / feel | Instruments that work |
   |---|---|
   | warm, human, lifestyle, story | `piano` or `felt`, `guitar` / `acoustic`, `strings`, `kit: 'room'` or `'brush'` |
   | tech, product, startup | `epiano`, `synthpad`, `bass` `kind: 'synth'`, `bell` `kind: 'vibes'` or `'glock'`, `kit: 'electronic'` or `'808'` |
   | playful, kids, food, how-to | `bell` `marimba` / `kalimba` / `xylophone`, `pizz`, `acoustic`, `clap`, `kit: 'room'` |
   | cinematic, documentary, history | `strings`, `piano` or `felt`, `cello`, `horn`, `timpani` hits, `kit: 'orchestra'` |
   | Chinese / East Asian themes | `koto` (guzheng-like), `shakuhachi` or `flute`, `bell` `celesta`, `strings`, soft `kit: 'brush'` |
   | hype, sport, gaming | `synthbrass` or `brass` stabs, `lead` saw arps, `bass` `kind: 'synth2'`, `kit: 'power'` or `'808'` |
   | luxury, calm premium | `felt`, `strings`, `harp`, `bass` `kind: 'upright'`, `kit: 'jazz'` with ride |

6. **The build**: assign each layer a `from` energy so the score grows with the story, typically in 3–4 tiers: the harmonic figure (`from: 0`), then bass (≈0.3), then the groove (≈0.45), then the lift (16th shakers, open hats, arps at ≈0.65–0.8). Then give scenes `energy` values that follow the emotional arc, **mostly between 0.4 and 0.9**: the groove should be in by the second scene of a 30 s piece. Keep one or two low-energy moments for contrast, not the whole first half.

**What sounds cheap or creepy, and why:** a sustained pad or strings alone for long stretches (a drone), a low `tom` as the only pulse (a horror-film heartbeat), `minor`/`phrygian` with slow chords and lots of reverb, melodies that never resolve, and every scene at low energy. `cv music` warns about the first two.

### 2.2 Layers

A layer is one part, repeated every bar (or every `bars` bars), playing in the bars whose energy is in `[from, to)`.

| Key | Meaning |
|---|---|
| `inst` | **beds:** `pad` (warm synth pad), `synthpad` (brighter polysynth), `strings` (string section), `sinepad` (soft, slow strings), `choir` · **keys:** `piano` (grand), `felt` (mellow, intimate piano), `epiano` / `keys` (electric piano) · **plucked:** `guitar` / `pluck` (nylon), `acoustic` (steel-string), `harp`, `koto`, `pizz` (pizzicato strings) · **mallets:** `bell` with `kind`: `glock`, `marimba`, `kalimba`, `celesta`, `vibes`, `musicbox`, `xylophone`, `tubular` · **melodic:** `flute`, `shakuhachi`, `violin`, `cello`, `horn`, `brass`, `synthbrass`, `lead` (square; `saw: 1` for a saw), `timpani` · **bass:** `bass` with `kind`: `finger` (default), `picked`, `upright`, `fretless`, `synth`, `synth2` (`synth: true` = `kind: 'synth'`) · **drums:** `kick`, `snare`, `clap`, `snap`, `rim`, `hat`, `openhat`, `shaker`, `tamb`, `ride`, `crash`, `tom` (`pitch` Hz picks floor … high tom), `conga` |
| `pattern` | Steps across the bar(s), equal length: `X` hit, `x` soft hit (0.6), `1`–`9` hit at n/9, `-` hold the previous note one more step, `.` rest. Spaces are ignored. `'X---'` = a whole-bar note, `'X.x.X.x.'` = eighths, 16 characters = sixteenths |
| `bars` | 1, 2 or 4: how many bars the pattern spans |
| `notes` | pitched only: `'chord'` (all chord tones), or a list cycled per hit: `root`, `third`, `fifth`, `seventh`, or a chord-tone index `0`–`7` of the voiced chord (`3` on a triad = the bottom note an octave up); add `^` / `_` for an octave up / down (`'root_'`, `'0^'`). Default: `'chord'` (`'root'` for bass). `[0, 1, 2, 3, 2, 1]` on eighths is an arpeggio |
| `octave` | Shift the whole layer −2…+2 octaves |
| `vel` | Loudness of a full hit, or `[low, high]` scaled by the scene energy. Capped per instrument (§2.4) |
| `gate` | Note length as a fraction of its steps (default 0.9; 1 for beds); above 1 lets notes ring over the next hit (piano arpeggios: 1.5–2) |
| `from`, `to` | The energy range the layer plays in (default 0 and 1) |
| `pan` | −1…1 |
| `swing` | 0–0.5, this layer only |
| sound | `bright` 0..1 (brightness; 0.5 = as sampled) · `cutoff` Hz (pad, synthpad, bass, lead) · `attack`, `release` s (slower or faster envelopes) · `verb` 0..1, `echo` 0..0.6 (reverb and dotted-eighth delay sends) · `strum` s between chord notes · `decay` s (keys: how long a note may ring) · `kind` (bell, bass) · `saw` (lead) · `pitch` (tom). Any number may be `[low, high]` by energy |

### 2.3 The lead

`lead: { inst, range: [lowMidi, highMidi], rhythm, vel, …sound }`: `inst` is any keys, plucked, mallet or melodic instrument (`piano`, `felt`, `epiano`, `guitar`, `harp`, `koto`, `bell`, `flute`, `shakuhachi`, `violin`, `horn`, `lead` …); `rhythm` is `sparse` (long notes, reflective), `melodic` (a singable line) or `rhythmic` (short, syncopated). Two seeded motifs are composed per part and laid out as an eight-bar period (statement, an answer a step higher, a contrast, the statement again landing home), on the key's scale with chord tones on the strong beats, and played **only where nobody is speaking**. Keep the range above the voice (MIDI ≥ 69 for a lead that sings, at least 7 semitones wide).

### 2.4 Rules and limits

`scripts/music.mjs` enforces these (`validateScore`, `LIMITS`); a spec that breaks one is refused with the exact field to fix:

- `bpm` 60–150; `progression` 1–8 degrees 0–6; `chordBars` 1, 2 or 4; known `key`, `mode` and `kit`.
- At most **8 layers**, at most **32 steps per bar** per layer, and at most **40 drum hits per bar** across all drum layers at full energy.
- Loudest hit per instrument: beds (pad, synthpad, strings, sinepad, choir) 0.12 · keys, plucked and mallets 0.2 · flute, violin, cello, horn, brass 0.15 · lead 0.12 · timpani 0.3 · bass 0.35 · kick 0.7 · snare 0.35 · clap 0.3 · conga 0.3 · snap 0.25 · rim 0.2 · crash 0.15 · hat, shaker, tamb, ride 0.12 · openhat 0.1 · tom 0.5. Lead `vel` ≤ 0.15. (The mix is levelled against the voice afterwards; these keep one part from swamping the others.)
- Notes stay inside MIDI 28–100 (folded by octaves); sound options stay in safe ranges (e.g. `cutoff` 80–8000 Hz, `echo` ≤ 0.6).
- Unknown keys are errors, so typos never pass silently.

And these are **design rules** (warnings from `cv music`, and things to check yourself):

- Something harmonic plays at low energy (a piano, keys, guitar or pad with `from` ≤ 0.3), so quiet scenes are not empty.
- Something articulates the beat: a score of only pads/strings and bass drones (warned).
- A low tom is not the only pulse (warned): that is a horror-film heartbeat.
- Layers enter with energy (`from`), so the score builds and breathes with the story rather than playing flat.
- Leave the voice its band: keep busy parts (arps, 16ths) at `from` ≥ 0.45 or in music-only scenes, and prefer piano, guitar, bass and soft drums under narration.
- Balance by numbers: in `cv music`'s `mix:` line, drums usually sit around −4 to −8 dB of the whole when the groove is in, the lead around −10 to −15, and the reverb below −10 (above that it washes out).
- One signature sound per video (a marimba ostinato, a felt-piano arpeggio, a koto line, a saw arp), not five.
- Ask, don't assume: in Phase 1 offer three concrete score designs for *this* brief (one recommended), e.g. "A. 104 BPM A major, felt piano arpeggios + nylon guitar + brushed kit, glockenspiel melody (recommended: warm and homemade, like the topic)".

### 2.5 Parts: a long score in chapters

One four-chord loop carries a 30 s piece. Over two or three minutes it repeats fifteen times or more and turns into wallpaper, and the melody's two motifs come round again and again. A long video is told in chapters, so give the score chapters too: **parts**.

```js
music: {
  bpm: 88, key: 'D', mode: 'major', progression: [0, 4, 5, 3], layers: [ … ], lead: { … },
  parts: {
    stuck:   { key: 'B', mode: 'minor', progression: [0, 5, 2, 6], chordBars: 2, lead: { rhythm: 'sparse' } },
    hundred: { progression: [5, 3, 0, 4], seed: 8, lead: { rhythm: 'rhythmic' } },
    home:    { progression: [3, 0, 4, 0], chordBars: 2 },
  },
},
scenes: [
  { id: 'open', … },                    // the main harmony (the top-level spec)
  { id: 'kid', part: 'stuck', … },      // from here on: B minor, two bars per chord
  { id: 'voice', … },                   // still 'stuck' (a part holds until the next one)
  { id: 'day30', part: 'hundred', … },
]
```

- A part may change `key`, `mode`, `progression`, `chordBars`, `sevenths`, `seed` (new melody motifs) and `lead` (merged over the main lead: a different `rhythm`, `range` or `vel`). The **layers stay the same** for the whole video, so it keeps one sound; energy still decides which of them play.
- Put `part` on the first scene of each chapter. It holds until another scene names a part. The cut into that scene moves to the next **bar line** (not just the beat) so the new chords arrive with the new picture; this can hold the previous scene up to one bar longer. Set the scene's `snap` to override.
- Each part starts on the first chord of its own progression, and the melody in it uses its own two motifs. The ending resolves to the home chord of the part the video ends in.
- Design parts from the story, not for variety's sake: a relative minor for the low point, a pop loop (`[5, 3, 0, 4]`) for momentum, a slower `chordBars: 2` for reflection, and back home for the ending. Three to six parts suit a 2–5 minute piece.
- `cv music` prints where each part takes over (`parts (name@bar): main@1 stuck@9 …`) and warns when a score longer than ~75 s loops one progression more than eight times.

## 3. How the score follows the video

- **One clock.** The runtime moves every cut so that the middle of the transition lands on a beat, starts each voice line on an eighth note, and ends the video on a beat. Draw code reads the same grid: `s.onBeat(i)`, `s.nextBeat(t)`, `s.pulse()`.
- **Energy per scene** decides which layers play in each bar (each layer's `from`/`to`), so the arrangement builds the way you designed it: harmony → bass → groove → full kit.
- **The voice comes first.** While someone speaks, the bed dips 10 dB and the melody drops out. The melody plays *only in the gaps*, so a music-only beat (`narration: false, beats: 6`) gets a phrase of its own.
- **Section changes** get a short snare or tom fill and a crash on the downbeat, when the energy rises and the score has drums there.
- **A hit gets a breath.** A `hit` or `boom` effect silences the music for the half beat before it, which makes the hit land.
- **The ending resolves.** The tonic chord lands on the last downbeat that leaves at least 1 s to ring, played by the score's own instruments, and fades with the last frame.

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
| `whoosh` / `swish` | air past the camera: two bands of noise sweeping across the stereo field (swish is shorter and softer) | pushes, whips, wipes |
| `hit` | a big kick, a timpani on the tonic, a crash and a sub; the music breathes before it | the one big reveal per video |
| `boom` | a concert bass drum and a deep sub drop | a title slam, a dramatic number |
| `riser` | a reversed cymbal and noise opening up, ending at `at` | building into a hit |
| `swell` | a soft reversed cymbal | ink, dissolve, gentle reveals |
| `tick` / `click` | short UI tick | markers popping, counters, list items |
| `pop` | a soft bloop | a result landing, a badge appearing |
| `shimmer` | a quick celesta arpeggio of the current chord | light, sparkle, a positive payoff |
| `chime` | two glockenspiel notes, the fifth then the octave | an end card, a notification |
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

**Honest limits.** The instruments are real samples, so the score sounds like a well-produced library cue rather than a toy synth, but it is still arranged by rules from a spec: it won't match a composer's track or a commercial hit. The renderer verifies what it can measure (levels, ducking, mix balance, sync, peaks, every cut on the grid) but cannot judge taste: read the `mix:` line and the warnings, and design the score as carefully as the pictures. For a flagship piece, use the generated score as the tempo map and swap in a licensed track with the same BPM: `--music track.mp3` plus `music: { bpm: <its bpm>, offset: <first downbeat s> }`.
