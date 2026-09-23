import { describe, expect, it } from 'vitest';
import { boxNotes, buildSoloPattern, soloPositions, soloScaleOptions, soloToTab } from './solo';
import { DEFAULT_TUNING } from './tunings';

describe(`solo ideas`, () => {
  it(`offers scales that fit the key`, () => {
    expect(soloScaleOptions(`G`, `major`).map((s) => s.label)).toEqual([`G major pentatonic`, `E minor pentatonic (same notes)`, `G major`, `G blues`]);
    expect(soloScaleOptions(`A`, `natural-minor`)[0].label).toBe(`A minor pentatonic`);
  });

  it(`builds a pentatonic box that climbs in pitch and stays in the box`, () => {
    const notes = boxNotes(DEFAULT_TUNING, `A`, `minor-pentatonic`, 5);
    expect(notes).toHaveLength(12); // the classic 2-notes-per-string box
    expect(notes.every((n) => n.f >= 5 && n.f <= 9)).toBe(true);
    for (let i = 1; i < notes.length; i++) expect(notes[i].midi).toBeGreaterThan(notes[i - 1].midi);
    expect(notes[0]).toMatchObject({ s: 0, f: 5 }); // A on the low E string
  });

  it(`makes the patterns`, () => {
    const notes = boxNotes(DEFAULT_TUNING, `A`, `minor-pentatonic`, 5);
    expect(buildSoloPattern(notes, `threes`, `up`)).toHaveLength((notes.length - 2) * 3);
    expect(buildSoloPattern(notes, `fours`, `down`)[0]).toEqual(notes[notes.length - 1]);
    const both = buildSoloPattern(notes, `run`, `both`);
    expect(both).toHaveLength(notes.length * 2 - 1);
    const perm = buildSoloPattern(notes, `perm1324`, `up`).slice(0, 4);
    expect(perm).toEqual([notes[0], notes[2], notes[1], notes[3]]);
  });

  it(`writes tab relative to the capo with bar lines`, () => {
    const notes = boxNotes(DEFAULT_TUNING, `G`, `major-pentatonic`, 2).slice(0, 5);
    const steps = soloToTab(notes, 6, 2, 4);
    expect(steps).toContain(`|`);
    const first = steps[0] as ({ f: number } | null)[];
    expect(first[5]).toEqual({ f: notes[0].f - 2 }); // low string is the last tab row
  });

  it(`lists positions above the capo`, () => {
    const pos = soloPositions(DEFAULT_TUNING, `A`, `minor-pentatonic`, 2);
    expect(pos.length).toBeGreaterThan(3);
    expect(pos.every((p) => p.fret >= 2)).toBe(true);
    expect(pos.some((p) => p.label.includes(`root position`))).toBe(true);
  });
});
