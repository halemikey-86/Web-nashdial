import { describe, expect, it } from 'vitest';
import { buildFretboard } from './fretboard';
import { findPieces } from './tetrisShapes';
import { DEFAULT_TUNING } from './tunings';

function litGrid(root: string, scaleId: string, frets: number) {
  const rows = buildFretboard(DEFAULT_TUNING, root, scaleId, frets);
  // Row 0 = highest string, as displayed.
  return [...rows].reverse().map((cells) => cells.map((c) => c.inScale));
}

const shapeKey = (cells: [number, number][]) => {
  const r0 = Math.min(...cells.map((c) => c[0]));
  const c0 = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => `${r - r0},${c - c0}`).sort().join(`;`);
};

describe(`tetris pieces`, () => {
  it(`covers every lit note exactly once`, () => {
    const lit = litGrid(`C`, `major`, 24);
    const pieces = findPieces(lit);
    const count = lit.flat().filter(Boolean).length;
    expect(pieces.reduce((n, p) => n + p.cells.length, 0)).toBe(count);
    const keys = pieces.flatMap((p) => p.cells.map((c) => c.join(`,`)));
    expect(new Set(keys).size).toBe(count);
  });

  it(`mostly uses 4-note pieces`, () => {
    const pieces = findPieces(litGrid(`C`, `major`, 24));
    const four = pieces.filter((p) => p.cells.length === 4).reduce((n) => n + 4, 0);
    const total = pieces.reduce((n, p) => n + p.cells.length, 0);
    expect(four / total).toBeGreaterThan(0.6);
  });

  it(`repeats the same pieces 12 frets higher`, () => {
    const pieces = findPieces(litGrid(`G`, `major`, 36));
    const low = pieces.filter((p) => p.cells.every(([, c]) => c >= 1 && c <= 11));
    for (const p of low) {
      const twin = pieces.find((q) => q.type === p.type && shapeKey(q.cells) === shapeKey(p.cells) && q.cells[0][1] === p.cells[0][1] + 12);
      expect(twin, `${p.type} at fret ${p.cells[0][1]}`).toBeTruthy();
    }
  });

  it(`finds the upside-down mini L on the top two strings in C major (frets 7-8)`, () => {
    const pieces = findPieces(litGrid(`C`, `major`, 24));
    const corner = pieces.find((p) => p.cells.some(([r, c]) => r === 0 && c === 7));
    expect(corner?.type).toBe(`V3`);
    expect(shapeKey(corner!.cells)).toBe(`0,0;0,1;1,1`);
  });
});
