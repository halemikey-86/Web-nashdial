import { noteAtFret } from './fretboard';
import type { ChordQuality, DiatonicChord } from './scales';
import type { Tuning } from './tunings';

export type CagedShape = 'C' | 'A' | 'G' | 'E' | 'D';

export const CAGED: CagedShape[] = [`C`, `A`, `G`, `E`, `D`];

interface ShapeTemplate {
  rootString: number;
  rootFret: number;
  frets: (number | null)[];
}

const MAJOR_SHAPES: Record<CagedShape, ShapeTemplate> = {
  E: { rootString: 0, rootFret: 0, frets: [0, 2, 2, 1, 0, 0] },
  A: { rootString: 1, rootFret: 0, frets: [null, 0, 2, 2, 2, 0] },
  G: { rootString: 0, rootFret: 3, frets: [3, 2, 0, 0, 0, 3] },
  C: { rootString: 1, rootFret: 3, frets: [null, 3, 2, 0, 1, 0] },
  D: { rootString: 2, rootFret: 0, frets: [null, null, 0, 2, 3, 2] },
};

const MINOR_SHAPES: Record<CagedShape, ShapeTemplate> = {
  E: { rootString: 0, rootFret: 0, frets: [0, 2, 2, 0, 0, 0] },
  A: { rootString: 1, rootFret: 0, frets: [null, 0, 2, 2, 1, 0] },
  G: { rootString: 0, rootFret: 3, frets: [3, 2, 0, 0, 3, 3] },
  C: { rootString: 1, rootFret: 3, frets: [null, 3, 2, 0, 0, 0] },
  D: { rootString: 2, rootFret: 0, frets: [null, null, 0, 2, 3, 1] },
};

export interface ShapeString {
  stringIndex: number;
  fret: number | null;
  isRoot: boolean;
}

export interface ResolvedShape {
  shape: CagedShape;
  baseFret: number;
  fingers: ShapeString[];
  strings: ShapeString[];
}

function findFret(tuning: Tuning, stringIndex: number, note: string, from = 0, to = 15): number | null {
  for (let f = from; f <= to; f++) if (noteAtFret(tuning.strings[stringIndex], f) === note) return f;
  return null;
}

function templateFor(shape: CagedShape, quality: ChordQuality): ShapeTemplate | null {
  if (quality === `dim` || quality === `aug`) return null;
  return quality === `major` ? MAJOR_SHAPES[shape] : MINOR_SHAPES[shape];
}

export function resolveShape(
  shape: CagedShape,
  root: string,
  quality: ChordQuality,
  tuning: Tuning,
  capo = 0,
): ResolvedShape | null {
  const tpl = templateFor(shape, quality);
  if (!tpl) return null;
  const rootFret = findFret(tuning, tpl.rootString, root, capo);
  if (rootFret === null) return null;
  const offset = rootFret - (capo + tpl.rootFret);
  const fingers: ShapeString[] = [];
  const strings: ShapeString[] = [];
  tpl.frets.forEach((f, stringIndex) => {
    if (f === null) {
      strings.push({ stringIndex, fret: null, isRoot: false });
      return;
    }
    const fret = capo + f + offset;
    if (fret < 0 || fret > 15) {
      strings.push({ stringIndex, fret: null, isRoot: false });
      return;
    }
    const isRoot = stringIndex === tpl.rootString && fret === rootFret;
    strings.push({ stringIndex, fret, isRoot });
    fingers.push({ stringIndex, fret, isRoot });
  });
  if (fingers.length === 0) return null;
  return { shape, baseFret: Math.min(...fingers.map((x) => x.fret as number)), fingers, strings };
}

/** The CAGED shape sitting lowest on the neck for this chord. */
export function lowestShape(chord: DiatonicChord, tuning: Tuning, capo = 0): CagedShape {
  let best: { shape: CagedShape; base: number } | null = null;
  for (const shape of CAGED) {
    const r = resolveShape(shape, chord.root, chord.quality, tuning, capo);
    if (r && (!best || r.baseFret < best.base)) best = { shape, base: r.baseFret };
  }
  return best?.shape ?? `E`;
}
