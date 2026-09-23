import { CAGED, templateFor, type CagedShape } from './chordShapes';
import { noteAtFret } from './fretboard';
import { diatonicChords, type ChordQuality } from './scales';
import type { Tuning } from './tunings';

/** Tetris-style colour for each CAGED shape, in the order the shapes climb the neck. */
export const SHAPE_COLORS: Record<CagedShape, { name: string; fill: string; text: string }> = {
  C: { name: `Purple`, fill: `#9b3fd6`, text: `#fff` },
  A: { name: `Yellow`, fill: `#f2d016`, text: `#1a1a1a` },
  G: { name: `Blue`, fill: `#2f6fe0`, text: `#fff` },
  E: { name: `Green`, fill: `#35b84a`, text: `#1a1a1a` },
  D: { name: `Orange`, fill: `#f08a1c`, text: `#1a1a1a` },
};

export interface ShapePosition {
  shape: CagedShape;
  /** First and last fret of the position's window (inclusive). */
  lo: number;
  hi: number;
}

function shapeQuality(root: string, scaleId: string): ChordQuality {
  const q = diatonicChords(root, scaleId)[0]?.quality ?? `major`;
  if (q === `dim`) return `minor`;
  if (q === `aug`) return `major`;
  return q;
}

/**
 * Every CAGED position of the key's tonic chord between the capo and `maxFret`.
 * A position's window runs from one fret below the chord shape to its highest fret,
 * which gives the standard four-to-five-fret scale box around each shape.
 * 7- and 8-string tunings use the top six strings for the shapes.
 */
export function cagedPositions(tuning: Tuning, root: string, scaleId: string, capo: number, maxFret: number): ShapePosition[] {
  const quality = shapeQuality(root, scaleId);
  const count = tuning.strings.length;
  const offset = Math.max(0, count - 6);
  const positions: ShapePosition[] = [];

  for (const shape of CAGED) {
    const tpl = templateFor(shape, quality);
    if (!tpl) continue;
    const rootString = tpl.rootString + offset;
    if (rootString >= count) continue;
    let base = -1;
    for (let f = 0; f < 12; f++) if (noteAtFret(tuning.strings[rootString], f) === root) base = f;
    if (base === -1) continue;

    for (let n = -1; n <= 2; n++) {
      const shift = base + 12 * n - tpl.rootFret;
      const frets = tpl.frets
        .map((f, i) => (f === null || i + offset >= count ? null : f + shift))
        .filter((f): f is number => f !== null);
      if (!frets.length) continue;
      const lo = Math.max(capo, Math.min(...frets) - 1);
      const hi = Math.min(maxFret, Math.max(...frets));
      if (hi - lo >= 1 && Math.min(...frets) >= capo - 1) positions.push({ shape, lo, hi });
    }
  }
  return positions.sort((a, b) => a.lo - b.lo);
}

/** The shapes (in `visible`) whose window contains this fret. */
export function shapesAt(positions: ShapePosition[], fret: number, visible: ReadonlySet<CagedShape>): CagedShape[] {
  const out: CagedShape[] = [];
  for (const p of positions) if (visible.has(p.shape) && fret >= p.lo && fret <= p.hi && !out.includes(p.shape)) out.push(p.shape);
  return out;
}

/** Background for a shape cell: one colour, or a diagonal split where two shapes overlap. */
export function shapeFill(shapes: CagedShape[]): string {
  if (shapes.length === 1) return SHAPE_COLORS[shapes[0]].fill;
  const step = 100 / shapes.length;
  return `linear-gradient(135deg, ${shapes.map((s, i) => `${SHAPE_COLORS[s].fill} ${i * step}% ${(i + 1) * step}%`).join(`, `)})`;
}
