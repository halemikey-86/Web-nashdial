import type { Tuning } from '../music/tunings';

/** String names for tab lines, highest string first. The top string is lower-cased when it repeats the bottom one (e…E). */
export function stringLabels(tuning: Tuning): string[] {
  const high = [...tuning.strings].reverse();
  return high.map((s, i) => (i === 0 && high.length > 1 && s === high[high.length - 1] ? s.toLowerCase() : s));
}
