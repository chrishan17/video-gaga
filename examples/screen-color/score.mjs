// "Same numbers, different lights": one piece in D at 96 (a bar is 2.5 s).
// A felt-piano figure that keeps its shape while the harmony moves under it
// (after Nils Frahm's "Says"), with mallets like an instrument demo. Piano
// alone over the two screens; the figure gains marimba and a soft bass when
// the machine appears; pulse and strings while it runs; everything stops
// for "But", and the theme comes back in B minor on the piano alone; the
// bass returns for the swap; D major again, strings lifting, when the two
// oranges meet; the theme home on celesta under the credit.
// Theme: A–D–E–F#–E. It meets the picture at the screens lighting (bar 0),
// the explode (bar 7), "But" (bar 21), the two oranges meeting (bar 30)
// and the last chord.
export default function score(S) {
  // the film's intro runs five bars: bar numbers below are the form's, and every
  // bar from 4 on sounds one bar later (bar 4 of the film holds the A sus)
  const T = (bar, beat = 0) => S.at(bar >= 4 ? bar + 1 : bar, beat);
  const rnd = () => S.random();

  const CH = {
    D: { root: 'D', lh: ['D2', 'A2'], arp: ['D4', 'F#4', 'A4', 'E5'] },
    Dmaj9: { root: 'D', lh: ['D2', 'A2'], arp: ['F#4', 'A4', 'C#5', 'E5'] },
    'A/C#': { root: 'C#', lh: ['C#2', 'A2'], arp: ['E4', 'A4', 'C#5', 'E5'] },
    Bm7: { root: 'B', lh: ['B1', 'F#2'], arp: ['D4', 'F#4', 'A4', 'D5'] },
    Gmaj7: { root: 'G', lh: ['G1', 'D2'], arp: ['D4', 'F#4', 'B4', 'D5'] },
    Asus: { root: 'A', lh: ['A1', 'E2'], arp: ['D4', 'E4', 'A4', 'D5'] },
    A: { root: 'A', lh: ['A1', 'E2'], arp: ['C#4', 'E4', 'A4', 'C#5'] },
    Em7: { root: 'E', lh: ['E2', 'B2'], arp: ['D4', 'G4', 'B4', 'E5'] },
    'F#m7': { root: 'F#', lh: ['F#1', 'C#2'], arp: ['C#4', 'E4', 'A4', 'C#5'] },
    G6: { root: 'G', lh: ['G1', 'D2'], arp: ['E4', 'G4', 'B4', 'D5'] },
    Bm: { root: 'B', lh: ['B1', 'F#2'], arp: ['D4', 'F#4', 'B4', 'D5'] },
    'Bm/A': { root: 'A', lh: ['A1', 'F#2'], arp: ['D4', 'F#4', 'B4', 'D5'] },
    'F#7': { root: 'F#', lh: ['F#1', 'C#2'], arp: ['C#4', 'E4', 'A#4', 'C#5'] },
  };
  // one or two chords per bar
  const FORM = [
    ['Dmaj9'], ['Bm7'], ['Gmaj7'], ['Asus', 'A'],                 // 0–3   the two screens: piano alone
    ['D'], ['A/C#'], ['Bm7'], ['Gmaj7'],                           // 4–7   A: the machine appears
    ['D'], ['A/C#'], ['Gmaj7'], ['Asus', 'A'],                     // 8–11  A: the explode, the dials
    ['Bm7'], ['Gmaj7'], ['D'], ['Asus', 'A'],                      // 12–15 B: the blend
    ['Em7'], ['F#m7'], ['Gmaj7'], ['Asus', 'A'],                   // 16–19 B: the scale, lifting
    ['G6'],                                                        // 20    held: the breath
    ['Bm'], ['Bm/A'], ['Gmaj7', 'F#7'],                            // 21–23 break: "But", B minor, piano alone
    ['Bm'], ['Gmaj7'], ['Em7'], ['F#7'],                           // 24–27 C: the swap, the name
    ['G6'], ['Asus', 'A'],                                         // 28–29 C → D
    ['D'], ['A/C#'], ['Bm7'], ['Gmaj7'],                           // 30–33 D: the oranges meet, the line
    ['Gmaj7'], ['Asus'], ['D'], ['D'],                             // 34–37 coda: the credit, home
  ];
  const chordAt = (bar, beat = 0) => { const f = FORM[bar] || ['D']; return CH[f.length > 1 && beat >= 2 ? f[1] : f[0]]; };

  // the figure: the same eighth-note shape every bar, its notes from the chord
  const SHAPE = [0, 2, 1, 3, 2, 1, 3, 2];
  const THEME_BARS = new Set([0, 1, 2, 15, 19, 32, 33, 34, 35]); // the figure steps back while the theme sings
  function figure(bar, v, { skip = 0.12 } = {}) {
    if (THEME_BARS.has(bar)) v *= 0.5;
    for (let i = 0; i < 8; i++) {
      const c = chordAt(bar, i / 2);
      if (i > 0 && rnd() < skip) continue;
      S.note(T(bar, i / 2), 'felt', c.arp[SHAPE[i]], S.beat * 0.9, (i % 4 === 0 ? 0.085 : 0.062) * v * (0.9 + rnd() * 0.2));
    }
  }
  function lh(bar, v, held = false) {
    const f = FORM[bar] || ['D'];
    if (held || f.length < 2) S.chord(T(bar), 'felt', chordAt(bar).lh, S.bar * 0.95, 0.085 * v, { strum: 0.012 });
    else for (const b of [0, 2]) S.chord(T(bar, b), 'felt', chordAt(bar, b).lh, S.beat * 1.9, 0.085 * v, { strum: 0.012 });
  }
  function marimba(bar, v) {
    if (THEME_BARS.has(bar)) v *= 0.4;
    const c = chordAt(bar), d = chordAt(bar, 2);
    for (const [b, n] of [[0.5, c.arp[2]], [1.5, c.arp[3]], [2.5, d.arp[1]], [3, d.arp[2]], [3.5, d.arp[3]]]) {
      if (rnd() < 0.18) continue;
      S.note(T(bar, b), 'bell', S.midi(n) + 12, S.beat * 0.4, 0.06 * v * (0.85 + rnd() * 0.3), { kind: 'marimba' });
    }
  }
  const bassNote = (r) => `${r}${['A', 'B', 'G', 'F#'].includes(r) ? 1 : 2}`;
  function bass(bar, v, walk = false) {
    const f = FORM[bar] || ['D'];
    S.note(T(bar), 'bass', bassNote(chordAt(bar).root), S.beat * 1.8, 0.2 * v, { kind: 'finger' });
    if (f.length > 1) S.note(T(bar, 2), 'bass', bassNote(chordAt(bar, 2).root), S.beat * 1.8, 0.18 * v, { kind: 'finger' });
    else S.note(T(bar, 2.5), 'bass', S.midi(bassNote(chordAt(bar).root)) + 7, S.beat * 0.9, 0.12 * v, { kind: 'finger' });
    if (walk) S.note(T(bar, 3.5), 'bass', S.midi(bassNote(chordAt(bar + 1).root)) - 1, S.beat * 0.45, 0.1 * v, { kind: 'finger' });
  }
  function pulse(bar, v) {
    S.drum('kick', T(bar), 0.2 * v);
    S.drum('kick', T(bar, 2.5), 0.12 * v);
    for (let i = 0; i < 8; i++) S.drum('shaker', T(bar, i / 2), (i % 2 ? 0.045 : 0.028) * v * (0.85 + rnd() * 0.3));
    S.drum('rim', T(bar, 3), 0.07 * v);
  }
  // strings sit low (root and third) and step back while the theme sings
  const strings = (bar, v, beats = 4) => S.chord(T(bar), 'strings', [chordAt(bar).lh[0], chordAt(bar).lh[1], chordAt(bar).arp[0]], S.beat * beats, 0.036 * v * (THEME_BARS.has(bar) ? 0.5 : 1));

  // ── the two screens (0–3): piano alone, the theme stated before the first word
  for (let b = 0; b < 4; b++) { figure(b, b === 0 ? 0.7 : 0.85, { skip: 0.25 }); lh(b, 0.9, true); }
  S.line(T(0), 'felt', 'A5:.5 D6 E6 F#6:1 E6:1.5', 0.14, { bus: 'lead' });
  S.line(T(2, 2), 'felt', 'B5:.5 D6 E6:1 r:2', 0.1, { bus: 'lead' });

  // the held bar: the A sus hangs while the camera pushes into the screen
  S.chord(S.at(4), 'felt', ['A1', 'E2', 'D4', 'E4', 'A4'], S.bar * 0.95, 0.075, { strum: 0.03 });
  S.note(S.at(4, 2), 'felt', 'E5', S.beat * 1.5, 0.05);
  S.note(S.at(4, 3), 'felt', 'C#5', S.beat, 0.05);

  // ── A (4–11): the machine. Marimba and a soft bass join the figure
  for (let b = 4; b < 12; b++) {
    figure(b, 0.9);
    lh(b, 0.75);
    marimba(b, b < 8 ? 0.7 : 0.9);
    bass(b, b < 8 ? 0.7 : 0.85, b % 4 === 3);
  }
  // the explode: a lift into bar 8
  S.chord(T(7, 2), 'strings', ['G2', 'D3', 'B3', 'F#4'], S.beat * 2, 0.04);
  S.note(T(8), 'bell', 'A5', S.beat * 2, 0.06, { kind: 'vibes' });

  // ── B (12–19): the machine running. Pulse and strings; the figure keeps its shape
  for (let b = 12; b < 20; b++) {
    figure(b, 0.95, { skip: 0.08 });
    lh(b, 0.7);
    marimba(b, 0.85);
    bass(b, 1, b % 2 === 1);
    pulse(b, b < 16 ? 0.7 : 0.9);
    strings(b, b < 16 ? 0.7 : 1);
  }
  // the theme on vibes, answered, where the lines leave room
  S.line(T(15, 2), 'bell', 'A5:.5 D6 E6:1 r:2', 0.12, { kind: 'vibes', bus: 'lead' });
  S.line(T(19), 'bell', 'A5:.5 D6 E6 F#6:1 E6:1.5', 0.13, { kind: 'vibes', bus: 'lead' });
  S.drum('crash', T(16), 0.04);

  // ── the breath (20): the band stops on a G6, one held chord
  S.chord(T(20), 'felt', ['G1', 'D2', 'B3', 'E4', 'G4'], S.bar, 0.08, { strum: 0.03 });
  S.chord(T(20), 'strings', ['G2', 'D3', 'B3', 'E4'], S.bar * 0.9, 0.04);
  S.note(T(20, 2), 'felt', 'A4', S.beat * 1.5, 0.05);

  // ── break (21–23): "But" — B minor, the theme on the piano alone
  for (let b = 21; b < 24; b++) lh(b, 0.85, b < 23);
  S.line(T(21), 'felt', 'F#4:.5 B4 C#5 D5:1 C#5:1.5', 0.09, { bus: 'lead' });
  S.line(T(22, 2), 'felt', 'D5:.5 C#5 B4:1 r:2', 0.07, { bus: 'lead' });
  S.line(T(23), 'felt', 'B4:1 A#4:1 C#5:2', 0.07);

  // ── C (24–29): the swap and the name. The bass returns, minor colour, no drums
  for (let b = 24; b < 30; b++) {
    figure(b, 0.85, { skip: 0.15 });
    lh(b, 0.75);
    bass(b, 0.85, b === 27);
    S.chord(T(b), 'strings', [chordAt(b).lh[0], ...chordAt(b).arp.slice(0, 2)], S.bar, 0.04);
  }
  S.note(T(26), 'timpani', 'E2', S.beat * 2, 0.08);

  // ── D (30–33): the oranges meet. D major, strings lift, the theme in full where the voice rests
  for (let b = 30; b < 34; b++) {
    figure(b, 1, { skip: 0.05 });
    lh(b, 0.8);
    marimba(b, 0.8);
    bass(b, 1, b % 2 === 1);
    pulse(b, 0.75);
    strings(b, 1.4);
  }
  S.drum('crash', T(30), 0.05);
  S.line(T(32, 2), 'bell', 'A5:.5 D6 E6:1 r:2', 0.13, { kind: 'vibes', bus: 'lead' });
  S.line(T(33), 'bell', 'F#6:1 E6:1 D6:2', 0.13, { kind: 'vibes', bus: 'lead' });

  // ── coda (34–36): the theme home on celesta, the last D rings out
  figure(34, 0.7, { skip: 0.3 }); lh(34, 0.7, true); strings(34, 0.9);
  S.line(T(34), 'bell', 'A5:.5 D6 E6 F#6:1 E6:1.5', 0.15, { kind: 'celesta', bus: 'lead' });
  S.line(T(35), 'bell', 'E6:1 D6:3', 0.14, { kind: 'celesta', bus: 'lead' });
  // the last D lands under the celesta's D and rings to the last frame
  S.chord(T(35, 1), 'felt', ['D1', 'D2', 'A2', 'F#4', 'A4', 'D5'], S.beat * 3.5, 0.1, { strum: 0.02 });
  S.chord(T(35, 1), 'strings', ['D2', 'A2', 'F#3', 'D4'], S.beat * 3.5, 0.06);
}
