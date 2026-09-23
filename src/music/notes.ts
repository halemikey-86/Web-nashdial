export const NOTES = [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`] as const;

export type NoteName = (typeof NOTES)[number];

export interface KeyOption {
  label: string;
  root: NoteName;
}

/** Chromatic keys in dial order (index 0 = C). */
export const KEYS: KeyOption[] = NOTES.map((root) => ({
  root,
  label: root.replace(`#`, `♯`),
}));

export function noteIndex(note: string): number {
  return NOTES.indexOf(note as NoteName);
}

export function noteAt(index: number): NoteName {
  return NOTES[((index % 12) + 12) % 12];
}

export function displayNote(note: string): string {
  return note.replace(`#`, `♯`);
}

/** Wrap a semitone difference into 0–11. */
export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export const CAPO_FRETS = Array.from({ length: 13 }, (_, i) => i);

export function capoLabel(fret: number): string {
  return fret === 0 ? `No capo` : `Capo ${fret}`;
}
