import { useToast } from '../components/ui';
import { navigate } from '../router';
import { importSongFile, pickSongFile } from './importers';
import { parseChordSheet } from './importers/textSheet';
import { useLibrary, type ImportResult } from './library';
import { songDisplayName } from './model';
import type { Song } from './types';

/**
 * Returns a function that opens the file picker and imports a file: a NashDial song/setlist/backup,
 * or a chord sheet, ChordPro, PDF or MusicXML file that becomes a new song.
 */
export function useImport() {
  const library = useLibrary();
  const toast = useToast();

  const addSongs = (songs: Song[], appendToSetlistId?: string, openEditor = true): ImportResult => {
    songs.forEach((s) => library.saveSong(s));
    if (appendToSetlistId) library.addSongsToSetlist(appendToSetlistId, songs.map((s) => s.id));
    const message =
      songs.length === 1 ? `Imported “${songDisplayName(songs[0])}” — check it over and Save.` : `Imported ${songs.length} songs.`;
    toast(message);
    if (openEditor && songs.length === 1 && !appendToSetlistId) navigate({ name: `song-edit`, id: songs[0].id });
    return { message, songIds: songs.map((s) => s.id), setlistIds: [] };
  };

  const run = async (appendToSetlistId?: string): Promise<ImportResult | null> => {
    const file = await pickSongFile();
    if (!file) return null;
    try {
      const result = await importSongFile(file);
      if (result.kind === `nashdial`) {
        const r = library.importData(result.data, appendToSetlistId);
        toast(r.message);
        return r;
      }
      return addSongs(result.songs, appendToSetlistId);
    } catch (err) {
      alert((err as Error).message || `That file couldn't be imported.`);
      return null;
    }
  };

  /** Import a chord sheet pasted as text. */
  run.fromText = (text: string, appendToSetlistId?: string): ImportResult | null => {
    if (!text.trim()) return null;
    return addSongs([parseChordSheet(text)], appendToSetlistId);
  };

  return run;
}
