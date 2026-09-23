import { describe, expect, it } from 'vitest';
import { keyLabel, keyName, spellInKey } from './notes';
import { diatonicChords } from './scales';
import { seventhChords } from './theory';
import { transposeChordText } from '../songs/songTranspose';

describe(`note spelling follows the key`, () => {
  it(`uses B♭ (not A♯) in F major everywhere`, () => {
    expect(diatonicChords(`F`, `major`).map((c) => c.label)).toEqual([`F`, `Gm`, `Am`, `B♭`, `C`, `Dm`, `Edim`]);
    expect(spellInKey(`A#`, `F`, `major`)).toBe(`B♭`);
    expect(seventhChords(`F`, `major`)[3].label).toBe(`B♭maj7`);
  });

  it(`keeps sharps in sharp keys`, () => {
    expect(diatonicChords(`E`, `major`).map((c) => c.label)).toEqual([`E`, `F♯m`, `G♯m`, `A`, `B`, `C♯m`, `D♯dim`]);
  });

  it(`names keys conventionally`, () => {
    expect(keyLabel(10, `major`)).toBe(`B♭`);
    expect(keyLabel(1, `major`)).toBe(`D♭`);
    expect(keyLabel(1, `natural-minor`)).toBe(`C♯`);
    expect(keyName(4 + 9, true).toLowerCase()).toBe(`c♯`); // relative minor of E
  });
});

describe(`chord charts keep the written accidental for notes outside the key`, () => {
  const ctx = (songKey: number, playKey: number) => ({ songKey, playKey, scaleId: `major`, songCapo: 0, capo: 0, display: `sounding` as const });

  it(`leaves a typed Bb as B♭ in C and G`, () => {
    expect(transposeChordText(`C  Bb  F  Eb`, ctx(0, 0))).toBe(`C  B♭  F  E♭`);
    expect(transposeChordText(`G  Bb  C  D`, ctx(7, 7))).toBe(`G  B♭  C  D`);
    expect(transposeChordText(`C  A#  F`, ctx(0, 0))).toBe(`C  A♯  F`);
  });

  it(`still uses the key's spelling for its own notes`, () => {
    expect(transposeChordText(`F  A#  C`, ctx(5, 5))).toBe(`F  B♭  C`);
    expect(transposeChordText(`C  Bb  F`, ctx(0, 2))).toBe(`D  C   G`);
    expect(transposeChordText(`C  Bb/D  Ab`, ctx(0, 7))).toBe(`G  F/A   E♭`);
  });
});
