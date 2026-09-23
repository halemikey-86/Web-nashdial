import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createSetlistItem, newId, songDisplayName, touch } from './model';
import type { ParsedImport } from './io';
import { loadSetlists, loadSongs, saveSetlists, saveSongs } from './storage';
import type { Setlist, Song } from './types';

export interface ImportResult {
  message: string;
  /** Library ids of the songs that were imported (or matched), in file order. */
  songIds: string[];
  setlistIds: string[];
}

interface LibraryApi {
  songs: Song[];
  setlists: Setlist[];
  getSong: (id: string) => Song | undefined;
  getSetlist: (id: string) => Setlist | undefined;
  saveSong: (song: Song) => void;
  deleteSong: (id: string) => void;
  duplicateSong: (id: string) => Song | undefined;
  saveSetlist: (setlist: Setlist) => void;
  deleteSetlist: (id: string) => void;
  addSongsToSetlist: (setlistId: string, songIds: string[]) => void;
  importData: (data: ParsedImport, appendToSetlistId?: string) => ImportResult;
}

const LibraryContext = createContext<LibraryApi | null>(null);

const sameContent = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<Song[]>(loadSongs);
  const [setlists, setSetlists] = useState<Setlist[]>(loadSetlists);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) saveSongs(songs);
  }, [songs]);
  useEffect(() => {
    if (loaded.current) saveSetlists(setlists);
  }, [setlists]);
  useEffect(() => {
    loaded.current = true;
  }, []);

  // Keep other tabs/windows of the app in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === `nashdial-songs`) setSongs(loadSongs());
      if (e.key === `nashdial-setlists`) setSetlists(loadSetlists());
    };
    window.addEventListener(`storage`, onStorage);
    return () => window.removeEventListener(`storage`, onStorage);
  }, []);

  const songsRef = useRef(songs);
  songsRef.current = songs;
  const setlistsRef = useRef(setlists);
  setlistsRef.current = setlists;

  const saveSong = useCallback((song: Song) => {
    const next = touch(song);
    setSongs((prev) => (prev.some((s) => s.id === song.id) ? prev.map((s) => (s.id === song.id ? next : s)) : [...prev, next]));
  }, []);

  const deleteSong = useCallback((id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    setSetlists((prev) =>
      prev.map((l) => (l.items.some((i) => i.songId === id) ? touch({ ...l, items: l.items.filter((i) => i.songId !== id) }) : l)),
    );
  }, []);

  const duplicateSong = useCallback((id: string) => {
    const src = songsRef.current.find((s) => s.id === id);
    if (!src) return undefined;
    const copy = touch({ ...structuredClone(src), id: newId(), title: `${src.title} (copy)`, createdAt: new Date().toISOString() });
    setSongs((prev) => [...prev, copy]);
    return copy;
  }, []);

  const saveSetlist = useCallback((setlist: Setlist) => {
    const next = touch(setlist);
    setSetlists((prev) => (prev.some((l) => l.id === setlist.id) ? prev.map((l) => (l.id === setlist.id ? next : l)) : [...prev, next]));
  }, []);

  const deleteSetlist = useCallback((id: string) => {
    setSetlists((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const addSongsToSetlist = useCallback((setlistId: string, songIds: string[]) => {
    setSetlists((prev) =>
      prev.map((l) => (l.id === setlistId ? touch({ ...l, items: [...l.items, ...songIds.map(createSetlistItem)] }) : l)),
    );
  }, []);

  const importData = useCallback((data: ParsedImport, appendToSetlistId?: string): ImportResult => {
    const existingSongs = songsRef.current;
    const existingSetlists = setlistsRef.current;
    const byId = new Map(existingSongs.map((s) => [s.id, s]));

    const fresh = data.songs.filter((s) => !byId.has(s.id));
    const conflicts = data.songs.filter((s) => byId.has(s.id) && !sameContent({ ...byId.get(s.id), updatedAt: `` }, { ...s, updatedAt: `` }));
    const unchanged = data.songs.length - fresh.length - conflicts.length;

    let replace = false;
    if (conflicts.length) {
      const names = conflicts.slice(0, 5).map((s) => `• ${songDisplayName(s)}`).join(`\n`);
      replace = confirm(
        `${conflicts.length === 1 ? `This song is` : `${conflicts.length} songs are`} already in your library with different content:\n${names}${conflicts.length > 5 ? `\n…` : ``}\n\nOK = replace with the file's version\nCancel = keep your version`,
      );
    }

    const replacements = new Map(replace ? conflicts.map((s) => [s.id, s]) : []);
    setSongs((prev) => [...prev.map((s) => replacements.get(s.id) ?? s), ...fresh]);

    const setlistIds: string[] = [];
    const incomingLists: Setlist[] = [];
    const replacedLists = new Map<string, Setlist>();
    for (const list of data.setlists) {
      const existing = existingSetlists.find((l) => l.id === list.id);
      if (!existing) {
        incomingLists.push(list);
        setlistIds.push(list.id);
      } else if (sameContent({ ...existing, updatedAt: `` }, { ...list, updatedAt: `` })) {
        setlistIds.push(list.id);
      } else if (confirm(`You already have the setlist “${existing.name}”.\n\nOK = replace it with the file's version\nCancel = import it as a separate copy`)) {
        replacedLists.set(list.id, list);
        setlistIds.push(list.id);
      } else {
        const copy = { ...list, id: newId(), name: `${list.name} (imported)` };
        incomingLists.push(copy);
        setlistIds.push(copy.id);
      }
    }

    // Songs in file order; a setlist file lists them in set order.
    const orderedIds =
      data.kind === `setlist` && data.setlists[0]
        ? data.setlists[0].items.map((i) => i.songId).filter((id) => data.songs.some((s) => s.id === id))
        : data.songs.map((s) => s.id);

    setSetlists((prev) => {
      let next = [...prev.map((l) => replacedLists.get(l.id) ?? l), ...incomingLists];
      if (appendToSetlistId) {
        next = next.map((l) => (l.id === appendToSetlistId ? touch({ ...l, items: [...l.items, ...orderedIds.map(createSetlistItem)] }) : l));
      }
      return next;
    });

    const parts: string[] = [];
    if (fresh.length) parts.push(`${fresh.length} new song${fresh.length === 1 ? `` : `s`}`);
    if (conflicts.length) parts.push(`${conflicts.length} ${replace ? `replaced` : `kept as-is`}`);
    if (unchanged) parts.push(`${unchanged} already up to date`);
    if (data.setlists.length) parts.push(`${data.setlists.length} setlist${data.setlists.length === 1 ? `` : `s`}`);
    if (appendToSetlistId && orderedIds.length) parts.push(`added to this set`);
    return { message: `Imported: ${parts.join(`, `) || `nothing new`}.`, songIds: orderedIds, setlistIds };
  }, []);

  const api = useMemo<LibraryApi>(
    () => ({
      songs,
      setlists,
      getSong: (id) => songs.find((s) => s.id === id),
      getSetlist: (id) => setlists.find((l) => l.id === id),
      saveSong,
      deleteSong,
      duplicateSong,
      saveSetlist,
      deleteSetlist,
      addSongsToSetlist,
      importData,
    }),
    [songs, setlists, saveSong, deleteSong, duplicateSong, saveSetlist, deleteSetlist, addSongsToSetlist, importData],
  );

  return <LibraryContext.Provider value={api}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryApi {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error(`useLibrary must be used inside LibraryProvider`);
  return ctx;
}
