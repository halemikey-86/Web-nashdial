/**
 * Measurements of src/assets/guitar-neck.webp in its original 3680×452 pixel space,
 * which is also the SVG coordinate space the neck is drawn in.
 */
export const NECK = {
  width: 3680,
  height: 452,
  nutX: 103,
  /** x of each fret wire, fret 1 → 21. */
  wires: [389, 644, 886, 1116, 1330, 1534, 1726, 1909, 2081, 2243, 2401, 2546, 2684, 2820, 2941, 3060, 3170, 3276, 3375, 3470, 3558],
  boardEndX: 3645,
  /** Board edges are straight lines: top/bottom y at the nut and at x = 3550. */
  edgeNut: { x: 103, top: 90, bottom: 404 },
  edgeFar: { x: 3550, top: 27, bottom: 442 },
  /** x used for open-string notes, on the headstock side of the nut. */
  openX: 52,
} as const;

export const NECK_FRETS = NECK.wires.length;

/** x of fret wire `n` (0 = nut). */
export function wireX(n: number): number {
  if (n <= 0) return NECK.nutX;
  return NECK.wires[Math.min(n, NECK.wires.length) - 1];
}

/** Where a finger sits for fret `f`: just behind the fret wire. */
export function fretX(f: number): number {
  if (f <= 0) return NECK.openX;
  const a = wireX(f - 1);
  const b = wireX(f);
  return a + (b - a) * 0.58;
}

function edges(x: number): { top: number; bottom: number } {
  const { edgeNut: a, edgeFar: b } = NECK;
  const t = (x - a.x) / (b.x - a.x);
  return { top: a.top + (b.top - a.top) * t, bottom: a.bottom + (b.bottom - a.bottom) * t };
}

/**
 * y of string `i` (0 = lowest string, drawn at the top — the player's view) at position x.
 * Strings follow the neck's taper with a small inset from each edge.
 */
export function stringY(i: number, count: number, x: number): number {
  const { top, bottom } = edges(x);
  const inset = (bottom - top) * 0.085;
  if (count <= 1) return (top + bottom) / 2;
  return top + inset + ((bottom - top - inset * 2) * i) / (count - 1);
}

/** Relative string thickness (low → high) for drawing. */
export function stringWidth(i: number, count: number): number {
  const t = count <= 1 ? 0 : i / (count - 1);
  return 10 - 6.8 * t;
}

/** Lowest strings are wound; the top three (or two on bass) are plain. */
export function isWound(i: number, count: number): boolean {
  return count <= 4 ? true : i < count - 3;
}
