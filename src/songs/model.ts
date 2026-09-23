import { getScale } from '../music/scales';
import { getTuning } from '../music/tunings';
import type { NoteName } from '../music/notes';
import { isChordLine, normalizeKeyName } from './songTranspose';
import {
  SCHEMA_VERSION,
  SECTION_TYPES,
  TECHNIQUES,
  type Section,
  type SectionType,
  type Setlist,
  type SetlistItem,
  type Song,
  type TabBlock,
  type TabCell,
  type TabStep,
  type Technique,
} from './types';

export const TIME_SIGNATURES = [`4/4`, `3/4`, `6/8`, `2/4`, `5/4`, `7/8`, `12/8`];

export function beatsPerBar(timeSignature: string): number {
  const n = Number.parseInt(timeSignature, 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/**
 * Bars in a section: the explicit count if set, otherwise an estimate from the chord chart
 * (one bar per "|"-separated measure, or one bar per chord), then from the tab's measures.
 */
export function sectionBars(section: Pick<Section, 'bars' | 'chords' | 'tabs'>): { bars: number; estimated: boolean } {
  if (section.bars) return { bars: section.bars, estimated: false };
  const text = section.chords.trim();
  if (text) {
    const chordLines = text.split(`\n`).filter((l) => isChordLine(l));
    if (chordLines.some((l) => l.includes(`|`))) {
      const measures = chordLines.flatMap((l) => l.split(`|`)).filter((m) => m.trim()).length;
      if (measures) return { bars: measures, estimated: true };
    }
    const chords = chordLines.join(` `).split(/\s+/).filter((t) => /^[(\[]?[A-G]/.test(t)).length;
    if (chords) return { bars: chords, estimated: true };
  }
  const tabMeasures = Math.max(
    0,
    ...section.tabs.map((t) => t.steps.reduce((n, s, i) => n + (s === `|` && i > 0 ? 1 : 0), 1)),
  );
  return { bars: tabMeasures || 4, estimated: true };
}

export function newId(): string {
  if (typeof crypto !== `undefined` && `randomUUID` in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

export function sectionTypeLabel(type: SectionType): string {
  return SECTION_TYPES.find((s) => s.id === type)?.label ?? type;
}

export function emptyColumn(stringCount: number): (TabCell | null)[] {
  return Array.from({ length: stringCount }, () => null);
}

export function createTabBlock(stringCount: number, label = ``): TabBlock {
  return { id: newId(), label, steps: Array.from({ length: 8 }, () => emptyColumn(stringCount)) };
}

/** Label for a new section: "Verse", then "Verse 2", "Verse 3"… */
export function nextSectionLabel(sections: Section[], type: SectionType): string {
  const count = sections.filter((s) => s.type === type).length;
  const base = sectionTypeLabel(type);
  return count === 0 ? base : `${base} ${count + 1}`;
}

export function createSection(type: SectionType, label: string): Section {
  return { id: newId(), type, label, chords: ``, tabs: [], singleNotes: ``, notes: ``, bars: null };
}

export function createSong(): Song {
  const t = now();
  return {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    title: ``,
    artist: ``,
    key: `G`,
    scaleId: `major`,
    tuningId: `standard`,
    capo: 0,
    bpm: null,
    timeSignature: `4/4`,
    notes: ``,
    sections: [],
    solos: [],
    createdAt: t,
    updatedAt: t,
  };
}

export function createSetlist(name = `New setlist`): Setlist {
  const t = now();
  return { id: newId(), schemaVersion: SCHEMA_VERSION, name, date: ``, notes: ``, items: [], createdAt: t, updatedAt: t };
}

export function createSetlistItem(songId: string): SetlistItem {
  return { id: newId(), songId, key: null, capo: null, notes: `` };
}

export function touch<T extends { updatedAt: string }>(item: T): T {
  return { ...item, updatedAt: now() };
}

export function songDisplayName(song: Pick<Song, 'title' | 'artist'>): string {
  return song.title.trim() || `Untitled song`;
}

// ---------------------------------------------------------------------------
// Normalisation: turn anything that looks like a song/setlist into a valid one.
// Used on load from storage and on import, so hand-written JSON is forgiving.
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => typeof v === `object` && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ``): string => (typeof v === `string` ? v : typeof v === `number` ? String(v) : fallback);
const pick = (o: Loose, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === `string` ? Number.parseInt(v, 10) : typeof v === `number` ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function normalizeSectionType(v: unknown): SectionType {
  const s = str(v).toLowerCase().replace(/[\s_]+/g, `-`).replace(`pre-chorus`, `prechorus`);
  return (SECTION_TYPES.find((t) => t.id === s)?.id ?? `custom`) as SectionType;
}

function normalizeCell(v: unknown): TabCell | null {
  if (v === null || v === undefined || v === ``) return null;
  if (typeof v === `number`) return { f: clampInt(v, 0, 36, 0) };
  if (typeof v === `string`) {
    if (v.toLowerCase() === `x`) return { f: `x` };
    const m = /^(\d{1,2})(.)?$/.exec(v);
    if (!m) return null;
    const t = TECHNIQUES.includes(m[2] as Technique) ? (m[2] as Technique) : undefined;
    return t ? { f: Number(m[1]), t } : { f: Number(m[1]) };
  }
  if (isObj(v)) {
    const f = v.f === `x` || v.f === `X` ? `x` : clampInt(v.f, 0, 36, -1);
    if (f === -1) return null;
    const t = TECHNIQUES.includes(v.t as Technique) ? (v.t as Technique) : undefined;
    return t ? { f, t } : { f };
  }
  return null;
}

function normalizeStep(v: unknown, stringCount: number): TabStep | null {
  if (v === `|`) return `|`;
  if (!Array.isArray(v)) return null;
  const col = v.slice(0, stringCount).map(normalizeCell);
  while (col.length < stringCount) col.push(null);
  return col;
}

function normalizeTab(v: unknown, stringCount: number): TabBlock | null {
  if (!isObj(v)) return null;
  const steps = Array.isArray(v.steps)
    ? v.steps.map((s) => normalizeStep(s, stringCount)).filter((s): s is TabStep => s !== null)
    : [];
  return { id: str(v.id) || newId(), label: str(pick(v, `label`, `name`)), steps };
}

function normalizeSection(v: unknown, stringCount: number): Section | null {
  if (!isObj(v)) return null;
  const type = normalizeSectionType(pick(v, `type`, `label`, `name`));
  const tabs = Array.isArray(v.tabs) ? v.tabs.map((t) => normalizeTab(t, stringCount)).filter((t): t is TabBlock => t !== null) : [];
  const joinLines = (x: unknown) => (Array.isArray(x) ? x.map((y) => str(y)).join(`\n`) : str(x));
  return {
    id: str(v.id) || newId(),
    type,
    // An unknown type ("Solo", "Tag"…) becomes a custom section that keeps its name.
    label: str(pick(v, `label`, `name`)) || (type === `custom` && str(v.type) ? str(v.type) : sectionTypeLabel(type)),
    chords: joinLines(v.chords),
    tabs,
    singleNotes: joinLines(pick(v, `singleNotes`, `single_notes`, `notes_single`)),
    notes: joinLines(v.notes),
    bars: v.bars === null || v.bars === undefined || v.bars === `` ? null : clampInt(v.bars, 1, 256, 4),
  };
}

export function normalizeSong(v: unknown): Song | null {
  if (!isObj(v)) return null;
  const title = str(pick(v, `title`, `name`, `songName`));
  if (!title && !Array.isArray(v.sections)) return null;
  const tuning = getTuning(str(v.tuningId, `standard`));
  const stringCount = tuning.strings.length;
  const t = now();
  return {
    id: str(v.id) || newId(),
    schemaVersion: SCHEMA_VERSION,
    title,
    artist: str(pick(v, `artist`, `artistName`)),
    key: (normalizeKeyName(str(v.key)) ?? `G`) as NoteName,
    scaleId: getScale(str(v.scaleId, `major`)).id,
    tuningId: tuning.id,
    capo: clampInt(v.capo, 0, 12, 0),
    bpm: v.bpm === null || v.bpm === undefined || v.bpm === `` ? null : clampInt(v.bpm, 20, 400, 120),
    timeSignature: TIME_SIGNATURES.includes(str(pick(v, `timeSignature`, `time`))) ? str(pick(v, `timeSignature`, `time`)) : `4/4`,
    notes: str(v.notes),
    sections: Array.isArray(v.sections)
      ? v.sections.map((s) => normalizeSection(s, stringCount)).filter((s): s is Section => s !== null)
      : [],
    solos: Array.isArray(v.solos) ? v.solos.map((x) => normalizeTab(x, stringCount)).filter((x): x is TabBlock => x !== null) : [],
    createdAt: str(v.createdAt) || t,
    updatedAt: str(v.updatedAt) || t,
  };
}

function normalizeItem(v: unknown): SetlistItem | null {
  if (typeof v === `string`) return createSetlistItem(v);
  if (!isObj(v) || !str(v.songId)) return null;
  const key = v.key ? normalizeKeyName(str(v.key)) : null;
  return {
    id: str(v.id) || newId(),
    songId: str(v.songId),
    key: key as NoteName | null,
    capo: v.capo === null || v.capo === undefined || v.capo === `` ? null : clampInt(v.capo, 0, 12, 0),
    notes: str(v.notes),
  };
}

export function normalizeSetlist(v: unknown): Setlist | null {
  if (!isObj(v)) return null;
  const t = now();
  return {
    id: str(v.id) || newId(),
    schemaVersion: SCHEMA_VERSION,
    name: str(v.name) || `Imported setlist`,
    date: str(v.date),
    notes: str(v.notes),
    items: Array.isArray(v.items) ? v.items.map(normalizeItem).filter((i): i is SetlistItem => i !== null) : [],
    createdAt: str(v.createdAt) || t,
    updatedAt: str(v.updatedAt) || t,
  };
}
