import { KEYS, mod12, noteIndex } from './notes';
import { diatonicChords, getScale, scaleNotes, type DiatonicChord } from './scales';

/** Circle-of-fifths position of each major key (C = 0, G = 1 … F = 11). */
const FIFTHS_POSITION = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const SHARP_ORDER = [`F♯`, `C♯`, `G♯`, `D♯`, `A♯`, `E♯`, `B♯`];
const FLAT_ORDER = [`B♭`, `E♭`, `A♭`, `D♭`, `G♭`, `C♭`, `F♭`];

/** Major key that shares this scale's notes (parent key), or null for scales outside the major system. */
export function parentMajor(keyIndex: number, scaleId: string): number | null {
  const offsets: Record<string, number> = { major: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, 'natural-minor': 9, locrian: 11 };
  const o = offsets[scaleId];
  return o === undefined ? null : mod12(keyIndex - o);
}

export interface KeySignature {
  count: number;
  kind: 'sharps' | 'flats' | 'none';
  accidentals: string[];
  label: string;
}

export function keySignature(keyIndex: number, scaleId: string): KeySignature | null {
  const major = parentMajor(keyIndex, scaleId);
  if (major === null) return null;
  const pos = FIFTHS_POSITION.indexOf(major);
  // Prefer flats for F, B♭, E♭, A♭, D♭ (positions 11..7); G♭/F♯ shown as 6♯.
  if (pos === 0) return { count: 0, kind: `none`, accidentals: [], label: `No sharps or flats` };
  if (pos <= 6) {
    const acc = SHARP_ORDER.slice(0, pos);
    return { count: pos, kind: `sharps`, accidentals: acc, label: `${pos} sharp${pos === 1 ? `` : `s`}: ${acc.join(` `)}` };
  }
  const n = 12 - pos;
  const acc = FLAT_ORDER.slice(0, n);
  return { count: n, kind: `flats`, accidentals: acc, label: `${n} flat${n === 1 ? `` : `s`}: ${acc.join(` `)}` };
}

/** Whole/half-step pattern of a scale, e.g. W W H W W W H. */
export function stepPattern(scaleId: string): string[] {
  const iv = getScale(scaleId).intervals;
  return iv.map((v, i) => {
    const next = i + 1 < iv.length ? iv[i + 1] : 12;
    const d = next - v;
    return d === 1 ? `H` : d === 2 ? `W` : d === 3 ? `W+H` : `${d}`;
  });
}

const SEVENTH_NAMES: Record<string, { suffix: string; name: string }> = {
  '4,7,11': { suffix: `maj7`, name: `major 7th` },
  '3,7,10': { suffix: `m7`, name: `minor 7th` },
  '4,7,10': { suffix: `7`, name: `dominant 7th` },
  '3,6,10': { suffix: `m7♭5`, name: `half-diminished` },
  '3,6,9': { suffix: `dim7`, name: `diminished 7th` },
  '3,7,11': { suffix: `m(maj7)`, name: `minor-major 7th` },
  '4,8,11': { suffix: `+maj7`, name: `augmented major 7th` },
  '4,8,10': { suffix: `+7`, name: `augmented 7th` },
};

export interface SeventhChord {
  degree: number;
  label: string;
  quality: string;
  tones: string[];
}

/** Stack thirds on each degree of a 7-note scale to get its 7th chords. */
export function seventhChords(root: string, scaleId: string): SeventhChord[] {
  const notes = scaleNotes(root, scaleId);
  if (notes.length !== 7) return [];
  return notes.map((n, i) => {
    const tones = [0, 2, 4, 6].map((k) => notes[(i + k) % 7]);
    const r = noteIndex(n);
    const key = tones
      .slice(1)
      .map((t) => mod12(noteIndex(t) - r))
      .join(`,`);
    const q = SEVENTH_NAMES[key] ?? { suffix: `7`, name: `7th` };
    return { degree: i + 1, label: `${n.replace(`#`, `♯`)}${q.suffix}`, quality: q.name, tones: tones.map((t) => t.replace(`#`, `♯`)) };
  });
}

export interface Progression {
  name: string;
  /** 1-based scale degrees. */
  degrees: number[];
  feel: string;
}

const MAJOR_PROGRESSIONS: Progression[] = [
  { name: `I – IV – V`, degrees: [1, 4, 5], feel: `Rock, country, folk — the three-chord song` },
  { name: `I – V – vi – IV`, degrees: [1, 5, 6, 4], feel: `The modern pop / worship progression` },
  { name: `I – vi – IV – V`, degrees: [1, 6, 4, 5], feel: `50s doo-wop` },
  { name: `vi – IV – I – V`, degrees: [6, 4, 1, 5], feel: `Same chords as pop, sadder start` },
  { name: `ii – V – I`, degrees: [2, 5, 1], feel: `Jazz's most common cadence` },
  { name: `I – IV – vi – V`, degrees: [1, 4, 6, 5], feel: `Anthemic, builds tension` },
  { name: `12-bar blues`, degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], feel: `One chord per bar — the blues form` },
];

