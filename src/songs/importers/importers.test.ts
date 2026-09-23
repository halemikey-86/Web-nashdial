import { describe, expect, it } from 'vitest';
import { songFile } from '../io';
import { createSong } from '../model';
import { decodeShare, encodeShare, extractShareCode } from '../share';
import { transposeChordText } from '../songTranspose';
import { chordProToText, isChordLine, parseChordSheet, parseTabBlock } from './textSheet';

const SHEET = `Amazing Grace - Traditional
Key: G
Capo: 2
Tempo: 72

[Intro]
| G . . | G7 . . | C . . | G . . |

[Verse 1]
G           G7        C       G
Amazing grace, how sweet the sound
G                 Em     D
That saved a wretch like me

Chorus:
C    G    Em   D
A lyric line here

[Solo]
e|-----------3-|
B|---1h3---0---|
G|-0-------0---|
D|-------------|
A|-------------|
E|-------------|
`;

describe(`chord sheet import`, () => {
  const song = parseChordSheet(SHEET);

  it(`reads title, artist, key, capo and tempo`, () => {
    expect(song.title).toBe(`Amazing Grace`);
    expect(song.artist).toBe(`Traditional`);
    expect(song.key).toBe(`G`);
    expect(song.capo).toBe(2);
    expect(song.bpm).toBe(72);
  });

  it(`splits sections and types them`, () => {
    expect(song.sections.map((s) => [s.type, s.label])).toEqual([
      [`intro`, `Intro`],
      [`verse`, `Verse 1`],
      [`chorus`, `Chorus`],
      [`custom`, `Solo`],
    ]);
  });

  it(`keeps lyrics under their chords in the chart, and transposes only the chords`, () => {
    const verse = song.sections[1];
    const lines = verse.chords.split(`\n`);
    expect(lines[0]).toMatch(/^G\s+G7\s+C\s+G$/);
    expect(lines[1]).toBe(`Amazing grace, how sweet the sound`);
    const up = transposeChordText(verse.chords, { songKey: 7, playKey: 9, scaleId: `major`, songCapo: 0, capo: 0, display: `sounding` }).split(`\n`);
    expect(up[0]).toMatch(/^A\s+A7\s+D\s+A$/);
    expect(up[1]).toBe(`Amazing grace, how sweet the sound`);
  });

  it(`turns ASCII tab into editable tab steps`, () => {
    const tab = song.sections[3].tabs[0];
    expect(tab).toBeTruthy();
    const cells = tab.steps.filter((s) => s !== `|`).flatMap((s) => (s as unknown[]).filter(Boolean));
    expect(cells).toContainEqual({ f: 1, t: `h` });
    expect(cells).toContainEqual({ f: 3 });
  });

  it(`tells chord lines from lyric lines`, () => {
    expect(isChordLine(`G   D/F#   Em7   Cadd9`)).toBe(true);
    expect(isChordLine(`| G . . . | C . . . | x2`)).toBe(true);
    expect(isChordLine(`A beautiful day`)).toBe(false);
    expect(isChordLine(`Am I the one`)).toBe(false);
  });

  it(`guesses the key from the first chord when none is given`, () => {
    const s = parseChordSheet(`My Song\n\nVerse\nAm  F  C  G\nwords`);
    expect(s.key).toBe(`A`);
    expect(s.scaleId).toBe(`natural-minor`);
  });
});

describe(`ChordPro import`, () => {
  const src = `{title: Be Thou My Vision}
{artist: Irish Trad.}
{key: D}
{start_of_verse: Verse 1}
[D]Be thou my [G]vision, O [D]Lord of my heart
{end_of_verse}
{soc}
[G]Naught be all [D]else to me
{eoc}`;

  it(`puts inline chords above the lyric`, () => {
    const text = chordProToText(src);
    expect(text).toContain(`Title: Be Thou My Vision`);
    expect(text).toMatch(/D\s+G\s+D/);
  });

  it(`builds sections from ChordPro blocks`, () => {
    const song = parseChordSheet(src);
    expect(song.title).toBe(`Be Thou My Vision`);
    expect(song.artist).toBe(`Irish Trad.`);
    expect(song.key).toBe(`D`);
    expect(song.sections.map((s) => s.type)).toEqual([`verse`, `chorus`]);
    expect(song.sections[1].chords).toMatch(/G\s+D/);
  });
});

describe(`tab block parsing`, () => {
  it(`reads multi-digit frets and bar lines`, () => {
    const steps = parseTabBlock([`e|--12--|--0--|`, `B|------|-----|`, `G|------|-----|`, `D|------|-----|`, `A|------|-----|`, `E|--10--|-----|`], 6);
    expect(steps[0]).toEqual([{ f: 12 }, null, null, null, null, { f: 10 }]);
    expect(steps).toContain(`|`);
  });
});

describe(`share links`, () => {
  it(`round-trips a song through a compressed link code`, async () => {
    const song = { ...createSong(), title: `Shared Song` };
    const code = await encodeShare(songFile(song));
    expect(code[0]).toBe(`z`);
    const json = JSON.parse(await decodeShare(code));
    expect(json.song.title).toBe(`Shared Song`);
    expect(extractShareCode(`Check this out https://nashdial.example/#/share/${code}`)).toBe(code);
  });
});
