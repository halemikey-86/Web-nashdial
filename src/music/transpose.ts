import { mod12 } from './notes';

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
