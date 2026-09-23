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

export function instrumentLabel(id: InstrumentId): string {
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}
