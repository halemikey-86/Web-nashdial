import { freshSolo, type RandomSolo } from './solo';

const SEEN_KEY = `nashdial-solo-seen`;
const SEEN_LIMIT = 5000;

// Every random solo handed out on this device (dial and song builder alike), so a new one is never a repeat.
const seen: Set<string> = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? `[]`);
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === `string`) : []);
  } catch {
    return new Set<string>();
  }
})();

/** A random solo never shown on this device before. */
export function nextSolo(...args: Parameters<typeof freshSolo> extends [Set<string>, ...infer R] ? R : never): RandomSolo {
  const solo = freshSolo(seen, ...args);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_LIMIT)));
  } catch {
    // storage unavailable
  }
  return solo;
}
