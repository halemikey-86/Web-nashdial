import { useToast } from '../components/ui';
import { parseImport, pickJsonFile } from './io';
import { useLibrary, type ImportResult } from './library';

/** Returns a function that opens the file picker and imports a song, setlist or library file. */
export function useImport() {
  const library = useLibrary();
  const toast = useToast();
  return async (appendToSetlistId?: string): Promise<ImportResult | null> => {
    const text = await pickJsonFile();
    if (text === null) return null;
    try {
      const result = library.importData(parseImport(text), appendToSetlistId);
      toast(result.message);
      return result;
    } catch (err) {
      alert((err as Error).message);
      return null;
    }
  };
}
