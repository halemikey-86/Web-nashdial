import { mod12 } from './notes';
import type { InstrumentId } from './tunings';

/**
 * Standard notation helpers: key signatures, spelling a pitch in a key, where it sits on the
 * staff, and turning a run of eighth-note slots into notes and rests a reader expects.
 *
 * Guitar, 7-string, 8-string and bass are all written an octave above where they sound
 * (the little 8 under the clef), so every written position here is one octave up.
 */

export type Clef = 'treble' | 'bass';
/** Which staff an instrument reads from. The 8-string's low notes go on a bass staff below. */
export type StaffLayout = 'treble' | 'bass' | 'grand';

export function staffLayout(instrument: InstrumentId): StaffLayout {
  if (instrument === `bass`) return `bass`;
  if (instrument === `8-string`) return `grand`;
  return `treble`;
}

const LETTERS = [`C`, `D`, `E`, `F`, `G`, `A`, `B`] as const;
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
// Letter indices in the order sharps / flats are added to a key signature.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
// Sharps (+) or flats (−) in each major key, by key index (C = 0).
const MAJOR_FIFTHS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
// How far above the tonic each scale's parent major key sits (D dorian → C major).
const PARENT_MAJOR: Record<string, number> = {
  major: 0,
  'major-pentatonic': 0,
  dorian: 10,
  phrygian: 8,
  lydian: 7,
  mixolydian: 5,
  'natural-minor': 3,
  'minor-pentatonic': 3,
  blues: 3,
  'harmonic-minor': 3,
  'melodic-minor': 3,
  locrian: 1,
};

/** Key index of the major key whose signature a scale uses (D dorian → C). */
export function parentMajor(keyIndex: number, scaleId: string): number {
  return mod12(keyIndex + (PARENT_MAJOR[scaleId] ?? 0));
}

/** Sharps (positive) or flats (negative) in the key signature for a key and scale. */
export function keySignature(keyIndex: number, scaleId: string): number {
  return MAJOR_FIFTHS[parentMajor(keyIndex, scaleId)];
}

/** The letters a key signature alters, in the order they're written ("F♯, C♯"). */
export function keySignatureLetters(fifths: number): { letter: number; alter: 1 | -1 }[] {
  return fifths >= 0 ? SHARP_ORDER.slice(0, fifths).map((letter) => ({ letter, alter: 1 as const })) : FLAT_ORDER.slice(0, -fifths).map((letter) => ({ letter, alter: -1 as const }));
}

function signatureAlter(fifths: number): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const { letter, alter } of keySignatureLetters(fifths)) out[letter] = alter;
  return out;
}

export interface Spelled {
  /** 0–6, C to B. */
  letter: number;
  /** −1 flat, 0 natural, +1 sharp. */
  alter: number;
  /** Scientific octave of the letter as sounding (B♯3 and C4 share a pitch but not an octave). */
  octave: number;
}

/**
 * A MIDI pitch spelled the way the key writes it: in the key signature if it fits, otherwise a
 * natural, otherwise ♭ for the "blue" notes (♭2 ♭3 ♭5 ♭6 ♭7 above the tonic) and ♯ for the rest.
 */
export function spellMidi(midi: number, fifths: number, tonic: number): Spelled {
  const pc = mod12(midi);
  const sig = signatureAlter(fifths);
  const candidates: Spelled[] = [];
  for (let letter = 0; letter < 7; letter++) {
    for (const alter of [0, 1, -1]) {
      if (mod12(NATURAL_PC[letter] + alter) !== pc) continue;
      const natural = midi - alter;
      candidates.push({ letter, alter, octave: Math.floor(natural / 12) - 1 });
    }
  }
  const inKey = candidates.find((c) => c.alter === sig[c.letter]);
  if (inKey) return inKey;
  const natural = candidates.find((c) => c.alter === 0);
  if (natural) return natural;
  const flat = [1, 3, 6, 8, 10].includes(mod12(pc - tonic));
  return candidates.find((c) => c.alter === (flat ? -1 : 1)) ?? candidates[0];
}

/** "F♯" / "B♭" / "E". */
export function spelledName(s: Spelled): string {
  return `${LETTERS[s.letter]}${s.alter > 0 ? `♯` : s.alter < 0 ? `♭` : ``}`;
}

/** Diatonic step of the written note (C0 = 0), an octave above sounding. */
export function writtenStep(s: Spelled): number {
  return (s.octave + 1) * 7 + s.letter;
}

// Written step of each clef's bottom line: E4 and G2.
const BOTTOM_LINE: Record<Clef, number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 };

