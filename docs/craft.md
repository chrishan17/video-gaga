# Craft

The runtime can draw anything. Whether the video is any good is decided by four crafts (story, picture, motion and sound) and by how hard you look at your own work before you hand it over. This file covers the story, the picture and the review loop. Motion has its own guide ([motion-design.md](motion-design.md)), and so does the score ([music-and-sound.md](music-and-sound.md) §2).

The bar is what people scroll past every day: work by good studios, editors and creators. A video that is only correct (on time, readable, in sync) still looks like a template next to that.

## 1. Story

**Find the specific thing.** "Why I run every day" told with a sunrise, a pair of shoes and the word 坚持 is every video on the topic. Ask whose story it is, which moment, which object, which number. Specific beats general every time: 5:40 on a dark street, the third lamp post where the lungs give up, a phone that shows 2.1 km on the day it all started. One true, odd detail makes a viewer believe the rest.

**Write three angles, then choose.** Before any storyboard, write three different one-line concepts for the same brief: say, a confession, a counter-intuitive claim, and one object followed through time. Keep the one that has tension *and* a picture. Note the other two in the brief so the user can see the choice.

**Give it a shape**, even at 15 seconds:
- an opening that makes the viewer want something: a question, a gap, a small mystery, a problem they recognise;
- a **turn**: the moment something changes (a reversal, a reveal, a reframe). A video without a turn is a list;
- a landing that pays off the opening. A callback (the first image, changed) closes the loop better than a moral.

**Words and pictures split the work.** The narration says what the picture can't, and the picture shows what words would make dull. If the voice describes the image on screen, one of them is wasted.

**Concrete words, no slogans.** Cut any line that could close any advert: 梦想, 坚持, 改变, 未来, 成就更好的自己, "unlock", "journey", "seamless", "the future of …". Replace it with a thing that happened, a number or an image. Write like a person talking to one person.

**One line worth repeating.** Every video needs a sentence someone would quote. Put it at the turn or at the end, and give it silence before it lands.

**When you only get a topic,** invent the specifics: a person, a moment, a detail. Make them plausible and humane, keep them modest, and list them as assumptions so the user can swap in their own. Never invent facts, figures or quotes about real people or products; data must be exact and sourced.

[examples/take-your-time/BRIEF.md](../examples/take-your-time/BRIEF.md) is a brief at the level to aim for: a specific person, a device that carries the story, a turn, a callback.

## 2. Picture

**One visual idea carries the video.** Before you design scenes, find the device: a metaphor or object that comes back and changes as the story moves. A red caret that is a man's voice and a red slab that is the wall in front of it. A grey world where one colour survives and then floods back. A roll of film with 35 of 36 frames shot. The device turns the story into pictures, and it is what people remember. Scenes are moments in the life of the device, not slides about the topic.

**Design every frame like a poster.** Strong frames have scale contrast (one thing huge, the rest small), deliberate empty space, a crop that runs off the edge, asymmetry and a clear grid. A centred title over a centred subtitle on every frame is a slide deck.

**Type is image.** One word filling the frame is stronger than a sentence at body size. Set type with intent: weight contrast, tight or wide tracking, a line break that lands on the right word.

**Edit like a film editor.** Vary scale (wide, close, extreme close), density and layout from shot to shot. If two consecutive scenes share a layout, the second should be there for a reason (a match cut, a before/after).

**Colour means something.** Keep the palette small so a change of colour can carry the story: the accent marks the one thing that matters, and a shift in the whole palette marks a shift in the story.

**Avoid the generic AI look:** purple-blue gradients, neon on dark, glass cards, floating blobs, icons in circles, emoji, stock-looking illustrations. Choose any of them only when the brief truly calls for it.

**Look up, not sideways.** Aim at the work you admire, not at the preset's example. Some reference points worth asking "how would they frame this?": title design (Saul Bass, Kyle Cooper, Elastic), motion studios (Buck, ManvsMachine, Oddfellows, Ordinary Folk, Giant Ant), editorial motion (Vox, The New York Times, Kurzgesagt), Swiss posters (Josef Müller-Brockmann), Apple product films, and Chinese visual traditions (留白 in ink painting, 书法, poster design from 1930s Shanghai). Borrow the thinking, not the look.

## 3. The review loop

Look at your own work the way a demanding creative director would, at every stage, and fix by redoing rather than patching. A first draft is a draft.

1. **Concept.** Three angles, one chosen (§1). Can you say the one line, the turn and the device in three sentences?
2. **Script.** Read it aloud and time it. For each line: is it concrete, does it do something the picture can't, would anyone remember it? Cut a fifth of the words. Check for slogans.
3. **Storyboard.** Can each frame be described in one sentence that someone could draw? Do neighbouring frames differ in scale or layout? Where does the device appear, and how does it change?
4. **Frames.** `cv still --sheet` gives three probes per scene. Ask of each frame: would it work as a poster? Where does the eye go first? Is anything generic, crowded or timid? Name the **weakest scene and rebuild it**. Make at least two full passes over the sheets, and check the mechanical list in [motion-design.md](motion-design.md) §9 too.
5. **Motion.** Stills hide motion. For each signature move, probe 6–8 close moments (`cv still --at 3.0,3.1,3.2,3.3,3.4,3.5 --sheet`) and read the sheet like a filmstrip: does it anticipate, accelerate, overshoot, settle? Does each cut happen on action? A half-scale draft render (`--scale 0.5`) and a few frames around each cut catch the rest.
6. **Sound.** Read `cv music`: the energy per bar should rise and fall with the story, and the `mix:` line should be balanced. You cannot hear the result, so when you deliver, say what you intended (where the hook plays, where the build peaks) and ask the user to listen and tell you which part is off.
7. **The encode.** Pull frames from the final MP4 at the key moments and look at them.

When you deliver, say honestly which part you think is weakest and what you would try next.

## 4. The brief

Write `<project>/BRIEF.md` before you build. Keep it short and specific:

```markdown
# {Title}
- The line: "{the sentence someone would repeat}"
- Angle: {the chosen concept} (also considered: {angle 2}; {angle 3})
- Audience and format: {who} · {1920×1080 | 1080×1920 | …} · {N} s
- The device: {the visual idea and how it changes across the video}
- Look: {style or preset} · palette {hex…} · type {display + label} · references {…}
- Motion: {its character in a sentence} · signature moves {…}
- Voice: {voice id, rate} · captions {burn | file | none}
- Score: {feel in three words} · {reference} · {bpm} BPM {key} {mode} · {the hook} · {how it builds}

| # | scene | voice line (or — music only) | picture | motion & sync | transition | energy · sfx | ≈ s |
|---|---|---|---|---|---|---|---|
```
