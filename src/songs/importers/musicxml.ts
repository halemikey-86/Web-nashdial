import type { NoteName } from '../../music/notes';
import { midiName } from '../../music/tunings';
import { createSection, createSong, createTabBlock, newId } from '../model';
import type { Section, Song, TabCell, TabStep } from '../types';
import { sectionTypeFor } from './textSheet';

/**
 * MusicXML (exported by MuseScore, Guitar Pro, Finale, Sibelius…) → song.
 * Reads the title, composer, key, tempo and time signature; chord symbols per bar become
 * the chord chart; rehearsal marks start sections; guitar tab (string/fret) becomes tabs,
 * otherwise the melody's notes become "single notes".
 */

const FIFTHS_TO_MAJOR = [`C`, `G`, `D`, `A`, `E`, `B`, `F#`, `C#`, `G#`, `D#`, `A#`, `F`];
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KIND_SUFFIX: Record<string, string> = {
  major: ``,
  minor: `m`,
  augmented: `+`,
  diminished: `dim`,
  dominant: `7`,
  'major-seventh': `maj7`,
  'minor-seventh': `m7`,
  'diminished-seventh': `dim7`,
  'augmented-seventh': `+7`,
  'half-diminished': `m7♭5`,
  'major-minor': `m(maj7)`,
  'major-sixth': `6`,
  'minor-sixth': `m6`,
  'dominant-ninth': `9`,
  'major-ninth': `maj9`,
  'minor-ninth': `m9`,
  'suspended-second': `sus2`,
  'suspended-fourth': `sus4`,
  power: `5`,
};

const text = (el: Element | null | undefined, sel: string) => el?.querySelector(sel)?.textContent?.trim() ?? ``;

