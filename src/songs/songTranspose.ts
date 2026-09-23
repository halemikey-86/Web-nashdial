import { mod12, noteIndex, prefersFlats, spellNote } from '../music/notes';
import { signedInterval } from '../music/transpose';
import type { TabBlock, TabStep } from './types';

const NUMBER_NAMES = [`1`, `♭2`, `2`, `♭3`, `3`, `4`, `♭5`, `5`, `♭6`, `6`, `♭7`, `7`];

export { prefersFlats, spellNote };

/** Parse "C", "Bb", "F♯" etc. into 0–11, or -1. */
export function parseNote(letter: string, accidental = ``): number {
  const base = noteIndex(letter.toUpperCase());
  if (base === -1) return -1;
  if (accidental === `#` || accidental === `♯`) return mod12(base + 1);
  if (accidental === `b` || accidental === `♭`) return mod12(base - 1);
  return base;
}

/** Normalise any spelling of a key name to the app's sharp note names ("Bb" → "A#"). */
export function normalizeKeyName(name: string): string | null {
  const m = /^\s*([A-Ga-g])([#b♯♭]?)/.exec(name ?? ``);
  if (!m) return null;
  const i = parseNote(m[1], m[2]);
  return i === -1 ? null : [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`][i];
}

export type ChordDisplay = 'sounding' | 'shapes' | 'numbers';

export interface TransposeContext {
  /** Key the song is written in (0–11). */
  songKey: number;
  /** Key being played (0–11). */
  playKey: number;
  scaleId: string;
  /** Capo the song was written with. */
  songCapo: number;
  /** Capo in use now. */
  capo: number;
  display: ChordDisplay;
}

export function semitoneShift(ctx: TransposeContext): number {
  return signedInterval(ctx.songKey, ctx.playKey);
}

const SUFFIX = `(?:maj|min|m|M|dim|aug|sus|add|no|alt|\\+|°|ø|Δ|\\d|\\(|\\)|#|b|♯|♭|,|-)*`;
const CHORD_RE = new RegExp(`^([(\\[]?)([A-G])([#b♯♭]?)(${SUFFIX})(?:/([A-G])([#b♯♭]?))?([)\\],.*]*)$`);

function renderRoot(index: number, ctx: TransposeContext): string {
  if (ctx.display === `numbers`) return NUMBER_NAMES[mod12(index - ctx.songKey)];
  const shift = semitoneShift(ctx) - (ctx.display === `shapes` ? ctx.capo - ctx.songCapo : 0);
  const target = mod12(index + shift);
  const keyForSpelling = ctx.display === `shapes` ? ctx.playKey - ctx.capo : ctx.playKey;
  return spellNote(target, prefersFlats(keyForSpelling, ctx.scaleId));
}

/** Transpose a single chord symbol, or return null if the token isn't a chord. */
export function transposeChord(token: string, ctx: TransposeContext): string | null {
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  const [, open, letter, acc, suffix, bassLetter, bassAcc, close] = m;
  const root = parseNote(letter, acc);
  let out = `${open}${renderRoot(root, ctx)}${suffix}`;
  if (bassLetter) out += `/${renderRoot(parseNote(bassLetter, bassAcc), ctx)}`;
  return out + close;
}

/**
 * Transpose every chord in a chord-chart line, keeping column alignment where possible:
 * when a chord gets longer it borrows following spaces; when shorter it pads.
 */
export function transposeChordLine(line: string, ctx: TransposeContext): string {
  const parts = line.split(/(\s+)/);
  let debt = 0;
  return parts
    .map((part) => {
      if (part === ``) return part;
      if (/^\s+$/.test(part)) {
        const keep = Math.max(1, part.length - debt);
        debt = Math.max(0, debt - (part.length - keep));
        return ` `.repeat(keep);
      }
      const next = transposeChord(part, ctx);
      if (next === null) return part;
      debt += next.length - part.length;
      if (debt < 0) {
        const pad = -debt;
        debt = 0;
        return next + ` `.repeat(pad);
      }
      return next;
    })
    .join(``);
}

const NON_CHORD_TOKEN = /^(\||\/|\.|-|%|:|\(?x\d+\)?|\(?\d+x\)?|n\.?c\.?|\(|\))$/i;
const NEUTRAL: TransposeContext = { songKey: 0, playKey: 0, scaleId: `major`, songCapo: 0, capo: 0, display: `sounding` };

/**
 * A chord line is one made mostly of chords (bar lines and "x2" don't count either way).
 * Lyric lines — even ones with words like "A" or "Am I" — are not.
 */
export function isChordLine(line: string): boolean {
  let chords = 0;
  let other = 0;
  for (const t of line.trim().split(/\s+/)) {
    if (!t) continue;
    if (transposeChord(t, NEUTRAL) !== null) chords++;
    else if (!NON_CHORD_TOKEN.test(t)) other++;
  }
  return chords > 0 && chords > other;
}

/** Transpose a chord chart. Lines that aren't chord lines (lyrics, cues) are left exactly as written. */
export function transposeChordText(text: string, ctx: TransposeContext): string {
  return text
    .split(`\n`)
    .map((l) => (isChordLine(l) ? transposeChordLine(l, ctx) : l))
    .join(`\n`);
}

const NOTE_RE = /^([A-G])([#b♯♭]?)(-?\d)?([,.]?)$/;

/** Transpose single-note melody text such as "B3 D4 G4". Non-note tokens pass through. */
export function transposeNoteText(text: string, ctx: TransposeContext): string {
  const shift = semitoneShift(ctx);
  const flats = prefersFlats(ctx.playKey, ctx.scaleId);
  return text.replace(/\S+/g, (token) => {
    const m = NOTE_RE.exec(token);
    if (!m) return token;
    const [, letter, acc, octave, trail] = m;
    const index = parseNote(letter, acc);
    if (ctx.display === `numbers`) return NUMBER_NAMES[mod12(index - ctx.songKey)] + trail;
    if (octave === undefined) return spellNote(index + shift, flats) + trail;
    // Octave numbers roll over at C (scientific pitch notation), so Cb4 is B3.
    const accidental = acc === `#` || acc === `♯` ? 1 : acc === `b` || acc === `♭` ? -1 : 0;
    const midi = (Number(octave) + 1) * 12 + noteIndex(letter) + accidental + shift;
    return `${spellNote(midi, flats)}${Math.floor(midi / 12) - 1}${trail}`;
  });
}

/**
 * Move every fret in a tab by the key change (plus any capo difference), shifting the
 * whole phrase by an octave if needed so the shape stays together and on the neck.
 */
export function transposeTabBlock(block: TabBlock, ctx: TransposeContext, maxFret = 24): TabBlock {
  let shift = semitoneShift(ctx) + ctx.songCapo - ctx.capo;
  if (shift === 0) return block;
  const frets: number[] = [];
  block.steps.forEach((s) => {
    if (s !== `|`) s.forEach((c) => c && typeof c.f === `number` && frets.push(c.f));
  });
  if (frets.length) {
    const lo = Math.min(...frets);
    const hi = Math.max(...frets);
    while (lo + shift < 0) shift += 12;
    while (hi + shift > maxFret && lo + shift - 12 >= 0) shift -= 12;
  }
  const steps: TabStep[] = block.steps.map((s) =>
    s === `|` ? s : s.map((c) => (c && typeof c.f === `number` ? { ...c, f: c.f + shift } : c)),
  );
  return { ...block, steps };
}
