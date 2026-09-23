import { noteAt, noteIndex } from './notes';
import { degreeOf, scaleNotes } from './scales';
import type { Tuning } from './tunings';

export interface FretCell {
  stringIndex: number;
  fret: number;
  note: string;
  degree: number | null;
  inScale: boolean;
}

export function noteAtFret(openNote: string, fret: number): string {
  return noteAt(noteIndex(openNote) + fret);
}

export function buildFretboard(tuning: Tuning, root: string, scaleId: string, fretCount = 15): FretCell[][] {
  const inScale = new Set(scaleNotes(root, scaleId));
  return tuning.strings.map((open, stringIndex) => {
    const cells: FretCell[] = [];
    for (let fret = 0; fret <= fretCount; fret++) {
      const note = noteAtFret(open, fret);
      const hit = inScale.has(note);
      cells.push({ stringIndex, fret, note, degree: hit ? degreeOf(note, root, scaleId) : null, inScale: hit });
    }
    return cells;
  });
}
