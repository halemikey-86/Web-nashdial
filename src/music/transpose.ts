import { KEYS, mod12 } from './notes';
import { diatonicChords, getScale, nashvilleLabels } from './scales';

export function intervalBetween(from: number, to: number): number {
  return mod12(to - from);
}

export function describeInterval(semitones: number): string {
  if (semitones === 0) return `Same key`;
  const dir = semitones <= 6 ? `Up` : `Down`;
  const n = semitones <= 6 ? semitones : 12 - semitones;
  return `${dir} ${n} semitone${n === 1 ? `` : `s`}`;
}

/** Signed shortest move: 0..6 up, or -1..-5 down. */
export function signedInterval(from: number, to: number): number {
  const up = intervalBetween(from, to);
  return up <= 6 ? up : up - 12;
}

export interface ConversionRow {
  degree: string;
  from: string;
  to: string;
}

export function conversionRows(fromKey: number, toKey: number, scaleId: string): ConversionRow[] {
  const a = diatonicChords(KEYS[fromKey].root, scaleId);
  const b = diatonicChords(KEYS[toKey].root, scaleId);
  const degrees = nashvilleLabels(scaleId);
  return a.map((chord, i) => ({ degree: degrees[i], from: chord.label, to: b[i]?.label ?? `` }));
}

export function conversionSummary(fromKey: number, toKey: number, scaleId: string): string {
  const name = getScale(scaleId).shortName;
  return `${KEYS[fromKey].label} ${name} → ${KEYS[toKey].label} ${name} (${describeInterval(intervalBetween(fromKey, toKey))})`;
}
