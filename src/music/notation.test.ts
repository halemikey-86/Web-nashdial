import { describe, expect, it } from 'vitest';
import { keySignature, notateEighths, notateQuarters, spellMidi, spelledName, staffLayout, staffPosition, writtenStep } from './notation';

const name = (midi: number, fifths: number, tonic: number) => spelledName(spellMidi(midi, fifths, tonic));

describe(`standard notation`, () => {
  it(`knows key signatures, including modes and minor keys`, () => {
    expect(keySignature(7, `major`)).toBe(1); // G: F♯
    expect(keySignature(5, `major`)).toBe(-1); // F: B♭
    expect(keySignature(9, `natural-minor`)).toBe(0); // A minor
    expect(keySignature(2, `dorian`)).toBe(0); // D dorian = C major
    expect(keySignature(7, `mixolydian`)).toBe(0); // G mixolydian = C major
    expect(keySignature(1, `major`)).toBe(-5); // D♭
    expect(keySignature(6, `major`)).toBe(6); // F♯
  });

  it(`spells notes the way the key writes them`, () => {
    expect(name(66, 1, 7)).toBe(`F♯`); // G major
    expect(name(70, -1, 5)).toBe(`B♭`); // F major
    expect(name(65, 1, 7)).toBe(`F`); // F natural in G (needs a ♮ on the staff)
    expect(name(70, 1, 7)).toBe(`B♭`); // the blue ♭3 in G
    expect(name(61, 0, 0)).toBe(`D♭`); // ♭2 in C
    expect(name(66, 0, 0)).toBe(`G♭`); // ♭5 in C
    expect(name(65, 6, 6)).toBe(`E♯`); // F♯ major's 7th
    expect(name(68, 0, 9)).toBe(`G♯`); // A harmonic minor's raised 7th
  });

  it(`writes guitar an octave up in treble and bass in bass clef`, () => {
    // Low E on guitar (E2) is written E3, three ledger lines below the treble staff.
    expect(staffPosition(writtenStep(spellMidi(40, 0, 0)), `treble`)).toBe(-7);
    // Open high E (E4) is written E5 in the top space.
    expect(staffPosition(writtenStep(spellMidi(64, 0, 0)), `treble`)).toBe(7);
    // Bass low E (E1) is written E2, one ledger line below the bass staff.
    expect(staffPosition(writtenStep(spellMidi(28, 0, 0)), `bass`)).toBe(-2);
    expect(staffLayout(`bass`)).toBe(`bass`);
    expect(staffLayout(`7-string`)).toBe(`treble`);
    expect(staffLayout(`8-string`)).toBe(`grand`);
  });

  it(`turns eighth slots into notes and merged rests`, () => {
    const bars = notateEighths([60, 62, null, null, null, null, null, null, 64, null, 65, 67, null, null, null, null]);
    expect(bars[0].map((e) => [e.start, e.dur, e.midi])).toEqual([
      [0, 1, 60],
      [1, 1, 62],
      [2, 2, null],
      [4, 4, null],
    ]);
    // The last note rings: G at the "and" of beat 2 holds a dotted quarter, then a quarter rest.
    expect(bars[1].map((e) => [e.start, e.dur, e.midi])).toEqual([
      [0, 1, 64],
      [1, 1, null],
      [2, 1, 65],
      [3, 3, 67],
      [6, 2, null],
    ]);
    for (const bar of bars) expect(bar.reduce((n, e) => n + e.dur, 0)).toBe(8);
  });

  it(`writes a scale in quarter notes, rests filling the last bar`, () => {
    const bars = notateQuarters([60, 62, 64, 65, 67, 69]);
    expect(bars).toHaveLength(2);
    expect(bars[1].map((e) => [e.start, e.dur, e.midi])).toEqual([
      [0, 2, 67],
      [2, 2, 69],
      [4, 4, null],
    ]);
  });
});
