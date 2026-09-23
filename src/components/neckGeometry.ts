import bassUrl from '../assets/bass-neck.webp';
import guitarUrl from '../assets/guitar-neck.webp';

/**
 * A neck photo and where things are on it, in the photo's original pixel space
 * (which is also the SVG coordinate space the neck is drawn in).
 */
export interface NeckSpec {
  id: 'guitar' | 'bass';
  image: string;
  width: number;
  height: number;
  nutX: number;
  /** x of each fret wire, fret 1 upward. */
  wires: number[];
  /** Board edges are straight lines: top/bottom y at two x positions. */
  edgeA: { x: number; top: number; bottom: number };
  edgeB: { x: number; top: number; bottom: number };
  /** x used for open-string notes, on the headstock side of the nut. */
  openX: number;
  /** Fraction of the board width left empty outside the outer strings. */
  inset: number;
}

export const GUITAR_NECK: NeckSpec = {
  id: `guitar`,
  image: guitarUrl,
  width: 3680,
  height: 452,
  nutX: 103,
  wires: [389, 644, 886, 1116, 1330, 1534, 1726, 1909, 2081, 2243, 2401, 2546, 2684, 2820, 2941, 3060, 3170, 3276, 3375, 3470, 3558],
  edgeA: { x: 103, top: 90, bottom: 404 },
  edgeB: { x: 3550, top: 27, bottom: 442 },
  openX: 52,
  inset: 0.085,
};

/** src/assets/bass-neck.webp is cropped from y = 450 of the original 3659×1395 photo. */
export const BASS_NECK: NeckSpec = {
  id: `bass`,
  image: bassUrl,
  width: 3659,
  height: 450,
  nutX: 24,
  wires: [326, 594, 852, 1092, 1320, 1537, 1741, 1932, 2112, 2284, 2448, 2600, 2746, 2883, 3013, 3138, 3253, 3358, 3459, 3550],
  edgeA: { x: 200, top: 192, bottom: 409 },
  edgeB: { x: 3500, top: 44, bottom: 409 },
  openX: -36,
  inset: 0.12,
};

/** 4-string instruments use the bass neck; 6-, 7- and 8-string use the guitar neck. */
export function neckFor(stringCount: number): NeckSpec {
  return stringCount <= 5 ? BASS_NECK : GUITAR_NECK;
}

export function fretCount(spec: NeckSpec): number {
  return spec.wires.length;
}

/** x of fret wire `n` (0 = nut). */
export function wireX(spec: NeckSpec, n: number): number {
  if (n <= 0) return spec.nutX;
  return spec.wires[Math.min(n, spec.wires.length) - 1];
}

/** Where a finger sits for fret `f`: just behind the fret wire. */
export function fretX(spec: NeckSpec, f: number): number {
  if (f <= 0) return spec.openX;
  const a = wireX(spec, f - 1);
  const b = wireX(spec, f);
  return a + (b - a) * 0.58;
}

function edges(spec: NeckSpec, x: number): { top: number; bottom: number } {
  const { edgeA: a, edgeB: b } = spec;
  const t = (x - a.x) / (b.x - a.x);
  return { top: a.top + (b.top - a.top) * t, bottom: a.bottom + (b.bottom - a.bottom) * t };
}

/**
 * y of string `i` (0 = lowest string) at position x. Like tab, the lowest string is drawn
 * at the bottom and the highest at the top. Strings follow the neck's taper.
 */
export function stringY(spec: NeckSpec, i: number, count: number, x: number): number {
  const { top, bottom } = edges(spec, x);
  const inset = (bottom - top) * spec.inset;
  if (count <= 1) return (top + bottom) / 2;
  return top + inset + ((bottom - top - inset * 2) * (count - 1 - i)) / (count - 1);
}

/** Distance between neighboring strings at position x. */
export function stringGap(spec: NeckSpec, count: number, x: number): number {
  return count > 1 ? Math.abs(stringY(spec, 1, count, x) - stringY(spec, 0, count, x)) : 60;
}

/** Relative string thickness (low → high) for drawing. Bass strings are heavier. */
export function stringWidth(spec: NeckSpec, i: number, count: number): number {
  const t = count <= 1 ? 0 : i / (count - 1);
  return spec.id === `bass` ? 15 - 6 * t : 10 - 6.8 * t;
}

/** Lowest strings are wound; the highest three are plain (all wound on bass). */
export function isWound(spec: NeckSpec, i: number, count: number): boolean {
  return spec.id === `bass` ? true : i < count - 3;
}
