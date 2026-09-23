import type { NoteName } from '../../music/notes';
import { createSection, createSong, createTabBlock, newId } from '../model';
import { isChordLine as isChordLineShared, normalizeKeyName, transposeChord } from '../songTranspose';
import { SECTION_TYPES, TECHNIQUES, type Section, type SectionType, type Song, type TabCell, type TabStep, type Technique } from '../types';

/**
 * Turn a plain-text chord sheet (or ChordPro file) into a song:
 *  - "Title: / Artist: / Key: / Capo: / Tempo: / Time:" lines become song details,
 *  - section headers ("[Verse 1]", "Chorus:", "PRE-CHORUS") start sections,
 *  - lines made of chords go to the section's chord chart,
 *  - ASCII tab blocks ("e|--3--5h7--|") become editable tabs,
 *  - everything else (lyrics, cues) goes to the section's notes.
 */

const NEUTRAL_CTX = { songKey: 0, playKey: 0, scaleId: `major`, songCapo: 0, capo: 0, display: `sounding` as const };

const SECTION_WORDS: [RegExp, SectionType][] = [
  [/^intro/i, `intro`],
  [/^verse/i, `verse`],
  [/^pre[\s-]?chorus/i, `prechorus`],
  [/^(chorus|hook)/i, `chorus`],
  [/^refrain/i, `refrain`],
  [/^bridge/i, `bridge`],
  [/^interlude|^instrumental/i, `interlude`],
  [/^vamp/i, `vamp`],
  [/^(outro|ending|coda)/i, `outro`],
];

const HEADER_RE =
  /^\s*[[(]?\s*((?:intro|verse|pre[\s-]?chorus|chorus|hook|refrain|bridge|interlude|instrumental|vamp|outro|ending|coda|tag|solo|breakdown|turnaround|riff|break)\b[^\])]*?)\s*[\])]?\s*:?\s*(?:x\s*\d+)?\s*$/i;
