import type { NoteName } from '../music/notes';

export const SCHEMA_VERSION = 1;

export const SECTION_TYPES = [
  { id: `intro`, label: `Intro` },
  { id: `verse`, label: `Verse` },
  { id: `prechorus`, label: `Prechorus` },
  { id: `chorus`, label: `Chorus` },
  { id: `bridge`, label: `Bridge` },
  { id: `vamp`, label: `Vamp` },
  { id: `epic-chorus`, label: `Epic Chorus` },
  { id: `outro`, label: `Outro` },
] as const;

export type SectionType = (typeof SECTION_TYPES)[number]['id'];

export const TECHNIQUES = [`h`, `p`, `/`, `\\`, `b`, `r`, `~`, `t`] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const TECHNIQUE_NAMES: Record<Technique, string> = {
  h: `Hammer-on`,
  p: `Pull-off`,
  '/': `Slide up`,
  '\\': `Slide down`,
  b: `Bend`,
  r: `Release`,
  '~': `Vibrato`,
  t: `Tap`,
};

/** One string in one tab column. `f: "x"` is a muted/dead note. */
export interface TabCell {
  f: number | 'x';
  t?: Technique;
}

/** A column of cells, index 0 = highest string (top line of the tab). */
export type TabColumn = (TabCell | null)[];

/** A tab is a run of columns; the string "|" is a bar line. */
export type TabStep = TabColumn | '|';

export interface TabBlock {
  id: string;
  label: string;
  steps: TabStep[];
}

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  /** Chord chart text, e.g. "G  D/F#  Em  C". Multiple lines allowed. */
  chords: string;
  tabs: TabBlock[];
  /** Note names, e.g. "B3 D4 G4 | A3". */
  singleNotes: string;
  notes: string;
}

export interface Song {
  id: string;
  schemaVersion: number;
  title: string;
  artist: string;
  /** Key the song is written in. */
  key: NoteName;
  scaleId: string;
  tuningId: string;
  /** Capo the tabs and chords were written with. */
  capo: number;
  bpm: number | null;
  notes: string;
  sections: Section[];
  createdAt: string;
  updatedAt: string;
}

export interface SetlistItem {
  id: string;
  songId: string;
  /** Performance key; falls back to the song's key. */
  key: NoteName | null;
  /** Performance capo; falls back to the song's capo. */
  capo: number | null;
  notes: string;
}

export interface Setlist {
  id: string;
  schemaVersion: number;
  name: string;
  date: string;
  notes: string;
  items: SetlistItem[];
  createdAt: string;
  updatedAt: string;
}
