import { noteAtFret } from './fretboard';
import type { Tuning } from './tunings';

/** Which chord tone is on the lowest string of a triad shape. */
export type Inversion = 'root' | 'first' | 'second';

export const INVERSION_INFO: Record<Inversion, { name: string; short: string; color: string; text: string }> = {
  root: { name: `Root position`, short: `Root`, color: `#9b3fd6`, text: `#fff` },
  first: { name: `1st inversion`, short: `1st inv`, color: `#f2d016`, text: `#1a1a1a` },
  second: { name: `2nd inversion`, short: `2nd inv`, color: `#18c4e0`, text: `#10252a` },
};

export const INVERSIONS: Inversion[] = [`root`, `first`, `second`];

export interface Voicing {
  /** Lowest of the three adjacent strings (0 = lowest string). */
  set: number;
  frets: [number, number, number];
  inversion: Inversion;
}

/** Largest fret span allowed inside one triad shape. */
const MAX_SPAN = 3;

/**
 * Every playable triad shape on three adjacent strings: one root, one 3rd and one 5th,
 * within a four-fret reach, between the capo and `maxFret`.
 * `tones` maps each chord note to its role label ("R", "3"/"♭3", "5"/"♭5"/"♯5").
 */
export function triadVoicings(tuning: Tuning, tones: Map<string, string>, maxFret: number, capo = 0): Voicing[] {
  const count = tuning.strings.length;
  const tonesOn = (s: number) => {
    const out: { fret: number; role: string }[] = [];
    for (let f = capo; f <= maxFret; f++) {
      const role = tones.get(noteAtFret(tuning.strings[s], f));
      if (role) out.push({ fret: f, role });
    }
    return out;
  };
  const perString = Array.from({ length: count }, (_, s) => tonesOn(s));
  const voicings: Voicing[] = [];
  for (let set = 0; set + 2 < count; set++) {
    for (const a of perString[set]) {
      for (const b of perString[set + 1]) {
        if (b.role === a.role || Math.abs(b.fret - a.fret) > MAX_SPAN) continue;
        for (const c of perString[set + 2]) {
          if (c.role === a.role || c.role === b.role) continue;
          const lo = Math.min(a.fret, b.fret, c.fret);
          const hi = Math.max(a.fret, b.fret, c.fret);
          if (hi - lo > MAX_SPAN) continue;
          const inversion: Inversion = a.role === `R` ? `root` : a.role.includes(`3`) ? `first` : `second`;
          voicings.push({ set, frets: [a.fret, b.fret, c.fret], inversion });
        }
      }
    }
  }
  return voicings;
}

/** Name for a string set, e.g. "G-B-e" (low → high). */
export function stringSetName(tuning: Tuning, set: number): string {
  const names = tuning.strings.slice(set, set + 3).map((n, i, arr) => (set + i === tuning.strings.length - 1 && arr.length && n === tuning.strings[0] ? n.toLowerCase() : n));
  return names.join(`-`).replace(/#/g, `♯`);
}
