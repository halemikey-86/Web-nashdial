/**
 * Break the lit scale notes on the fretboard into tetris pieces.
 *
 * Notes that touch (same string, next fret; or same fret, next string) form groups. Each group is
 * split into tetrominoes (I O T S Z J L) where possible, then 3-note pieces, then pairs and single
 * notes, using an exact search so identical groups always split the same way — which is what makes
 * a shape repeat in the same colour further up the neck.
 *
 * Coordinates are as displayed: row 0 is the highest string (top), column = fret.
 */

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' | 'I3' | 'V3' | 'D2' | 'M1';

export const PIECE_INFO: Record<PieceType, { name: string; color: string; text: string; size: number }> = {
  I: { name: `I`, color: `#18c4e0`, text: `#10252a`, size: 4 },
  O: { name: `O`, color: `#f2d016`, text: `#1a1a1a`, size: 4 },
  T: { name: `T`, color: `#9b3fd6`, text: `#fff`, size: 4 },
  S: { name: `S`, color: `#35b84a`, text: `#10250f`, size: 4 },
  Z: { name: `Z`, color: `#e8283c`, text: `#fff`, size: 4 },
  J: { name: `J`, color: `#2f6fe0`, text: `#fff`, size: 4 },
  L: { name: `L`, color: `#f08a1c`, text: `#1a1a1a`, size: 4 },
  I3: { name: `Mini I`, color: `#7fdcc8`, text: `#10252a`, size: 3 },
  V3: { name: `Mini L`, color: `#ec6fae`, text: `#2a0f1e`, size: 3 },
  D2: { name: `Pair`, color: `#a7adb4`, text: `#1a1a1a`, size: 2 },
  M1: { name: `Single`, color: `#6f757c`, text: `#fff`, size: 1 },
};

export const PIECE_ORDER: PieceType[] = [`I`, `O`, `T`, `S`, `Z`, `J`, `L`, `I3`, `V3`, `D2`, `M1`];

type Cell = [row: number, col: number];

/** Each piece in one orientation — also used to draw its icon. */
const BASES: [PieceType, Cell[]][] = [
  [`O`, [[0, 0], [0, 1], [1, 0], [1, 1]]],
  [`T`, [[0, 0], [0, 1], [0, 2], [1, 1]]],
  [`L`, [[0, 0], [1, 0], [2, 0], [2, 1]]],
  [`J`, [[0, 1], [1, 1], [2, 1], [2, 0]]],
  [`S`, [[0, 1], [0, 2], [1, 0], [1, 1]]],
  [`Z`, [[0, 0], [0, 1], [1, 1], [1, 2]]],
  [`I`, [[0, 0], [0, 1], [0, 2], [0, 3]]],
  [`V3`, [[0, 0], [1, 0], [1, 1]]],
  [`I3`, [[0, 0], [0, 1], [0, 2]]],
  [`D2`, [[0, 0], [0, 1]]],
  [`M1`, [[0, 0]]],
];

export const PIECE_CELLS: Record<PieceType, Cell[]> = Object.fromEntries(BASES) as Record<PieceType, Cell[]>;

function normalize(cells: Cell[]): Cell[] {
  const r0 = Math.min(...cells.map((c) => c[0]));
  const c0 = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => [r - r0, c - c0] as Cell).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Every rotation of every piece, each anchored on its first cell (top row, leftmost). */
const ORIENTATIONS: { type: PieceType; offsets: Cell[] }[] = (() => {
  const out: { type: PieceType; offsets: Cell[] }[] = [];
  for (const [type, base] of BASES) {
    const seen = new Set<string>();
    let cells = base;
    for (let k = 0; k < 4; k++) {
      const norm = normalize(cells);
      const key = norm.map((c) => c.join(`,`)).join(`;`);
      if (!seen.has(key)) {
        seen.add(key);
        const [ar, ac] = norm[0];
        out.push({ type, offsets: norm.map(([r, c]) => [r - ar, c - ac] as Cell) });
      }
      cells = cells.map(([r, c]) => [c, -r] as Cell);
    }
  }
  return out;
})();

