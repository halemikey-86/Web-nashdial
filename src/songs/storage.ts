import { normalizeSetlist, normalizeSong } from './model';
import type { Setlist, Song } from './types';

const SONGS_KEY = `nashdial-songs`;
const SETLISTS_KEY = `nashdial-setlists`;

function readArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadSongs(): Song[] {
  return readArray(SONGS_KEY)
    .map(normalizeSong)
    .filter((s): s is Song => s !== null);
}

export function loadSetlists(): Setlist[] {
  return readArray(SETLISTS_KEY)
    .map(normalizeSetlist)
    .filter((s): s is Setlist => s !== null);
}

let persistRequested = false;

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(err);
    alert(`Couldn't save to this device's storage. Export your songs as a backup.`);
    return;
  }
  // Ask the browser not to evict our data under storage pressure.
  if (!persistRequested && navigator.storage?.persist) {
    persistRequested = true;
    navigator.storage.persist().catch(() => undefined);
  }
}

export function saveSongs(songs: Song[]): void {
  write(SONGS_KEY, songs);
}

export function saveSetlists(setlists: Setlist[]): void {
  write(SETLISTS_KEY, setlists);
}

// Small per-device display preferences.
export function loadPref<T extends string | number>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`nashdial-${key}`);
    if (raw === null) return fallback;
    return (typeof fallback === `number` ? Number(raw) : raw) as T;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string | number): void {
  try {
    localStorage.setItem(`nashdial-${key}`, String(value));
  } catch {
    // storage unavailable
  }
}
