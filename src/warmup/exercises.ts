/** One note of an exercise. `s` is the string (0 = low E), `finger` 1 = index … 4 = pinky. */
export interface ExerciseStep {
  s: number;
  f: number;
  finger: 1 | 2 | 3 | 4;
  tech?: 'h' | 'p';
}

export interface Exercise {
  id: string;
  name: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  tips: string[];
  bpm: number;
  /** Notes per beat (2 = eighth notes, 4 = sixteenths). */
  perBeat: number;
  steps: ExerciseStep[];
}

type Finger = ExerciseStep['finger'];
const UP = [0, 1, 2, 3, 4, 5];
const DOWN = [5, 4, 3, 2, 1, 0];

/** Play a finger pattern on each string in turn, with finger 1 at fret `pos`. */
function across(pattern: Finger[], pos: number, strings: number[]): ExerciseStep[] {
  return strings.flatMap((s) => pattern.map((finger) => ({ s, f: pos + finger - 1, finger })));
}

function spider(pos: number): ExerciseStep[] {
  const up = [0, 1, 2, 3, 4].flatMap((s) => [
    { s, f: pos, finger: 1 as Finger },
    { s: s + 1, f: pos + 1, finger: 2 as Finger },
    { s, f: pos + 2, finger: 3 as Finger },
    { s: s + 1, f: pos + 3, finger: 4 as Finger },
  ]);
  const down = [5, 4, 3, 2, 1].flatMap((s) => [
    { s, f: pos + 3, finger: 4 as Finger },
    { s: s - 1, f: pos + 2, finger: 3 as Finger },
    { s, f: pos + 1, finger: 2 as Finger },
    { s: s - 1, f: pos, finger: 1 as Finger },
  ]);
  return [...up, ...down];
}

