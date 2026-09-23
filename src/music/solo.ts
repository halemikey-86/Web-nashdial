import type { TabCell, TabStep } from '../songs/types';
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
