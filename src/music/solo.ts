import type { TabBlock, TabCell, TabStep, Technique } from '../songs/types';
import { KEYS, mod12, noteIndex } from './notes';
import { getScale, scaleNotes } from './scales';
import { openStringMidi, type Tuning } from './tunings';

/**
 * Solo ideas: pick a scale that works in the song's key, a position on the neck and a pattern,
 * and get it back as tab. Everything is built in the song's written key, so it transposes with
 * the key dial like the rest of the song.
 */

export interface SoloScaleOption {
  id: string;
  label: string;
  root: string;
  scaleId: string;
  tip: string;
}

const MINORISH = new Set([`natural-minor`, `dorian`, `phrygian`, `locrian`, `harmonic-minor`, `melodic-minor`, `minor-pentatonic`, `blues`]);

/** Scales that sound good over a song in `key` / `scaleId`. */
export function soloScaleOptions(key: string, scaleId: string): SoloScaleOption[] {
  const k = noteIndex(key);
  const name = (i: number) => KEYS[mod12(i)].label;
  const scale = getScale(scaleId);
  if (MINORISH.has(scaleId)) {
    return [
      { id: `min-pent`, label: `${name(k)} minor pentatonic`, root: key, scaleId: `minor-pentatonic`, tip: `The go-to rock and blues sound — five notes, no wrong ones.` },
      { id: `blues`, label: `${name(k)} blues`, root: key, scaleId: `blues`, tip: `Minor pentatonic plus the ♭5 “blue note” for extra grit.` },
      { id: `key`, label: `${name(k)} ${scale.name.toLowerCase()}`, root: key, scaleId, tip: `All seven notes of the key — more melodic, lean on the chord tones.` },
      { id: `harm`, label: `${name(k)} harmonic minor`, root: key, scaleId: `harmonic-minor`, tip: `Raised 7th — dramatic over the V chord leading back home.` },
    ];
  }
  const rel = mod12(k + 9);
  return [
    { id: `maj-pent`, label: `${name(k)} major pentatonic`, root: key, scaleId: `major-pentatonic`, tip: `Sweet and safe over the whole song — great for choruses.` },
    { id: `rel-pent`, label: `${name(rel)} minor pentatonic (same notes)`, root: KEYS[rel].root, scaleId: `minor-pentatonic`, tip: `Same notes as the major pentatonic in the familiar minor box shapes.` },
    { id: `key`, label: `${name(k)} ${scale.name.toLowerCase()}`, root: key, scaleId, tip: `All seven notes of the key — more melodic, lean on the chord tones.` },
    { id: `blues`, label: `${name(k)} blues`, root: key, scaleId: `blues`, tip: `Minor blues over a major song — the classic rock-and-roll bite.` },
  ];
}

export interface SoloNote {
  s: number;
  f: number;
  midi: number;
}

/** Scale notes in a 5-fret box starting at `start`, ascending in pitch across the strings. */
export function boxNotes(tuning: Tuning, root: string, scaleId: string, start: number): SoloNote[] {
  const inScale = new Set(scaleNotes(root, scaleId).map((n) => noteIndex(n)));
  const open = openStringMidi(tuning);
  const out: SoloNote[] = [];
  let last = -Infinity;
  for (let s = 0; s < tuning.strings.length; s++) {
    for (let f = start; f <= start + 4; f++) {
      const midi = open[s] + f;
      if (inScale.has(mod12(midi)) && midi > last) {
        out.push({ s, f, midi });
        last = midi;
      }
    }
  }
  return out;
}

/** Box positions worth offering: one starting at each scale note on the lowest string. */
export function soloPositions(tuning: Tuning, root: string, scaleId: string, capo = 0, maxFret = 15): { fret: number; label: string }[] {
  const inScale = new Set(scaleNotes(root, scaleId).map((n) => noteIndex(n)));
  const low = noteIndex(tuning.strings[0]);
  const out: { fret: number; label: string }[] = [];
  for (let f = capo; f <= maxFret - 3; f++) {
    if (!inScale.has(mod12(low + f))) continue;
    const start = Math.max(capo, f - (f === capo ? 0 : 1));
    if (out.some((o) => o.fret === start)) continue;
    const isRoot = mod12(low + f) === noteIndex(root);
    out.push({ fret: start, label: `Fret ${start}${isRoot ? ` · root position` : ``}` });
  }
  return out;
}

