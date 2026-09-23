import { KEYS, mod12, noteAt, noteIndex, prefersFlats, spellNote } from './notes';

export type ChordQuality = 'major' | 'minor' | 'dim' | 'aug';
export type ScaleCategory = 'key' | 'modes' | 'scales';

export interface Scale {
  id: string;
  name: string;
  shortName: string;
  category: ScaleCategory;
  intervals: number[];
  nashville: string[];
  chordQualities?: ChordQuality[];
  chordSuffixes?: string[];
}

export interface DiatonicChord {
  degree: number;
  root: string;
  label: string;
  quality: ChordQuality;
}

export const SCALES: Scale[] = [
  {
    id: `major`,
    name: `Major`,
    shortName: `Major`,
    category: `key`,
    intervals: [0, 2, 4, 5, 7, 9, 11],
    nashville: [`1`, `2`, `3`, `4`, `5`, `6`, `7`],
    chordQualities: [`major`, `minor`, `minor`, `major`, `major`, `minor`, `dim`],
    chordSuffixes: [``, `m`, `m`, ``, ``, `m`, `dim`],
  },
  {
    id: `dorian`,
    name: `Dorian`,
    shortName: `Dorian`,
    category: `modes`,
    intervals: [0, 2, 3, 5, 7, 9, 10],
    nashville: [`1`, `2`, `♭3`, `4`, `5`, `6`, `♭7`],
    chordQualities: [`minor`, `minor`, `major`, `major`, `minor`, `dim`, `major`],
    chordSuffixes: [`m`, `m`, ``, ``, `m`, `dim`, ``],
  },
  {
    id: `phrygian`,
    name: `Phrygian`,
    shortName: `Phrygian`,
    category: `modes`,
    intervals: [0, 1, 3, 5, 7, 8, 10],
    nashville: [`1`, `♭2`, `♭3`, `4`, `5`, `♭6`, `♭7`],
    chordQualities: [`minor`, `major`, `major`, `minor`, `dim`, `major`, `minor`],
    chordSuffixes: [`m`, ``, ``, `m`, `dim`, ``, `m`],
  },
  {
    id: `lydian`,
    name: `Lydian`,
    shortName: `Lydian`,
    category: `modes`,
    intervals: [0, 2, 4, 6, 7, 9, 11],
    nashville: [`1`, `2`, `3`, `♯4`, `5`, `6`, `7`],
    chordQualities: [`major`, `major`, `minor`, `dim`, `major`, `minor`, `minor`],
    chordSuffixes: [``, ``, `m`, `dim`, ``, `m`, `m`],
  },
  {
    id: `mixolydian`,
    name: `Mixolydian`,
    shortName: `Mixolydian`,
    category: `modes`,
    intervals: [0, 2, 4, 5, 7, 9, 10],
    nashville: [`1`, `2`, `3`, `4`, `5`, `6`, `♭7`],
    chordQualities: [`major`, `minor`, `dim`, `major`, `minor`, `minor`, `major`],
    chordSuffixes: [``, `m`, `dim`, ``, `m`, `m`, ``],
  },
  {
    id: `natural-minor`,
    name: `Minor`,
    shortName: `Minor`,
    category: `key`,
    intervals: [0, 2, 3, 5, 7, 8, 10],
    nashville: [`1`, `2`, `♭3`, `4`, `5`, `♭6`, `♭7`],
    chordQualities: [`minor`, `dim`, `major`, `minor`, `minor`, `major`, `major`],
    chordSuffixes: [`m`, `dim`, ``, `m`, `m`, ``, ``],
  },
  {
    id: `locrian`,
    name: `Locrian`,
    shortName: `Locrian`,
    category: `modes`,
    intervals: [0, 1, 3, 5, 6, 8, 10],
    nashville: [`1`, `♭2`, `♭3`, `4`, `♭5`, `♭6`, `♭7`],
    chordQualities: [`dim`, `major`, `minor`, `minor`, `major`, `major`, `minor`],
    chordSuffixes: [`dim`, ``, `m`, `m`, ``, ``, `m`],
  },
  {
    id: `major-pentatonic`,
    name: `Major Pentatonic`,
    shortName: `Maj Pent`,
    category: `scales`,
    intervals: [0, 2, 4, 7, 9],
    nashville: [`1`, `2`, `3`, `5`, `6`],
  },
  {
    id: `minor-pentatonic`,
    name: `Minor Pentatonic`,
    shortName: `Min Pent`,
    category: `scales`,
    intervals: [0, 3, 5, 7, 10],
    nashville: [`1`, `♭3`, `4`, `5`, `♭7`],
  },
  {
    id: `blues`,
    name: `Blues`,
    shortName: `Blues`,
    category: `scales`,
    intervals: [0, 3, 5, 6, 7, 10],
    nashville: [`1`, `♭3`, `4`, `♭5`, `5`, `♭7`],
  },
  {
    id: `harmonic-minor`,
    name: `Harmonic Minor`,
    shortName: `Harm Min`,
    category: `scales`,
    intervals: [0, 2, 3, 5, 7, 8, 11],
    nashville: [`1`, `2`, `♭3`, `4`, `5`, `♭6`, `7`],
    chordQualities: [`minor`, `dim`, `aug`, `minor`, `major`, `major`, `dim`],
    chordSuffixes: [`m`, `dim`, `+`, `m`, ``, ``, `dim`],
  },
  {
    id: `melodic-minor`,
    name: `Melodic Minor`,
    shortName: `Mel Min`,
    category: `scales`,
    intervals: [0, 2, 3, 5, 7, 9, 11],
    nashville: [`1`, `2`, `♭3`, `4`, `5`, `6`, `7`],
    chordQualities: [`minor`, `minor`, `aug`, `major`, `major`, `dim`, `dim`],
    chordSuffixes: [`m`, `m`, `+`, ``, ``, `dim`, `dim`],
  },
];