/** Half-spaces above the clef's bottom line: 0 bottom line, 1 first space … 8 top line. */
export function staffPosition(step: number, clef: Clef): number {
  return step - BOTTOM_LINE[clef];
}

/** Grand staff split: written middle C and up on the treble staff, below it on the bass staff. */
export function clefFor(step: number, layout: StaffLayout): Clef {
  if (layout === `grand`) return step >= 4 * 7 ? `treble` : `bass`;
  return layout;
}

/** Key-signature symbol positions on a clef (sharps F C G D A E B / flats B E A D G C F). */
export function keySignaturePositions(fifths: number, clef: Clef): number[] {
  const treble = fifths >= 0 ? [8, 5, 9, 6, 3, 7, 4] : [4, 7, 3, 6, 2, 5, 1];
  const shift = clef === `bass` ? -2 : 0;
  return treble.slice(0, Math.abs(fifths)).map((p) => p + shift);
}

/* ---------- Rhythm ---------- */

/** One notated event: a note or rest lasting `dur` eighths, starting at eighth `start` in its bar. */
export interface NotatedEvent {
  start: number;
  dur: 1 | 2 | 3 | 4 | 6 | 8;
  /** Index into the source slots of the note (for highlighting), or null for a rest. */
  slot: number | null;
  midi: number | null;
}

const EIGHTHS_PER_BAR = 8;

/** Longest note value that can start at `start` and fit in `room` eighths without looking odd. */
function heldLength(start: number, room: number): NotatedEvent['dur'] {
  const ok: NotatedEvent['dur'][] = start % 2 === 1 ? [3, 1] : start % 4 === 0 ? [8, 6, 4, 3, 2, 1] : [6, 3, 2, 1];
  return ok.find((d) => d <= room && !(d === 8 && start !== 0) && !(d === 6 && start > 2)) ?? 1;
}

/** Rests covering eighths [from, to) in a bar, merged into quarters and halves on the beat. */
function rests(from: number, to: number): NotatedEvent[] {
  const out: NotatedEvent[] = [];
  let s = from;
  while (s < to) {
    const d: NotatedEvent['dur'] = s === 0 && to === 8 ? 8 : s % 4 === 0 && s + 4 <= to ? 4 : s % 2 === 0 && s + 2 <= to ? 2 : 1;
    out.push({ start: s, dur: d, slot: null, midi: null });
    s += d;
  }
  return out;
}

/**
 * Eighth-note slots (a pitch or null) → bars of notes and rests. Every note is an eighth except
 * the last one, which rings to the end of its bar.
 */
export function notateEighths(slots: (number | null)[]): NotatedEvent[][] {
  const bars: NotatedEvent[][] = [];
  const lastNote = slots.reduce<number>((last, p, i) => (p !== null ? i : last), -1);
  for (let base = 0; base < slots.length; base += EIGHTHS_PER_BAR) {
    const bar: NotatedEvent[] = [];
    let restFrom: number | null = null;
    let s = 0;
    while (s < EIGHTHS_PER_BAR) {
      const i = base + s;
      const midi = i < slots.length ? slots[i] : null;
      if (midi === null) {
        restFrom ??= s;
        s++;
        continue;
      }
      if (restFrom !== null) bar.push(...rests(restFrom, s));
      restFrom = null;
      const dur = i === lastNote ? heldLength(s, EIGHTHS_PER_BAR - s) : 1;
      bar.push({ start: s, dur, slot: i, midi });
      s += dur;
    }
    if (restFrom !== null) bar.push(...rests(restFrom, EIGHTHS_PER_BAR));
    bars.push(bar);
  }
  return bars;
}

/** Pitches as quarter notes, four to a bar, the last bar filled out with rests. */
export function notateQuarters(midis: number[]): NotatedEvent[][] {
  const bars: NotatedEvent[][] = [];
  midis.forEach((midi, i) => {
    if (i % 4 === 0) bars.push([]);
    bars[bars.length - 1].push({ start: (i % 4) * 2, dur: 2, slot: i, midi });
  });
  const tail = bars[bars.length - 1];
  if (tail && tail.length < 4) tail.push(...rests(tail.length * 2, EIGHTHS_PER_BAR));
  return bars;
}

/** The staff's line and space names, bottom up, for reading practice. */
export function staffMnemonic(clef: Clef): { lines: string; spaces: string } {
  return clef === `treble` ? { lines: `E G B D F`, spaces: `F A C E` } : { lines: `G B D F A`, spaces: `A C E G` };
}
