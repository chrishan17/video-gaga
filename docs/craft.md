# What good looks like

This page describes the finished video you are aiming for, not the steps to get there. Get there however you like. Before you deliver, hold the real output (the frames, the motion, the score report, the encode) against it, and keep going until the video meets it.

The bar is what people scroll past every day: work by good studios, editors and creators. A video that is only correct (on time, readable, in sync) still looks like a template next to that.

## The whole

A good video is about one thing and is told by someone. After 30 seconds the viewer can say what it was about in a sentence, remembers one image and one line, and felt something change between the start and the end. It could not be swapped for another video on the same topic.

Not good: a sequence of true statements with pictures, which is a slideshow with music. A video whose every part is fine but which leaves nothing behind.

## Story

**Good**
- It is specific: a person, a moment, an object, a number. 5:40 on a dark street, the third lamp post where the lungs gave up, 0.12 km on day one. One true, odd detail makes the viewer believe the rest.
- It has a shape: an opening that makes the viewer want something (a question, a gap, a problem they recognise), a **turn** where something changes (a reversal, a reveal, a reframe), and a landing that pays off the opening, often by bringing back the first image, changed.
- The angle is a choice. Of the several ways to tell it (a confession, a counter-intuitive claim, one object followed through time), it is the one with tension and a picture.
- Every line is concrete and sounds like a person talking to one person. One line is worth repeating, and it lands with silence before it.
- Words and pictures split the work: the voice says what the picture can't, and the picture shows what words would make dull.
- When the brief is only a topic, the invented specifics are plausible, humane and modest, and they are listed as assumptions the user can swap for their own. Facts, figures and quotes are real and sourced.

**Not good**
- Lines that could close any advert: 梦想, 坚持, 改变, 未来, 成就更好的自己, "unlock", "journey", "seamless".
- A list with no turn. A moral at the end instead of an image.
- The voice describing what is already on screen.
- Facts invented about real people or products.

[examples/take-your-time/BRIEF.md](../examples/take-your-time/BRIEF.md) is a story at this level: a specific person, a device that carries the story, a turn, a callback.

## Picture

**Good**
- One visual idea carries the video: a device that recurs and changes as the story moves. A red caret that is a man's voice and a red slab that is the wall in front of it. A grey world where one colour survives and floods back. A roll of film with 35 of 36 frames shot. A row of street lamps. Scenes are moments in the life of the device, not slides about the topic.
- Every frame would work as a poster: scale contrast (one thing huge, the rest small), deliberate empty space, crops that run off the edge, asymmetry, a clear grid, one place the eye goes first.
- Type is image: one word filling the frame, weight contrast, tracking and line breaks chosen for the word that matters.
- Shots vary the way an editor varies them: wide, close and extreme close; dense and empty. When two scenes share a layout, it is on purpose (a match cut, a before and after).
- The palette is small, so colour can carry meaning: the accent marks the one thing that matters, and a shift of the whole palette marks a shift in the story.
- Light and contrast let the subject read at a glance, even in a dark, moody piece.

**Not good**
- A centred title over a centred subtitle on every frame.
- The subject too small or too dark to read in the first second.
- The generic AI look: purple-blue gradients, neon on dark, glass cards, floating blobs, icons in circles, emoji, stock-looking illustration, unless the brief truly asks for it.
- A preset's example video with the words swapped.

Aim at work you admire and borrow its thinking, not its look: title design (Saul Bass, Kyle Cooper, Elastic), motion studios (Buck, ManvsMachine, Oddfellows, Ordinary Folk, Giant Ant), editorial motion (Vox, The New York Times, Kurzgesagt), Swiss posters (Josef Müller-Brockmann), Apple product films, and Chinese visual traditions (留白 in ink painting, 书法, 1930s Shanghai posters).

## Motion

**Good**
- Every move has a job (it points, explains a change, gives a hold life) and the screen is never dead.
- Moves have weight: anticipation, a snap or a long settle, follow-through, arcs. Related elements arrive as one cascade.
- Speed has contrast: a quick hit then a long drift, a burst of cuts then a held shot.
- Holds stay alive with a travelling camera, moving light, parallax between layers.
- Cuts happen on action; secondary elements leave before the cut.
- A few signature moves that belong to this video, usually the device transforming, are what people remember.
- Hits land on their words and beats.

**Not good**
- Everything fading in together; text that sits on a still frame; scenes shoved off by the next one.
- Motion added because a frame felt empty: wobbling text, particles, everything pulsing to the beat.
- Bounce on numbers or data; a different transition at every cut.

The language and the vocabulary are in [motion-design.md](motion-design.md).

## Sound

**Good**
- The score sounds produced and chosen: like something a music supervisor would license for this exact video, with a reference you can name.
- It has a hook (a figure of a bar or two that is its identity), a pulse early on, a bass that locks with the kick, and a melody that answers in the gaps.
- Its arc follows the story: what plays first, where the groove arrives, what happens at the turn (a drop, a key change, everything but one instrument falling away), what it lands on.
- The voice is clear and unhurried; the music sits under it and fills the pauses. There is silence where a line needs to land.
- Sound effects mark what matters, and the one big hit is the only one.

**Not good**
- A drone (pads or strings alone for long stretches), a low tom as the only pulse, slow minor chords drowned in reverb by default, a melody that never resolves, every scene at low energy. These read as cheap or creepy.
- Wall-to-wall narration; a sound on every element.
- Instruments chosen by subject cliché (a guzheng because the topic is China) rather than by feeling.

The spec and how to direct it are in [music-and-sound.md](music-and-sound.md) §2.

## How you know

Intent is not evidence: judge what was rendered. The contact sheets show composition and readability; a strip of close probes shows whether a move has weight; a half-scale draft shows the cuts; frames pulled from the final MP4 show what the viewer gets; `cv music` shows the arc and the mix. You cannot hear the audio, so say what you intended and ask the user to listen.

Deliver when it meets this page. If something still falls short, rebuild that part rather than patch it, or say plainly what it is.

## The brief

`<project>/BRIEF.md` records the target for this video, short and specific:

```markdown
# {Title}
- The line: "{the sentence someone would repeat}"
- Angle: {the chosen telling} (also considered: {…}; {…})
- Audience and format: {who} · {1920×1080 | 1080×1920 | …} · {N} s
- The device: {the visual idea and how it changes across the video}
- Look: {style or preset} · palette {hex…} · type {display + label} · references {…}
- Motion: {its character in a sentence} · signature moves {…}
- Voice: {voice id, rate} · captions {burn | file | none}
- Score: {feel in three words} · {reference} · {bpm} BPM {key} {mode} · {the hook} · {how it builds}

| # | scene | voice line (or — music only) | picture | motion & sync | transition | energy · sfx | ≈ s |
|---|---|---|---|---|---|---|---|
```
