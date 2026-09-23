import { describe, expect, it } from 'vitest';
import { EXERCISES, handStates } from '../warmup/exercises';
import { CAGED } from './chordShapes';
import { cagedPositions, shapesAt } from './cagedPositions';
import { DEFAULT_TUNING, TUNINGS, midiName, openStringMidi } from './tunings';

describe(`CAGED positions`, () => {
  it(`finds the standard boxes for G major`, () => {
    const boxes = cagedPositions(DEFAULT_TUNING, `G`, `major`, 0, 21).map((p) => `${p.shape}:${p.lo}-${p.hi}`);
    expect(boxes).toEqual(expect.arrayContaining([`G:0-3`, `E:2-5`, `D:4-8`, `C:6-10`, `A:9-12`, `G:11-15`, `E:14-17`]));
  });

  it(`uses minor shapes for minor keys (E-shape A minor at the 5th fret)`, () => {
    const e = cagedPositions(DEFAULT_TUNING, `A`, `natural-minor`, 0, 21).find((p) => p.shape === `E` && p.lo >= 4);
    expect(e).toEqual({ shape: `E`, lo: 4, hi: 7 });
  });

  it(`clips positions to the capo`, () => {
    const boxes = cagedPositions(DEFAULT_TUNING, `A`, `major`, 2, 21);
    expect(Math.min(...boxes.map((p) => p.lo))).toBeGreaterThanOrEqual(2);
  });

  it(`reports which visible shapes cover a fret`, () => {
    const boxes = cagedPositions(DEFAULT_TUNING, `G`, `major`, 0, 21);
    expect(shapesAt(boxes, 5, new Set(CAGED))).toEqual(expect.arrayContaining([`E`, `D`]));
    expect(shapesAt(boxes, 5, new Set([`A`]))).toEqual([]);
  });
});

describe(`open strings`, () => {
  it(`gives real pitches for common tunings`, () => {
    expect(openStringMidi(DEFAULT_TUNING)).toEqual([40, 45, 50, 55, 59, 64]);
    expect(openStringMidi(TUNINGS.find((t) => t.id === `drop-d`)!)).toEqual([38, 45, 50, 55, 59, 64]);
    expect(openStringMidi(TUNINGS.find((t) => t.id === `bass-standard`)!)).toEqual([28, 33, 38, 43]);
    expect(openStringMidi(TUNINGS.find((t) => t.id === `7-standard`)!)[0]).toBe(35);
    expect(midiName(64 + 3)).toBe(`G4`);
  });
});

describe(`warm-up hand positions`, () => {
  it(`presses the active finger and keeps the others one fret apart`, () => {
    const ex = EXERCISES.find((e) => e.id === `chromatic-1234`)!;
    const hand = handStates(ex.steps)[2]; // finger 3 on low E, fret 3
    expect(hand.fingers[3]).toEqual({ s: 0, f: 3, pressed: true });
    expect(hand.fingers[1]).toMatchObject({ f: 1, pressed: false });
    expect(hand.fingers[4]).toMatchObject({ f: 4, pressed: false });
  });

  it(`every exercise stays on a 6-string neck`, () => {
    for (const ex of EXERCISES) {
      for (const s of ex.steps) {
        expect(s.s).toBeGreaterThanOrEqual(0);
        expect(s.s).toBeLessThan(6);
        expect(s.f).toBeGreaterThanOrEqual(1);
        expect(s.f).toBeLessThanOrEqual(21);
      }
    }
  });
});