function keyFromFifths(fifths: number, mode: string): { key: string; minor: boolean } {
  const major = FIFTHS_TO_MAJOR[((fifths % 12) + 12) % 12];
  if (mode !== `minor`) return { key: major, minor: false };
  const idx = [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`].indexOf(major);
  return { key: [`C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B`][(idx + 9) % 12], minor: true };
}

function harmonyLabel(h: Element): string {
  const step = text(h, `root > root-step`);
  if (!step) return ``;
  const alter = Number(text(h, `root > root-alter`) || 0);
  const acc = alter > 0 ? `#` : alter < 0 ? `b` : ``;
  const kindEl = h.querySelector(`kind`);
  const custom = kindEl?.getAttribute(`text`);
  const suffix = custom ?? KIND_SUFFIX[kindEl?.textContent?.trim() ?? `major`] ?? ``;
  const bassStep = text(h, `bass > bass-step`);
  const bassAlter = Number(text(h, `bass > bass-alter`) || 0);
  const bass = bassStep ? `/${bassStep}${bassAlter > 0 ? `#` : bassAlter < 0 ? `b` : ``}` : ``;
  return `${step}${acc}${suffix}${bass}`;
}

interface Bar {
  chords: string[];
  tab: TabStep[];
  notes: string[];
  rehearsal: string;
}

export function parseMusicXml(xml: string, fallbackTitle = ``): Song {
  const doc = new DOMParser().parseFromString(xml, `application/xml`);
  if (doc.querySelector(`parsererror`)) throw new Error(`That MusicXML file couldn't be read.`);
  const root = doc.documentElement;
  const song = createSong();
  song.sections = [];
  song.title = text(root, `work > work-title`) || text(root, `movement-title`) || fallbackTitle || `Imported song`;
  song.artist = root.querySelector(`identification > creator[type="composer"]`)?.textContent?.trim() || text(root, `identification > creator`);

  // Prefer a part with tab (string/fret), else the first part.
  const parts = [...root.querySelectorAll(`part`)];
  const part = parts.find((p) => p.querySelector(`technical > fret`)) ?? parts[0];
  if (!part) throw new Error(`That MusicXML file has no music in it.`);

  const firstKey = root.querySelector(`attributes > key`);
  if (firstKey) {
    const { key, minor } = keyFromFifths(Number(text(firstKey, `fifths`) || 0), text(firstKey, `mode`));
    song.key = key as NoteName;
    if (minor) song.scaleId = `natural-minor`;
  }
  const beats = text(root, `attributes > time > beats`);
  const beatType = text(root, `attributes > time > beat-type`);
  if (beats && beatType) song.timeSignature = `${beats}/${beatType}`;
  const tempo = root.querySelector(`sound[tempo]`)?.getAttribute(`tempo`) ?? text(root, `metronome > per-minute`);
  if (tempo && Number(tempo)) song.bpm = Math.round(Number(tempo));
  const stringCount = Math.min(8, Math.max(4, Number(text(root, `staff-details > staff-lines`)) || 6));

  const bars: Bar[] = [];
  for (const measure of part.querySelectorAll(`measure`)) {
    const bar: Bar = { chords: [], tab: [], notes: [], rehearsal: `` };
    bar.rehearsal = text(measure, `direction rehearsal`) || text(measure, `direction words`).match(/^(intro|verse|pre-?chorus|chorus|bridge|outro|interlude|solo|refrain)[\w\s]*$/i)?.[0] || ``;
    for (const h of measure.querySelectorAll(`harmony`)) {
      const label = harmonyLabel(h);
      if (label) bar.chords.push(label);
    }
    let column: (TabCell | null)[] | null = null;
    for (const note of measure.querySelectorAll(`note`)) {
      if (note.querySelector(`rest`)) continue;
      const isChordTone = !!note.querySelector(`chord`);
      const fret = text(note, `technical > fret`);
      const str = text(note, `technical > string`);
      if (fret && str) {
        if (!isChordTone || !column) {
          column = Array.from({ length: stringCount }, () => null);
          bar.tab.push(column);
        }
        const row = Number(str) - 1; // MusicXML string 1 = highest
        if (row >= 0 && row < stringCount) {
          const t = note.querySelector(`technical > hammer-on[type="start"]`) ? `h` : note.querySelector(`technical > pull-off[type="start"]`) ? `p` : note.querySelector(`notations slide[type="start"], notations glissando[type="start"]`) ? `/` : note.querySelector(`technical > bend`) ? `b` : undefined;
          column[row] = t ? { f: Number(fret), t } : { f: Number(fret) };
        }
      } else if (!isChordTone) {
        const step = text(note, `pitch > step`);
        if (step) {
          const midi = (Number(text(note, `pitch > octave`)) + 1) * 12 + STEP_PC[step] + Number(text(note, `pitch > alter`) || 0);
          bar.notes.push(midiName(midi));
        }
      }
    }
    bars.push(bar);
  }

  // Group bars into sections at rehearsal marks (or every 8 bars without any).
  const hasMarks = bars.some((b) => b.rehearsal);
  const groups: { label: string; bars: Bar[] }[] = [];
  bars.forEach((bar, i) => {
    if (!groups.length || (hasMarks ? !!bar.rehearsal : i % 8 === 0)) groups.push({ label: bar.rehearsal || (hasMarks ? `Intro` : `Part ${groups.length + 1}`), bars: [] });
    groups[groups.length - 1].bars.push(bar);
  });

  const seen = new Map<string, number>();
  song.sections = groups.map((g): Section => {
    const n = (seen.get(g.label) ?? 0) + 1;
    seen.set(g.label, n);
    const label = n > 1 ? `${g.label} ${n}` : g.label;
    const type = hasMarks ? sectionTypeFor(g.label) : `custom`;
    const s = createSection(type, label.replace(/\b\w/g, (c) => c.toUpperCase()));
    const chordBars = g.bars.map((b) => (b.chords.length ? b.chords.join(` `) : `%`));
    if (g.bars.some((b) => b.chords.length)) {
      const lines: string[] = [];
      for (let i = 0; i < chordBars.length; i += 4) lines.push(`| ${chordBars.slice(i, i + 4).join(` | `)} |`);
      s.chords = lines.join(`\n`);
    }
    const tabSteps: TabStep[] = [];
    g.bars.forEach((b, i) => {
      if (i > 0 && b.tab.length) tabSteps.push(`|`);
      tabSteps.push(...b.tab);
    });
    if (tabSteps.some((t) => t !== `|`)) s.tabs = [{ ...createTabBlock(stringCount), id: newId(), label: ``, steps: tabSteps }];
    else {
      const melody = g.bars.map((b) => b.notes.join(` `)).filter(Boolean);
      if (melody.length) s.singleNotes = melody.join(` | `);
    }
    s.bars = g.bars.length;
    return s;
  });
  if (stringCount === 4) song.tuningId = `bass-standard`;
  else if (stringCount === 7) song.tuningId = `7-standard`;
  else if (stringCount === 8) song.tuningId = `8-standard`;
  return song;
}