const MINOR_PROGRESSIONS: Progression[] = [
  { name: `i – iv – v`, degrees: [1, 4, 5], feel: `Minor three-chord song` },
  { name: `i – VI – III – VII`, degrees: [1, 6, 3, 7], feel: `Epic minor pop / rock` },
  { name: `i – VII – VI – VII`, degrees: [1, 7, 6, 7], feel: `Driving rock riff progression` },
  { name: `i – iv – VII – III`, degrees: [1, 4, 7, 3], feel: `Circle-of-fifths movement` },
  { name: `i – VI – iv – v`, degrees: [1, 6, 4, 5], feel: `Dark ballad` },
];

export function progressionsFor(scaleId: string): Progression[] {
  if (scaleId === `major` || scaleId === `lydian` || scaleId === `mixolydian`) return MAJOR_PROGRESSIONS;
  if (scaleId === `natural-minor` || scaleId === `dorian` || scaleId === `phrygian` || scaleId === `harmonic-minor` || scaleId === `melodic-minor`)
    return MINOR_PROGRESSIONS;
  return [];
}

export function progressionChords(root: string, scaleId: string, p: Progression): DiatonicChord[] {
  const chords = diatonicChords(root, scaleId);
  return p.degrees.map((d) => chords[(d - 1) % chords.length]);
}

export const INTERVAL_NAMES = [
  `Unison`,
  `Minor 2nd`,
  `Major 2nd`,
  `Minor 3rd`,
  `Major 3rd`,
  `Perfect 4th`,
  `Tritone`,
  `Perfect 5th`,
  `Minor 6th`,
  `Major 6th`,
  `Minor 7th`,
  `Major 7th`,
  `Octave`,
];

export interface CapoOption {
  capo: number;
  /** Key whose chord shapes you finger. */
  shapeKey: number;
  shapeLabel: string;
}

/** Keys with lots of open chords: C, G, D, A, E major and A, E, D minor. */
const OPEN_MAJOR = new Set([0, 7, 2, 9, 4]);
const OPEN_MINOR = new Set([9, 4, 2]);

const isMinorish = (scaleId: string) => [`natural-minor`, `dorian`, `phrygian`, `harmonic-minor`, `melodic-minor`, `minor-pentatonic`, `blues`, `locrian`].includes(scaleId);

/** Capo positions (1–9) that let you play this key with open-chord shapes. */
export function easyCapoOptions(keyIndex: number, scaleId: string): CapoOption[] {
  const minor = isMinorish(scaleId);
  const out: CapoOption[] = [];
  for (let capo = 1; capo <= 9; capo++) {
    const shapeKey = mod12(keyIndex - capo);
    if ((minor ? OPEN_MINOR : OPEN_MAJOR).has(shapeKey)) out.push({ capo, shapeKey, shapeLabel: `${KEYS[shapeKey].label}${minor ? `m` : ``}` });
  }
  return out;
}

/** Chord shapes to finger with a capo, paired with what they sound like. */
export function capoChordMap(keyIndex: number, scaleId: string, capo: number): { shape: DiatonicChord; sounds: DiatonicChord }[] {
  const sounds = diatonicChords(KEYS[keyIndex].root, scaleId);
  const shapes = diatonicChords(KEYS[mod12(keyIndex - capo)].root, scaleId);
  return shapes.map((shape, i) => ({ shape, sounds: sounds[i] }));
}