export const SOLO_PATTERNS = [
  { id: `run`, label: `Scale run`, group: 0 },
  { id: `threes`, label: `Groups of 3`, group: 3 },
  { id: `fours`, label: `Groups of 4`, group: 4 },
  { id: `sixes`, label: `Groups of 6`, group: 6 },
  { id: `thirds`, label: `Thirds (skip a note)`, group: 2 },
  { id: `perm1324`, label: `1-3-2-4 permutation`, group: 4 },
] as const;
export type SoloPattern = (typeof SOLO_PATTERNS)[number]['id'];
export type SoloDirection = 'up' | 'down' | 'both';

function sequence(notes: SoloNote[], pattern: SoloPattern): SoloNote[] {
  const n = notes.length;
  const out: SoloNote[] = [];
  const group = (size: number) => {
    for (let i = 0; i + size <= n; i++) out.push(...notes.slice(i, i + size));
  };
  switch (pattern) {
    case `run`:
      return [...notes];
    case `threes`:
      group(3);
      break;
    case `fours`:
      group(4);
      break;
    case `sixes`:
      group(6);
      break;
    case `thirds`:
      for (let i = 0; i + 2 < n; i++) out.push(notes[i], notes[i + 2]);
      break;
    case `perm1324`:
      for (let i = 0; i + 3 < n; i++) out.push(notes[i], notes[i + 2], notes[i + 1], notes[i + 3]);
      break;
  }
  return out;
}

/** The pattern's notes in playing order. */
export function buildSoloPattern(notes: SoloNote[], pattern: SoloPattern, direction: SoloDirection): SoloNote[] {
  const up = sequence(notes, pattern);
  const down = sequence([...notes].reverse(), pattern);
  if (direction === `up`) return up;
  if (direction === `down`) return down;
  return [...up, ...down.slice(pattern === `run` ? 1 : 0)];
}

/** Notes → tab steps (highest string on the first row), a bar line every `perBar` notes. Frets are relative to the capo. */
export function soloToTab(notes: SoloNote[], stringCount: number, capo: number, perBar: number): TabStep[] {
  const steps: TabStep[] = [];
  notes.forEach((note, i) => {
    if (i > 0 && perBar > 0 && i % perBar === 0) steps.push(`|`);
    const col: (TabCell | null)[] = Array.from({ length: stringCount }, () => null);
    col[stringCount - 1 - note.s] = { f: note.f - capo };
    steps.push(col);
  });
  return steps;
}

/* ---------- Random solos ---------- */

export type Rng = () => number;

export interface RandomSolo {
  block: TabBlock;
  tip: string;
  /** Sounding pitch for each tab column (bar lines excluded), null for a rest. Bends are already raised. */
  pitches: (number | null)[];
  /** Identifies the solo; two solos with the same key are the same lick. */
  key: string;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];

// One bar of eighth notes: 1 = play, 0 = rest / let ring.
const RHYTHMS = [`11111111`, `11101110`, `10111011`, `11011010`, `10101111`, `11110100`, `01111110`, `11101011`, `10110111`, `11111100`, `01101101`, `11011011`];
const ENDINGS = [`11101000`, `11110000`, `10111000`, `11011100`, `01110000`, `11111000`];
const STEPS = [-3, -2, -2, -1, -1, -1, -1, 0, 1, 1, 1, 1, 2, 2, 3];

