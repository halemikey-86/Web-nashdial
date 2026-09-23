export type InstrumentId = 'guitar' | 'bass' | '7-string' | '8-string';

export interface Instrument {
  id: InstrumentId;
  label: string;
  stringCount: number;
}

export interface Tuning {
  id: string;
  name: string;
  /** Low to high. */
  strings: string[];
  instrument: InstrumentId;
}

export const INSTRUMENTS: Instrument[] = [
  { id: `guitar`, label: `Guitar`, stringCount: 6 },
  { id: `bass`, label: `Bass`, stringCount: 4 },
  { id: `7-string`, label: `7-String`, stringCount: 7 },
  { id: `8-string`, label: `8-String`, stringCount: 8 },
];

export const TUNINGS: Tuning[] = [
  { id: `standard`, name: `Standard`, strings: [`E`, `A`, `D`, `G`, `B`, `E`], instrument: `guitar` },
  { id: `standard-d`, name: `Standard D`, strings: [`D`, `G`, `C`, `F`, `A`, `D`], instrument: `guitar` },
  { id: `open-d`, name: `Open D`, strings: [`D`, `A`, `D`, `F#`, `A`, `D`], instrument: `guitar` },
  { id: `standard-c`, name: `Standard C`, strings: [`C`, `F`, `A#`, `D#`, `G`, `C`], instrument: `guitar` },
  { id: `drop-d`, name: `Drop D`, strings: [`D`, `A`, `D`, `G`, `B`, `E`], instrument: `guitar` },
  { id: `drop-c`, name: `Drop C`, strings: [`C`, `G`, `C`, `F`, `A`, `D`], instrument: `guitar` },
  { id: `bass-standard`, name: `Standard`, strings: [`E`, `A`, `D`, `G`], instrument: `bass` },
  { id: `bass-drop-d`, name: `Drop D`, strings: [`D`, `A`, `D`, `G`], instrument: `bass` },
  { id: `7-standard`, name: `Standard`, strings: [`B`, `E`, `A`, `D`, `G`, `B`, `E`], instrument: `7-string` },
  { id: `7-drop-a`, name: `Drop A`, strings: [`A`, `E`, `A`, `D`, `G`, `B`, `E`], instrument: `7-string` },
  { id: `8-standard`, name: `Standard`, strings: [`F#`, `B`, `E`, `A`, `D`, `G`, `B`, `E`], instrument: `8-string` },
  { id: `8-drop-e`, name: `Drop E`, strings: [`E`, `B`, `E`, `A`, `D`, `G`, `B`, `E`], instrument: `8-string` },
];

const DEFAULT_TUNING_BY_INSTRUMENT: Record<InstrumentId, string> = {
  guitar: `standard`,
  bass: `bass-standard`,
  '7-string': `7-standard`,
  '8-string': `8-standard`,
};

export const DEFAULT_INSTRUMENT: InstrumentId = `guitar`;
export const DEFAULT_TUNING = TUNINGS[0];

export function tuningsFor(instrument: InstrumentId): Tuning[] {
  return TUNINGS.filter((t) => t.instrument === instrument);
}

export function defaultTuningFor(instrument: InstrumentId): Tuning {
  const id = DEFAULT_TUNING_BY_INSTRUMENT[instrument];
  return TUNINGS.find((t) => t.id === id) ?? DEFAULT_TUNING;
}

export function getTuning(id: string): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? DEFAULT_TUNING;
}

const LOWEST_OCTAVE: Record<InstrumentId, number> = { guitar: 2, bass: 1, '7-string': 1, '8-string': 1 };
const NOTE_ORDER = [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`];

/** MIDI numbers of the open strings, low to high (standard guitar: 40 45 50 55 59 64). */
export function openStringMidi(tuning: Tuning): number[] {
  const out: number[] = [];
  tuning.strings.forEach((name, i) => {
    const pc = NOTE_ORDER.indexOf(name);
    if (i === 0) {
      // Drop tunings below E sit in the same octave band as standard (D2, C2…).
      const octave = LOWEST_OCTAVE[tuning.instrument] + (tuning.instrument === `guitar` && pc > 4 ? -1 : 0);
      out.push((octave + 1) * 12 + pc);
    } else {
      let m = out[i - 1] + 1;
      while (m % 12 !== pc) m++;
      out.push(m);
    }
  });
  return out;
}

/** "G4"-style name for a MIDI note, using sharps. */
export function midiName(midi: number): string {
  return `${NOTE_ORDER[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function instrumentLabel(id: InstrumentId): string {
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}
