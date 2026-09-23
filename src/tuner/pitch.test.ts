import { describe, expect, it } from 'vitest';
import { sectionBars, normalizeSong } from '../songs/model';
import { centsOff, detectPitch, midiLabel, midiToHz } from './pitch';

/** A plucked-string-like tone: a fundamental plus decaying harmonics. */
function tone(hz: number, sampleRate = 48000, n = 8192): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    buf[i] = 0.5 * Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * 2 * hz * t) + 0.15 * Math.sin(2 * Math.PI * 3 * hz * t);
  }
  return buf;
}

describe(`pitch detection`, () => {
  for (const [name, hz] of [
    [`low E (E2)`, 82.41],
    [`A2`, 110],
    [`G3`, 196],
    [`high e (E4)`, 329.63],
    [`bass low E (E1)`, 41.2],
    [`drop C (C2)`, 65.41],
  ] as const) {
    it(`finds ${name} within 2 cents`, () => {
      const found = detectPitch(tone(hz), 48000, 25, 1200);
      expect(found).not.toBeNull();
      expect(Math.abs(centsOff(found!, hz))).toBeLessThan(2);
    });
  }

  it(`ignores silence`, () => {
    expect(detectPitch(new Float32Array(8192), 48000)).toBeNull();
  });

  it(`labels and converts notes`, () => {
    expect(midiLabel(40)).toBe(`E2`);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(69, 432)).toBeCloseTo(432);
  });
});

describe(`section bars`, () => {
  it(`uses the explicit count when set`, () => {
    expect(sectionBars({ bars: 12, chords: `G C`, tabs: [] })).toEqual({ bars: 12, estimated: false });
  });
  it(`counts measures between bar lines`, () => {
    expect(sectionBars({ bars: null, chords: `| G . . . | C . . . |\n| D | G |`, tabs: [] })).toEqual({ bars: 4, estimated: true });
  });
  it(`falls back to one bar per chord`, () => {
    expect(sectionBars({ bars: null, chords: `G  D/F#  Em  C`, tabs: [] })).toEqual({ bars: 4, estimated: true });
  });
});

describe(`section types`, () => {
  it(`keeps unknown section names as custom sections`, () => {
    const song = normalizeSong({ title: `x`, sections: [{ type: `Solo` }, { type: `interlude` }] });
    expect(song?.sections[0]).toMatchObject({ type: `custom`, label: `Solo` });
    expect(song?.sections[1]).toMatchObject({ type: `interlude`, label: `Interlude` });
    expect(song?.timeSignature).toBe(`4/4`);
  });
});