const BRACKET_HEADER_RE = /^\s*\[([^\]]{1,40})\]\s*$/;
const META_RE = /^\s*(title|song|artist|by|composer|key|capo|tempo|bpm|time|time signature)\s*[:=-]\s*(.+?)\s*$/i;
const TAB_LINE_RE = /^\s*([a-gA-G][#b]?)?\s*[|:]?[-0-9hpbr/\\~x|*.()]{6,}\s*$/;
const JUNK_RE = /(ccli|©|\(c\)\s*\d{4}|copyright|all rights reserved|www\.|https?:\/\/|songselect|used by permission|^page\s+\d+(\s+of\s+\d+)?$|^\d+\s*\/\s*\d+$)/i;

export function sectionTypeFor(label: string): SectionType {
  const t = label.trim();
  for (const [re, type] of SECTION_WORDS) if (re.test(t)) return type;
  return `custom`;
}

function isChordToken(token: string): boolean {
  return transposeChord(token, NEUTRAL_CTX) !== null;
}

/** A line is a chord line when it's mostly chords (shared with transposition, so they always agree). */
export function isChordLine(line: string): boolean {
  return isChordLineShared(line);
}

function isTabLine(line: string): boolean {
  if (!TAB_LINE_RE.test(line)) return false;
  const body = line.replace(/^\s*[a-gA-G][#b]?\s*/, ``);
  return (body.match(/-/g)?.length ?? 0) >= 3;
}

/** Parse a block of 4–8 ASCII tab lines (highest string first) into tab steps. */
export function parseTabBlock(lines: string[], stringCount: number): TabStep[] {
  // Strip the string-name prefix, keeping columns aligned from the first "|".
  const bodies = lines.map((l) => {
    const m = /^\s*[a-gA-G]?[#b]?\s*[|:]?/.exec(l);
    return l.slice(m ? m[0].length : 0);
  });
  const width = Math.max(...bodies.map((b) => b.length));
  const rows = bodies.map((b) => b.padEnd(width, `-`));
  const steps: TabStep[] = [];
  let i = 0;
  while (i < width) {
    const chars = rows.map((r) => r[i]);
    if (chars.every((c) => c === `|` || c === `:`)) {
      if (steps.length && steps[steps.length - 1] !== `|`) steps.push(`|`);
      i++;
      continue;
    }
    if (chars.some((c) => /[0-9x]/i.test(c))) {
      let advance = 1;
      const col: (TabCell | null)[] = rows.map((r) => {
        const m = /^(\d{1,2}|x)([hpbr/\\~t])?/i.exec(r.slice(i));
        if (!m) return null;
        advance = Math.max(advance, m[0].length);
        const f = m[1].toLowerCase() === `x` ? (`x` as const) : Number(m[1]);
        const t = m[2] && TECHNIQUES.includes(m[2] as Technique) ? (m[2] as Technique) : undefined;
        return t ? { f, t } : { f };
      });
      steps.push(col);
      i += advance;
      continue;
    }
    i++;
  }
  while (steps.length && steps[steps.length - 1] === `|`) steps.pop();
  // Fit to the song's string count (tab is highest string first).
  return steps.map((s) => {
    if (s === `|`) return s;
    const col = s.slice(0, stringCount);
    while (col.length < stringCount) col.push(null);
    return col;
  });
}

interface Draft {
  label: string;
  type: SectionType;
  chords: string[];
  notes: string[];
  tabs: TabStep[][];
}

function toSection(d: Draft): Section {
  const s = createSection(d.type, d.label);
  s.chords = d.chords.join(`\n`).replace(/\n+$/, ``);
  s.notes = d.notes.join(`\n`).replace(/\n{3,}/g, `\n\n`).trim();
  s.tabs = d.tabs.map((steps) => ({ ...createTabBlock(6), id: newId(), steps }));
  return s;
}

function applyMeta(song: Song, key: string, value: string): boolean {
  const k = key.toLowerCase();
  if (k === `title` || k === `song`) song.title = value;
  else if (k === `artist` || k === `by` || k === `composer`) song.artist = value;
  else if (k === `key`) {
    const note = normalizeKeyName(value);
    if (!note) return false;
    song.key = note as NoteName;
    if (/m(?!aj)|minor/i.test(value.replace(/^[A-Ga-g][#b♯♭]?/, ``))) song.scaleId = `natural-minor`;
  } else if (k === `capo`) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) song.capo = Math.min(12, Math.max(0, n));
  } else if (k === `tempo` || k === `bpm`) {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) song.bpm = n;
  } else if (k === `time` || k === `time signature`) {
    if (/^\d+\/\d+$/.test(value.trim())) song.timeSignature = value.trim();
  } else return false;
  return true;
}

/** Convert ChordPro ("[C]Amazing [G]grace", "{title: …}", "{soc}") into plain chord-sheet text. */
export function chordProToText(src: string): string {
  const out: string[] = [];
  let inTab = false;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, ``);
    const dir = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line);
    if (dir) {
      const name = dir[1].toLowerCase();
      const value = dir[2] ?? ``;
      const meta: Record<string, string> = { title: `Title`, t: `Title`, subtitle: `Artist`, st: `Artist`, artist: `Artist`, key: `Key`, tempo: `Tempo`, time: `Time`, capo: `Capo` };
      if (meta[name]) out.push(`${meta[name]}: ${value}`);
      else if (/^(start_of_|so)(chorus|c)$/.test(name) || name === `soc`) out.push(`[${value || `Chorus`}]`);
      else if (name === `start_of_verse` || name === `sov`) out.push(`[${value || `Verse`}]`);
      else if (name === `start_of_bridge` || name === `sob`) out.push(`[${value || `Bridge`}]`);
      else if (name === `start_of_tab` || name === `sot`) inTab = true;
      else if (name === `end_of_tab` || name === `eot`) inTab = false;
      else if (name === `comment` || name === `c` || name === `comment_italic` || name === `ci` || name === `highlight`) {
        out.push(HEADER_RE.test(value) ? `[${value}]` : value);
      }
      continue;
    }
    if (inTab || !line.includes(`[`)) {
      out.push(line);
      continue;
    }
    // Inline chords → a chord line above the lyric line.
    let lyric = ``;
    let chords = ``;
    const re = /\[([^\]]+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      lyric += line.slice(last, m.index);
      if (chords.length > lyric.length) lyric = lyric.padEnd(chords.length);
      chords = chords.padEnd(lyric.length) + m[1] + ` `;
      last = m.index + m[0].length;
    }
    lyric += line.slice(last);
    out.push(chords.trimEnd());
    if (lyric.trim()) out.push(lyric);
  }
  return out.join(`\n`);
}

export function looksLikeChordPro(src: string): boolean {
  return /\{\s*(title|t|soc|start_of_chorus|artist|key|c|comment)\s*[:}]/i.test(src) || /\[[A-G][#b]?[^\]\s]{0,6}\][a-z]/i.test(src);
}

/** Parse a chord sheet. `fallbackTitle` is used when the text has no title line (e.g. the file name). */
export function parseChordSheet(text: string, fallbackTitle = ``): Song {
  const src = looksLikeChordPro(text) ? chordProToText(text) : text;
  const song = createSong();
  song.sections = [];
  const lines = src.replace(/\t/g, `    `).split(/\r?\n/);

  const drafts: Draft[] = [];
  let current: Draft | null = null;
  const ensure = (): Draft => {
    if (!current) {
      current = { label: drafts.length ? `Section ${drafts.length + 1}` : `Verse`, type: drafts.length ? `custom` : `verse`, chords: [], notes: [], tabs: [] };
      drafts.push(current);
    }
    return current;
  };

  let firstTextLines = 0;
  let keyFromSheet = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      const c = current as Draft | null;
      if (c) {
        if (c.chords.length && !c.notes.length) {
          if (c.chords[c.chords.length - 1] !== ``) c.chords.push(``);
        } else c.notes.push(``);
      }
      continue;
    }

    // Page furniture from printed charts (CCLI, copyright, URLs, page numbers).
    if (JUNK_RE.test(trimmed)) continue;
    // "Key - G | Tempo - 72 | Time - 4/4" on one line.
    if (!current && /\b(key|tempo|bpm|time|capo)\s*[:=-]/i.test(trimmed) && /[|•·]/.test(trimmed)) {
      let any = false;
      for (const part of trimmed.split(/\s*[|•·]\s*/)) {
        const m = META_RE.exec(part);
        if (m && applyMeta(song, m[1], m[2])) {
          any = true;
          if (/^key$/i.test(m[1])) keyFromSheet = true;
        }
      }
      if (any) continue;
    }
    const meta = META_RE.exec(trimmed);
    if (meta && !current && applyMeta(song, meta[1], meta[2])) {
      if (/^key$/i.test(meta[1])) keyFromSheet = true;
      continue;
    }

    const header = HEADER_RE.exec(trimmed) ?? (BRACKET_HEADER_RE.test(trimmed) && !isChordLine(trimmed.replace(/[[\]]/g, ``)) ? BRACKET_HEADER_RE.exec(trimmed) : null);
    if (header) {
      let label = header[1].replace(/\s+/g, ` `).replace(/:$/, ``).trim();
      if (label === label.toUpperCase()) label = label.toLowerCase();
      const type = sectionTypeFor(label);
      current = { label: label.replace(/\b\w/g, (c) => c.toUpperCase()), type, chords: [], notes: [], tabs: [] };
      drafts.push(current);
      continue;
    }

    if (isTabLine(line)) {
      const block = [line];
      while (i + 1 < lines.length && isTabLine(lines[i + 1])) block.push(lines[++i]);
      if (block.length >= 4) {
        ensure().tabs.push(parseTabBlock(block, 6));
        continue;
      }
      ensure().notes.push(...block);
      continue;
    }

    if (isChordLine(line)) {
      ensure().chords.push(line.replace(/\s+$/, ``));
      continue;
    }
    // A lyric right under a chord line stays with it in the chart, keeping chords over their words.
    if (current && (current as Draft).chords.length && !(current as Draft).notes.length) {
      (current as Draft).chords.push(line.replace(/\s+$/, ``));
      continue;
    }

    // Title/artist heuristics for the first lines of a sheet with no metadata.
    if (!current && !song.title && firstTextLines === 0) {
      firstTextLines++;
      const byMatch = /^(.+?)\s+(?:[-–—]|by)\s+(.+)$/i.exec(trimmed);
      if (byMatch) {
        song.title = byMatch[1].trim();
        song.artist = byMatch[2].trim();
      } else song.title = trimmed;
      continue;
    }
    if (!current && song.title && !song.artist && firstTextLines === 1 && /^(by\s+)?[\w .'&-]{2,40}$/i.test(trimmed)) {
      firstTextLines++;
      song.artist = trimmed.replace(/^by\s+/i, ``);
      continue;
    }
    ensure().notes.push(line.replace(/\s+$/, ``));
  }

  song.title = song.title || fallbackTitle || `Imported song`;
  // Number repeated section names ("Verse", "Verse" → "Verse", "Verse 2").
  const seen = new Map<string, number>();
  song.sections = drafts
    .filter((d) => d.chords.length || d.notes.some((n) => n.trim()) || d.tabs.length)
    .map((d) => {
      const n = (seen.get(d.label) ?? 0) + 1;
      seen.set(d.label, n);
      return toSection({ ...d, label: n > 1 && !/\d/.test(d.label) ? `${d.label} ${n}` : d.label });
    });
  if (!song.sections.length) song.sections = [createSection(`verse`, `Verse`)];
  if (!keyFromSheet) {
    // Guess the key from the first chord in the sheet.
    const first = song.sections
      .flatMap((s) => s.chords.split(`\n`).filter((l) => isChordLine(l)))
      .flatMap((l) => l.split(/\s+/))
      .find((t) => isChordToken(t));
    const note = first ? normalizeKeyName(first) : null;
    if (note) {
      song.key = note as NoteName;
      if (/^[A-G][#b]?m(?!aj)/.test(first ?? ``)) song.scaleId = `natural-minor`;
    }
  }
  return song;
}

export const SECTION_TYPE_IDS = SECTION_TYPES.map((t) => t.id);