export interface Piece {
  id: number;
  type: PieceType;
  cells: Cell[];
}

const SCORE: Record<number, number> = { 4: 1000, 3: 10, 2: 1, 1: 0 };

/** Best split of one group of touching cells into pieces. */
function splitGroup(cells: Cell[]): { type: PieceType; cells: Cell[] }[] {
  const sorted = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const index = new Map(sorted.map(([r, c], i) => [`${r},${c}`, i]));
  const n = sorted.length;

  // Exact search with memo on the covered set; fall back to greedy for very large groups.
  const exact = n <= 30;
  const memo = new Map<number, { score: number; pieces: { type: PieceType; idx: number[] }[] }>();

  const solve = (covered: number): { score: number; pieces: { type: PieceType; idx: number[] }[] } => {
    let first = -1;
    for (let i = 0; i < n; i++) if (!(covered & (1 << i))) { first = i; break; }
    if (first === -1) return { score: 0, pieces: [] };
    if (exact && memo.has(covered)) return memo.get(covered)!;
    const [ar, ac] = sorted[first];
    let best: { score: number; pieces: { type: PieceType; idx: number[] }[] } | null = null;
    for (const o of ORIENTATIONS) {
      const idx: number[] = [];
      let fits = true;
      for (const [dr, dc] of o.offsets) {
        const i = index.get(`${ar + dr},${ac + dc}`);
        if (i === undefined || covered & (1 << i)) { fits = false; break; }
        idx.push(i);
      }
      if (!fits) continue;
      let mask = covered;
      for (const i of idx) mask |= 1 << i;
      const rest = solve(mask);
      const score = rest.score + SCORE[o.offsets.length] - 0.01;
      if (!best || score > best.score) best = { score, pieces: [{ type: o.type, idx }, ...rest.pieces] };
      if (!exact) break;
    }
    const result = best ?? { score: 0, pieces: [] };
    if (exact) memo.set(covered, result);
    return result;
  };

  if (n > 30) {
    // Greedy: take the first piece that fits at each anchor.
    const out: { type: PieceType; cells: Cell[] }[] = [];
    const used = new Set<string>();
    for (const [ar, ac] of sorted) {
      if (used.has(`${ar},${ac}`)) continue;
      for (const o of ORIENTATIONS) {
        const cs = o.offsets.map(([dr, dc]) => [ar + dr, ac + dc] as Cell);
        if (cs.every(([r, c]) => index.has(`${r},${c}`) && !used.has(`${r},${c}`))) {
          cs.forEach(([r, c]) => used.add(`${r},${c}`));
          out.push({ type: o.type, cells: cs });
          break;
        }
      }
    }
    return out;
  }
  return solve(0).pieces.map((p) => ({ type: p.type, cells: p.idx.map((i) => sorted[i]) }));
}

/**
 * Split lit cells into tetris pieces.
 * @param lit lit[row][col] — row 0 = highest string.
 */
export function findPieces(lit: boolean[][]): Piece[] {
  const rows = lit.length;
  const cols = lit[0]?.length ?? 0;
  const seen = lit.map((r) => r.map(() => false));
  const pieces: Piece[] = [];
  let id = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!lit[r][c] || seen[r][c]) continue;
      const group: Cell[] = [];
      const stack: Cell[] = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [a, b] = stack.pop()!;
        group.push([a, b]);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = a + da;
          const y = b + db;
          if (x >= 0 && x < rows && y >= 0 && y < cols && lit[x][y] && !seen[x][y]) {
            seen[x][y] = true;
            stack.push([x, y]);
          }
        }
      }
      for (const p of splitGroup(group)) pieces.push({ id: id++, ...p });
    }
  }
  return pieces;
}

/** Lookup from "row,col" to its piece. */
export function pieceMap(pieces: Piece[]): Map<string, Piece> {
  const m = new Map<string, Piece>();
  for (const p of pieces) for (const [r, c] of p.cells) m.set(`${r},${c}`, p);
  return m;
}