function nearest(indices: number[], from: number): number {
  return indices.reduce((best, i) => (Math.abs(i - from) < Math.abs(best - from) ? i : best), indices[0] ?? from);
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * A made-up solo in the key: a four-bar phrase in one box, with rests, a repeated or sequenced
 * motif, hammer-ons, pull-offs, slides and bends, landing on the root.
 */
export function randomSolo(tuning: Tuning, key: string, scaleId: string, capo = 0, rng: Rng = Math.random, bars = 4): RandomSolo {
  const scales = soloScaleOptions(key, scaleId);
  const scale = scales[Math.min(scales.length - 1, pick(rng, [0, 0, 0, 1, 1, 2, 2, 3]))];
  const positions = soloPositions(tuning, scale.root, scale.scaleId, capo);
  const usable = positions.filter((p) => boxNotes(tuning, scale.root, scale.scaleId, p.fret).length >= 5);
  const position = pick(rng, usable.length ? usable : positions.length ? positions : [{ fret: capo, label: `` }]).fret;
  const box = boxNotes(tuning, scale.root, scale.scaleId, position);
  const inScale = new Set(scaleNotes(scale.root, scale.scaleId).map((n) => noteIndex(n)));
  const rootPc = noteIndex(scale.root);
  const roots = box.map((n, i) => (mod12(n.midi) === rootPc ? i : -1)).filter((i) => i >= 0);
  const fifths = box.map((n, i) => (mod12(n.midi) === mod12(rootPc + 7) ? i : -1)).filter((i) => i >= 0);
  const last = box.length - 1;
  const clamp = (i: number) => (i < 0 ? -i : i > last ? 2 * last - i : i);

  // Rhythm, bar by bar; bar 3 often answers bar 1 with the same rhythm.
  const rhythm: string[] = [];
  for (let b = 0; b < bars; b++) rhythm.push(b === bars - 1 ? pick(rng, ENDINGS) : b === 2 && rng() < 0.5 ? rhythm[0] : pick(rng, RHYTHMS));

  // Melody as indices into the box.
  // Start in the upper part of the box, where leads sing, often on a root.
  const highRoots = roots.filter((i) => i >= box.length / 3);
  let cursor = highRoots.length && rng() < 0.6 ? pick(rng, highRoots) : Math.floor(box.length / 3 + rng() * (box.length * 2) / 3);
  const bias = () => pick(rng, [-1, 0, 0, 1]);
  const melody: (number | null)[][] = [];
  for (let b = 0; b < bars; b++) {
    const lean = bias();
    const slots = [...rhythm[b]].map((c) => c === `1`);
    const count = slots.filter(Boolean).length;
    let notes: number[] = [];
    if (b === 2 && melody[0] && rng() < 0.45) {
      // Repeat the opening motif, sometimes moved up or down the scale.
      const shift = pick(rng, [0, 1, -1, 2, -2]);
      notes = melody[0].filter((x): x is number => x !== null).map((i) => clamp(i + shift));
      while (notes.length < count) notes.push(clamp(notes[notes.length - 1] + pick(rng, STEPS)));
      notes = notes.slice(0, count);
    } else {
      for (let k = 0; k < count; k++) {
        cursor = clamp(cursor + pick(rng, STEPS) + (rng() < 0.3 ? lean : 0));
        notes.push(cursor);
      }
    }
    // Phrase ends: bar 2 rests on a root or fifth, the last bar lands on the root.
    if (notes.length && b === bars - 1 && roots.length) notes[notes.length - 1] = nearest(roots, notes[notes.length - 2] ?? notes[0]);
    else if (notes.length && b === 1 && rng() < 0.7) notes[notes.length - 1] = nearest([...roots, ...fifths], notes[notes.length - 1]);
    cursor = notes[notes.length - 1] ?? cursor;
    let n = 0;
    melody.push(slots.map((on) => (on ? notes[n++] : null)));
  }

  // Columns with techniques.
  const flat = melody.flat();
  const bendable = tuning.instrument !== `bass`;
  const cells: ({ s: number; f: number; midi: number; t?: Technique } | null)[] = flat.map((i) => (i === null ? null : { s: box[i].s, f: box[i].f, midi: box[i].midi }));
  cells.forEach((cell, i) => {
    if (!cell) return;
    const next = cells[i + 1];
    if (i === cells.length - 1 || (!next && cells.slice(i + 1).every((c) => !c))) {
      cell.t = `~`;
      return;
    }
    if (next && next.s === cell.s && next.f !== cell.f) {
      const r = rng();
      if (r < 0.35) cell.t = next.f > cell.f ? `h` : `p`;
      else if (r < 0.5) cell.t = next.f > cell.f ? `/` : `\\`;
      return;
    }
    if (bendable && cell.s >= 2 && inScale.has(mod12(cell.midi + 2)) && rng() < 0.12) {
      cell.t = `b`;
      cell.midi += 2;
    }
  });

  const width = tuning.strings.length;
  const steps: TabStep[] = [];
  cells.forEach((cell, i) => {
    if (i > 0 && i % 8 === 0) steps.push(`|`);
    const col: (TabCell | null)[] = Array.from({ length: width }, () => null);
    if (cell) col[width - 1 - cell.s] = cell.t ? { f: cell.f - capo, t: cell.t } : { f: cell.f - capo };
    steps.push(col);
  });

  const key_ = `${tuning.id}|${scale.root}|${scale.scaleId}|${capo}|${cells.map((c) => (c ? `${c.s}.${c.f}${c.t ?? ``}` : `-`)).join(` `)}`;
  return {
    block: { id: `random-solo`, label: `${scale.label} · fret ${position}`, steps },
    tip: scale.tip,
    pitches: cells.map((c) => (c ? c.midi : null)),
    key: hash(key_),
  };
}

/** A random solo whose key isn't in `seen` (and is added to it). */
export function freshSolo(seen: Set<string>, ...args: Parameters<typeof randomSolo>): RandomSolo {
  let solo = randomSolo(...args);
  for (let tries = 0; seen.has(solo.key) && tries < 200; tries++) solo = randomSolo(...args);
  seen.add(solo.key);
  return solo;
}