function trills(s: number, pos: number): ExerciseStep[] {
  const pairs: [Finger, Finger][] = [
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  return pairs.flatMap(([a, b]) =>
    Array.from({ length: 4 }, (_, i) => [
      { s, f: pos + a - 1, finger: a, ...(i > 0 ? { tech: `p` as const } : {}) },
      { s, f: pos + b - 1, finger: b, tech: `h` as const },
    ]).flat(),
  );
}

function ladder(): ExerciseStep[] {
  const up = UP.flatMap((s) => across([1, 2, 3, 4], 1 + s, [s]));
  const down = DOWN.flatMap((s) => across([4, 3, 2, 1], 1 + s, [s]));
  return [...up, ...down];
}

function shiftDown(s: number): ExerciseStep[] {
  return [9, 8, 7, 6, 5, 4, 3, 2, 1].flatMap((pos) => across([1, 2, 3, 4], pos, [s]));
}

function independence(pos: number): ExerciseStep[] {
  const a = UP.flatMap((s) => [
    { s, f: pos, finger: 1 as Finger },
    { s, f: pos + 2, finger: 3 as Finger },
  ]);
  const b = DOWN.flatMap((s) => [
    { s, f: pos + 1, finger: 2 as Finger },
    { s, f: pos + 3, finger: 4 as Finger },
  ]);
  return [...a, ...b];
}

export const EXERCISES: Exercise[] = [
  {
    id: `chromatic-1234`,
    name: `1-2-3-4 Chromatic`,
    level: `Beginner`,
    summary: `One finger per fret, up and back down every string.`,
    tips: [`Going up, leave each finger down until you change strings.`, `Thumb behind the neck, roughly behind your middle finger.`, `Alternate pick: down, up, down, up.`],
    bpm: 60,
    perBeat: 2,
    steps: [...across([1, 2, 3, 4], 1, UP), ...across([4, 3, 2, 1], 1, DOWN)],
  },
  {
    id: `permutation-1324`,
    name: `Finger Permutation 1-3-2-4`,
    level: `Beginner`,
    summary: `Breaks the "in order" habit so every finger works on its own.`,
    tips: [`Go slow enough that there's no buzz on the 3→2 move.`, `Try other orders once this is easy: 1-4-2-3, 2-4-1-3.`],
    bpm: 60,
    perBeat: 2,
    steps: [...across([1, 3, 2, 4], 5, UP), ...across([4, 2, 3, 1], 5, DOWN)],
  },
  {
    id: `spider`,
    name: `Spider Walk`,
    level: `Intermediate`,
    summary: `Fingers alternate between two strings, crawling across the neck.`,
    tips: [`Only move one finger at a time — the rest stay planted.`, `Great for accuracy when crossing strings.`],
    bpm: 55,
    perBeat: 2,
    steps: spider(5),
  },
  {
    id: `trills`,
    name: `Hammer-on / Pull-off Trills`,
    level: `Beginner`,
    summary: `Every finger pair trills on the G string — builds strength and speed.`,
    tips: [`Pick only the first note; hammer and pull the rest.`, `Pull off slightly downward so the note rings.`],
    bpm: 70,
    perBeat: 2,
    steps: trills(3, 5),
  },
  {
    id: `independence`,
    name: `Finger Independence 1-3 / 2-4`,
    level: `Intermediate`,
    summary: `Pairs of non-neighbor fingers: 1 & 3 up the neck, 2 & 4 back down.`,
    tips: [`Keep the unused fingers hovering close to the strings.`],
    bpm: 60,
    perBeat: 2,
    steps: independence(5),
  },
  {
    id: `ladder`,
    name: `Chromatic Ladder`,
    level: `Intermediate`,
    summary: `1-2-3-4 on each string, moving up one fret every string — practices shifting.`,
    tips: [`Shift the whole hand, not just the fingers.`, `Land the index finger first after each shift.`],
    bpm: 60,
    perBeat: 2,
    steps: ladder(),
  },
  {
    id: `string-skip`,
    name: `String Skipping`,
    level: `Advanced`,
    summary: `1-2-3-4 on strings E-D-A-G-D-B-G-e, skipping over a string each time.`,
    tips: [`Mute the skipped string with the side of your index finger.`],
    bpm: 55,
    perBeat: 2,
    steps: across([1, 2, 3, 4], 5, [0, 2, 1, 3, 2, 4, 3, 5]),
  },
  {
    id: `shift-down`,
    name: `Position Shift`,
    level: `Intermediate`,
    summary: `1-2-3-4 on the high e string, moving down a fret each time from the 9th position.`,
    tips: [`Slide the thumb with the hand so it stays behind the fingers.`],
    bpm: 70,
    perBeat: 4,
    steps: shiftDown(5),
  },
];

export const FINGER_COLORS: Record<Finger, string> = { 1: `#2f6fe0`, 2: `#35b84a`, 3: `#f08a1c`, 4: `#9b3fd6` };
/** Readable number colour on each finger colour (dark on the light green/orange). */
export const FINGER_TEXT: Record<Finger, string> = { 1: `#fff`, 2: `#10250f`, 3: `#1a1a1a`, 4: `#fff` };
export const FINGER_NAMES: Record<Finger, string> = { 1: `Index`, 2: `Middle`, 3: `Ring`, 4: `Pinky` };

export interface HandState {
  /** Where each finger is (string, fret) and whether it is pressing. */
  fingers: Record<Finger, { s: number; f: number; pressed: boolean }>;
}

/** Work out where every finger sits at each step: the active finger presses, the others hover one fret apart. */
export function handStates(steps: ExerciseStep[]): HandState[] {
  const out: HandState[] = [];
  let last: HandState['fingers'] | null = null;
  for (const step of steps) {
    const pos = step.f - (step.finger - 1);
    const fingers = {} as HandState['fingers'];
    for (const n of [1, 2, 3, 4] as Finger[]) {
      if (n === step.finger) fingers[n] = { s: step.s, f: step.f, pressed: true };
      else fingers[n] = { s: last?.[n].s ?? step.s, f: Math.max(1, pos + n - 1), pressed: false };
    }
    out.push({ fingers });
    last = fingers;
  }
  return out;
}
