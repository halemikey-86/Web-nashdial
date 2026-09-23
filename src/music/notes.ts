export const NOTES = [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`] as const;

export type NoteName = (typeof NOTES)[number];

export interface KeyOption {
  label: string;
  root: NoteName;
}

const SHARP_NAMES = [`C`, `C♯`, `D`, `D♯`, `E`, `F`, `F♯`, `G`, `G♯`, `A`, `A♯`, `B`];
const FLAT_NAMES = [`C`, `D♭`, `D`, `E♭`, `E`, `F`, `G♭`, `G`, `A♭`, `A`, `B♭`, `B`];
/** Conventional major-key names: D♭, E♭, F♯, A♭, B♭. */
const MAJOR_KEY_NAMES = [`C`, `D♭`, `D`, `E♭`, `E`, `F`, `F♯`, `G`, `A♭`, `A`, `B♭`, `B`];
/** Conventional minor-key names: c♯, e♭, f♯, g♯, b♭. */
const MINOR_KEY_NAMES = [`C`, `C♯`, `D`, `E♭`, `E`, `F`, `F♯`, `G`, `G♯`, `A`, `B♭`, `B`];

/** Chromatic keys in dial order (index 0 = C), labelled with conventional key names. */
export const KEYS: KeyOption[] = NOTES.map((root, i) => ({ root, label: MAJOR_KEY_NAMES[i] }));

export function noteIndex(note: string): number {
  return NOTES.indexOf(note as NoteName);
}

export function noteAt(index: number): NoteName {
  return NOTES[((index % 12) + 12) % 12];
}

/** Wrap a semitone difference into 0–11. */
export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Major keys written with flats: F, B♭, E♭, A♭, D♭. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1]);
const MINOR_FLAVOURED = new Set([`natural-minor`, `harmonic-minor`, `melodic-minor`, `minor-pentatonic`, `blues`, `dorian`, `phrygian`, `locrian`]);

/** Whether a key is written with flats (judged by its relative major for minor-type scales). */
/** Scales that sit on a minor tonic (their relative major sets the key signature). */
export function isMinorFlavoured(scaleId: string): boolean {
  return MINOR_FLAVOURED.has(scaleId);
}

export function prefersFlats(keyIndex: number, scaleId: string): boolean {
  const major = MINOR_FLAVOURED.has(scaleId) ? mod12(keyIndex + 3) : mod12(keyIndex);
  return FLAT_MAJOR_KEYS.has(major);
}

export function spellNote(index: number, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(index)];
}

/** A note spelled the way the key writes it: B♭ in F major, A♯ in B major. */
export function spellInKey(note: string, keyRoot: string, scaleId: string): string {
  return spellNote(noteIndex(note), prefersFlats(noteIndex(keyRoot), scaleId));
}

/** A key's name spelled for its scale: D♭ major, C♯ minor, F♯ major. */
export function keyLabel(keyIndex: number, scaleId: string): string {
  return spellNote(keyIndex, prefersFlats(keyIndex, scaleId));
}

/** Name of the key itself: "B♭ major", "c♯"-style minor names. */
export function keyName(keyIndex: number, minor = false): string {
  return (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[mod12(keyIndex)];
}

/** Sharp spelling with ♯ (for places with no key context, e.g. the tuner). */
export function displayNote(note: string): string {
  return note.replace(`#`, `♯`);
}

/** Unicode ♯/♭ → typeable # / b, for text the user edits. */
export function asciiAccidentals(text: string): string {
  return text.replace(/♯/g, `#`).replace(/♭/g, `b`);
}

export const CAPO_FRETS = Array.from({ length: 13 }, (_, i) => i);

export function capoLabel(fret: number): string {
  return fret === 0 ? `No capo` : `Capo ${fret}`;
}