export const DEFAULT_SCALE_ID = `major`;

export function getScale(id: string): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

export function scaleNotes(root: string, scaleId: string): string[] {
  const scale = getScale(scaleId);
  const start = noteIndex(root);
  return scale.intervals.map((i) => noteAt(start + i));
}

export function nashvilleLabels(scaleId: string): string[] {
  return [...getScale(scaleId).nashville];
}

export function degreeOf(note: string, root: string, scaleId: string): number | null {
  const i = scaleNotes(root, scaleId).indexOf(note);
  return i === -1 ? null : i + 1;
}

export function hasRelativeKey(scaleId: string): boolean {
  return scaleId === `major` || scaleId === `natural-minor`;
}

export function relativeKeyIndex(keyIndex: number, scaleId: string): number | null {
  if (scaleId === `major`) return (keyIndex + 9) % 12;
  if (scaleId === `natural-minor`) return (keyIndex + 3) % 12;
  return null;
}

function inferTriad(root: string, notes: Set<string>): { quality: ChordQuality; suffix: string } {
  const r = noteIndex(root);
  const m3 = noteAt(r + 3);
  const M3 = noteAt(r + 4);
  const d5 = noteAt(r + 6);
  const p5 = noteAt(r + 7);
  if (notes.has(m3) && notes.has(d5)) return { quality: `dim`, suffix: `dim` };
  if (notes.has(M3) && notes.has(p5)) return { quality: `major`, suffix: `` };
  if (notes.has(m3) && notes.has(p5)) return { quality: `minor`, suffix: `m` };
  if (notes.has(M3) && notes.has(noteAt(r + 8))) return { quality: `aug`, suffix: `+` };
  if (notes.has(M3)) return { quality: `major`, suffix: `` };
  if (notes.has(m3)) return { quality: `minor`, suffix: `m` };
  return { quality: `major`, suffix: `` };
}

export function diatonicChords(root: string, scaleId: string): DiatonicChord[] {
  const scale = getScale(scaleId);
  const notes = scaleNotes(root, scaleId);
  const flats = prefersFlats(noteIndex(root), scaleId);
  const displayNote = (n: string) => spellNote(noteIndex(n), flats);
  if (scale.chordQualities && scale.chordSuffixes) {
    const { chordQualities, chordSuffixes } = scale;
    return notes.map((note, i) => ({
      degree: i + 1,
      root: note,
      label: `${displayNote(note)}${chordSuffixes[i]}`,
      quality: chordQualities[i],
    }));
  }
  const set = new Set(notes);
  return notes.map((note, i) => {
    const { quality, suffix } = inferTriad(note, set);
    return { degree: i + 1, root: note, label: `${displayNote(note)}${suffix}`, quality };
  });
}

/** "G Major" style label for the key you'd finger when a capo is on. */
export function shapeKeyLabel(keyIndex: number, scaleId: string, capo: number): string {
  return `${KEYS[mod12(keyIndex - capo)].label} ${getScale(scaleId).shortName}`;
}
