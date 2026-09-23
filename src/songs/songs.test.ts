import { describe, expect, it } from 'vitest';
import { parseImport, setlistFile, songFile } from './io';
import { createSetlist, createSetlistItem, createSong, normalizeSong } from './model';
import { transposeChord, transposeChordLine, transposeNoteText, transposeTabBlock, type TransposeContext } from './songTranspose';
import type { TabBlock } from './types';

const ctx = (over: Partial<TransposeContext> = {}): TransposeContext => ({
  songKey: 7, // G
  playKey: 9, // A
  scaleId: `major`,
  songCapo: 0,
  capo: 0,
  display: `sounding`,
  ...over,
});

describe(`chord transposition`, () => {
  it(`moves roots, suffixes and slash basses`, () => {
    expect(transposeChord(`G`, ctx())).toBe(`A`);
    expect(transposeChord(`Em7`, ctx())).toBe(`F♯m7`);
    expect(transposeChord(`D/F#`, ctx())).toBe(`E/G♯`);
    expect(transposeChord(`Cadd9`, ctx())).toBe(`Dadd9`);
    expect(transposeChord(`(Bbmaj7)`, ctx())).toBe(`(Cmaj7)`);
  });

  it(`uses flats in flat keys`, () => {
    expect(transposeChord(`G`, ctx({ playKey: 10 }))).toBe(`B♭`);
    expect(transposeChord(`D`, ctx({ playKey: 5 }))).toBe(`C`);
    expect(transposeChord(`B`, ctx({ playKey: 3 }))).toBe(`G`);
    expect(transposeChord(`C`, ctx({ playKey: 3 }))).toBe(`A♭`);
  });

  it(`leaves words and bar lines alone`, () => {
    expect(transposeChord(`Bridge`, ctx())).toBeNull();
    expect(transposeChord(`x2`, ctx())).toBeNull();
    expect(transposeChordLine(`| G . . . | C . . . | x2`, ctx())).toBe(`| A . . . | D . . . | x2`);
  });

  it(`keeps later chords aligned when a chord gets longer`, () => {
    expect(transposeChordLine(`G    C    D`, ctx({ playKey: 8 }))).toBe(`A♭   D♭   E♭`);
  });

  it(`shows capo shapes and Nashville numbers`, () => {
    // Playing in A with capo 2 → G shapes.
    expect(transposeChord(`G`, ctx({ capo: 2, display: `shapes` }))).toBe(`G`);
    expect(transposeChord(`D/F#`, ctx({ capo: 2, display: `shapes` }))).toBe(`D/F♯`);
    expect(transposeChord(`Em7`, ctx({ display: `numbers` }))).toBe(`6m7`);
    expect(transposeChord(`D/F#`, ctx({ display: `numbers` }))).toBe(`5/7`);
    expect(transposeChord(`F`, ctx({ display: `numbers` }))).toBe(`♭7`);
  });
});

describe(`single notes`, () => {
  it(`transposes with octave carry`, () => {
    expect(transposeNoteText(`B3 D4 G4`, ctx())).toBe(`C♯4 E4 A4`);
    expect(transposeNoteText(`G4 | A`, ctx({ playKey: 2 }))).toBe(`D4 | E`);
    expect(transposeNoteText(`Cb4`, ctx({ playKey: 7 }))).toBe(`B3`);
  });
});

describe(`tab transposition`, () => {
  const block: TabBlock = {
    id: `t`,
    label: ``,
    steps: [[null, { f: 3 }, null, null, null, null], [null, { f: 5, t: `h` }, null, null, null, null], `|`, [{ f: 0 }, null, null, null, null, { f: `x` }]],
  };

  it(`shifts frets by the key change`, () => {
    const out = transposeTabBlock(block, ctx());
    expect(out.steps[0]).toEqual([null, { f: 5 }, null, null, null, null]);
    expect(out.steps[1]).toEqual([null, { f: 7, t: `h` }, null, null, null, null]);
    expect(out.steps[2]).toBe(`|`);
    expect(out.steps[3]).toEqual([{ f: 2 }, null, null, null, null, { f: `x` }]);
  });

  it(`moves the whole phrase up an octave rather than below the nut`, () => {
    const out = transposeTabBlock(block, ctx({ playKey: 5 })); // down 2
    expect(out.steps[3]).toEqual([{ f: 10 }, null, null, null, null, { f: `x` }]);
    expect(out.steps[0]).toEqual([null, { f: 13 }, null, null, null, null]);
  });

  it(`accounts for a capo`, () => {
    const out = transposeTabBlock(block, ctx({ capo: 2 })); // up 2, capo 2 → same frets
    expect(out.steps[0]).toEqual([null, { f: 3 }, null, null, null, null]);
  });
});

describe(`import / export`, () => {
  it(`round-trips a song file`, () => {
    const song = { ...createSong(), title: `Amazing Grace`, artist: `Trad.` };
    const parsed = parseImport(JSON.stringify(songFile(song)));
    expect(parsed.kind).toBe(`song`);
    expect(parsed.songs[0]).toEqual(song);
  });

  it(`round-trips a setlist file with its songs in set order`, () => {
    const a = { ...createSong(), title: `A` };
    const b = { ...createSong(), title: `B` };
    const list = { ...createSetlist(`Sunday`), items: [createSetlistItem(b.id), { ...createSetlistItem(a.id), key: `D` as const }] };
    const parsed = parseImport(JSON.stringify(setlistFile(list, [a, b])));
    expect(parsed.kind).toBe(`setlist`);
    expect(parsed.setlists[0]).toEqual(list);
    expect(parsed.songs.map((s) => s.title).sort()).toEqual([`A`, `B`]);
  });

  it(`accepts a hand-written song`, () => {
    const song = normalizeSong({
      title: `Hand Made`,
      artist: `Me`,
      key: `Bb`,
      sections: [{ type: `Pre Chorus`, chords: [`Bb F`, `Gm Eb`], tabs: [{ label: `Riff`, steps: [[null, `3h`, null, null, null, null], `|`] }] }],
    });
    expect(song?.key).toBe(`A#`);
    expect(song?.sections[0].type).toBe(`prechorus`);
    expect(song?.sections[0].chords).toBe(`Bb F\nGm Eb`);
    expect(song?.sections[0].tabs[0].steps[0]).toEqual([null, { f: 3, t: `h` }, null, null, null, null]);
  });

  it(`rejects non-song files`, () => {
    expect(() => parseImport(`not json`)).toThrow();
    expect(() => parseImport(`{"hello": 1}`)).toThrow();
  });
});
