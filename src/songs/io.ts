import { normalizeSetlist, normalizeSong } from './model';
import { SCHEMA_VERSION, type Setlist, type Song } from './types';

/** What an exported file contains. `nashdial` names the kind so imports can tell them apart. */
export type ExportFile =
  | { nashdial: 'song'; version: number; exportedAt: string; song: Song }
  | { nashdial: 'setlist'; version: number; exportedAt: string; setlist: Setlist; songs: Song[] }
  | { nashdial: 'library'; version: number; exportedAt: string; songs: Song[]; setlists: Setlist[] };

export interface ParsedImport {
  kind: 'song' | 'setlist' | 'library';
  songs: Song[];
  setlists: Setlist[];
}

export function songFile(song: Song): ExportFile {
  return { nashdial: `song`, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), song };
}

export function setlistFile(setlist: Setlist, allSongs: Song[]): ExportFile {
  const ids = new Set(setlist.items.map((i) => i.songId));
  return {
    nashdial: `setlist`,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    setlist,
    songs: allSongs.filter((s) => ids.has(s.id)),
  };
}

export function libraryFile(songs: Song[], setlists: Setlist[]): ExportFile {
  return { nashdial: `library`, version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), songs, setlists };
}

function songsFrom(v: unknown): Song[] {
  return Array.isArray(v) ? v.map(normalizeSong).filter((s): s is Song => s !== null) : [];
}

/** Accepts NashDial export files, or a bare song / setlist object written by hand. */
export function parseImport(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`That file isn't valid JSON.`);
  }
  if (typeof data !== `object` || data === null) throw new Error(`That file doesn't contain a song or setlist.`);
  const o = data as Record<string, unknown>;

  if (o.nashdial === `library` || (Array.isArray(o.songs) && Array.isArray(o.setlists))) {
    const setlists = Array.isArray(o.setlists)
      ? o.setlists.map(normalizeSetlist).filter((s): s is Setlist => s !== null)
      : [];
    return { kind: `library`, songs: songsFrom(o.songs), setlists };
  }
  if (o.nashdial === `setlist` || o.setlist !== undefined || Array.isArray(o.items)) {
    const setlist = normalizeSetlist(o.setlist ?? o);
    if (!setlist) throw new Error(`The setlist in that file couldn't be read.`);
    return { kind: `setlist`, songs: songsFrom(o.songs), setlists: [setlist] };
  }
  if (Array.isArray(data)) {
    const songs = songsFrom(data);
    if (songs.length) return { kind: `library`, songs, setlists: [] };
  }
  const song = normalizeSong(o.song ?? o);
  if (!song) throw new Error(`That file doesn't contain a song or setlist.`);
  return { kind: `song`, songs: [song], setlists: [] };
}

export function fileSlug(...parts: string[]): string {
  const slug = parts
    .filter(Boolean)
    .join(`-`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, `-`)
    .replace(/^-+|-+$/g, ``);
  return slug || `nashdial`;
}

/** Save a JSON file: share sheet on phones/tablets (so it can go to Files, Drive, email…), download elsewhere. */
export async function saveJsonFile(filename: string, data: ExportFile): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], filename, { type: `application/json` });
  const touch = window.matchMedia(`(pointer: coarse)`).matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if ((err as DOMException).name === `AbortError`) return;
      // Fall through to a regular download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement(`a`);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open the file picker and resolve with the chosen file's text (null if cancelled). */
export function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement(`input`);
    input.type = `file`;
    // iOS greys out .json files when an accept filter is set, so only filter on desktop.
    if (!window.matchMedia(`(pointer: coarse)`).matches) input.accept = `.json,application/json`;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.addEventListener(`cancel`, () => resolve(null));
    input.click();
  });
}
