import { describe, expect, it } from 'vitest';
import { keyLabel, keyName, spellInKey } from './notes';
import { diatonicChords } from './scales';
import { seventhChords } from './theory';

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
