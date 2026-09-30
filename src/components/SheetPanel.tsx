import { useMemo, useRef, useState, useEffect } from 'react';
import { pluck, unlockAudio } from '../audio';
import {
  keySignature,
  keySignatureLetters,
  notateQuarters,
  parentMajor,
  spellMidi,
  spelledName,
  staffLayout,
  staffMnemonic,
  type NotatedEvent,
} from '../music/notation';
import { KEYS, keyLabel, mod12, noteIndex } from '../music/notes';
import { getScale, scaleNotes } from '../music/scales';
import { instrumentLabel, openStringMidi, type Tuning } from '../music/tunings';
import { loadPref, savePref } from '../songs/storage';
import { Staff } from './Staff';

type Range = 'octave' | 'neck';
const LETTERS = [`C`, `D`, `E`, `F`, `G`, `A`, `B`];

/** Every note of the scale from the lowest open string (or capo) up to the 12th fret of the top string. */
function neckScale(tuning: Tuning, root: string, scaleId: string, capo: number): number[] {
  const open = openStringMidi(tuning);
  const pcs = new Set(scaleNotes(root, scaleId).map((n) => noteIndex(n)));
  const out: number[] = [];
  for (let m = open[0] + capo; m <= open[open.length - 1] + 12; m++) if (pcs.has(mod12(m))) out.push(m);
  return out;
}

function octaveScale(all: number[], root: string): number[] {
  const start = all.findIndex((m) => mod12(m) === noteIndex(root));
  if (start < 0) return all.slice(0, 8);
  const top = all[start] + 12;
  return all.filter((m, i) => i >= start && m <= top);
}

function signatureText(fifths: number): string {
  if (fifths === 0) return `no sharps or flats`;
  const names = keySignatureLetters(fifths).map(({ letter, alter }) => `${LETTERS[letter]}${alter > 0 ? `♯` : `♭`}`);
  const count = Math.abs(fifths);
  return `${count} ${fifths > 0 ? `sharp` : `flat`}${count > 1 ? `s` : ``} (${names.join(`, `)})`;
}

/**
 * Reading practice on the main page: the key's scale in standard notation for the chosen
 * instrument, what the key signature means, and a quick "name that note" quiz.
 */
export function SheetPanel({ tuning, keyIndex, scaleId, capo }: { tuning: Tuning; keyIndex: number; scaleId: string; capo: number }) {
  const root = KEYS[keyIndex].root;
  const scale = getScale(scaleId);
  const layout = staffLayout(tuning.instrument);
  const fifths = keySignature(keyIndex, scaleId);
  const [range, setRangeState] = useState<Range>(() => (loadPref<string>(`sheet-range`, `octave`) === `neck` ? `neck` : `octave`));
  const [names, setNamesState] = useState(() => loadPref<string>(`sheet-names`, `on`) === `on`);
  const setRange = (r: Range) => {
    setRangeState(r);
    savePref(`sheet-range`, r);
  };
  const setNames = (on: boolean) => {
    setNamesState(on);
    savePref(`sheet-names`, on ? `on` : `off`);
  };

  const all = useMemo(() => neckScale(tuning, root, scaleId, capo), [tuning, root, scaleId, capo]);
  const midis = range === `neck` ? all : octaveScale(all, root);
  const bars = useMemo(() => notateQuarters(midis), [midis]);

  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setNow(null);
    setPlaying(false);
  };
  useEffect(() => stop, []);
  useEffect(stop, [midis.length, root, scaleId, tuning.id]);

  const play = () => {
    if (playing) return stop();
    unlockAudio();
    const beat = 60000 / 100;
    const run = [...midis, ...[...midis].reverse().slice(1)];
    run.forEach((m, i) => {
      const slot = i < midis.length ? i : midis.length - 1 - (i - midis.length + 1);
      timers.current.push(
        window.setTimeout(() => {
          setNow(slot);
          pluck(m, 0, 0.2);
        }, i * beat),
      );
    });
    timers.current.push(window.setTimeout(stop, run.length * beat + 200));
    setPlaying(true);
  };

  const tap = (midi: number, slot: number) => {
    unlockAudio();
    pluck(midi, 0, 0.2);
    setNow(slot);
  };

  const clefs = layout === `grand` ? ([`treble`, `bass`] as const) : ([layout] as const);
  const name = `${keyLabel(keyIndex, scaleId)} ${scale.name.toLowerCase()}`;

  return (
    <div className="sheet-panel">
      <div className="solo-panel__bar">
        <div className="segmented" role="group" aria-label="Range">
          {([`octave`, `neck`] as const).map((r) => (
            <button key={r} type="button" className={`segmented__btn${range === r ? ` segmented__btn--active` : ``}`} onClick={() => setRange(r)}>
              {r === `octave` ? `One octave` : `Whole neck`}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--small" onClick={play}>
          {playing ? `■ Stop` : `▶ Hear it`}
        </button>
        <label className="solo-panel__toggle">
          <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />
          Note names
        </label>
      </div>

      <p className="sheet-panel__key">
        <strong>{name}</strong> — key signature: {signatureText(fifths)}
        {parentMajor(keyIndex, scaleId) !== keyIndex && scaleId !== `natural-minor` && `, the same as ${keyLabel(parentMajor(keyIndex, scaleId), `major`)} major`}
        {scaleId === `natural-minor` && `, the same as its relative major, ${keyLabel(parentMajor(keyIndex, scaleId), `major`)}`}.
      </p>

      <Staff bars={bars} layout={layout} fifths={fifths} tonic={noteIndex(root)} names={names} highlight={now} onNote={tap} />

      <ul className="sheet-panel__hints">
        {clefs.map((c) => {
          const m = staffMnemonic(c);
          return (
            <li key={c}>
              {c === `treble` ? `Treble clef` : `Bass clef`}: lines {m.lines} · spaces {m.spaces}
            </li>
          );
        })}
        <li>
          {instrumentLabel(tuning.instrument)} music is written an octave higher than it sounds — that's the little 8 under the clef.
          {layout === `grand` && ` The 8-string's low notes go on the bass staff; middle C and up on the treble staff.`}
        </li>
        <li>Sharps or flats in the key signature apply to every note on that letter unless a ♮ cancels them for the rest of the bar.</li>
        <li>Tap a note to hear it.</li>
      </ul>

      <NoteQuiz pool={all} layout={layout} fifths={fifths} tonic={noteIndex(root)} />
    </div>
  );
}

/** One note on the staff; pick its name. */
function NoteQuiz({ pool, layout, fifths, tonic }: { pool: number[]; layout: ReturnType<typeof staffLayout>; fifths: number; tonic: number }) {
  const [open, setOpen] = useState(false);
  const pickNote = (not?: number) => {
    const choices = pool.filter((m) => m !== not);
    return choices[Math.floor(Math.random() * choices.length)] ?? pool[0];
  };
  const [midi, setMidi] = useState(() => pickNote());
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, tries: 0 });

  // A new key or instrument asks from its own notes.
  useEffect(() => {
    setMidi(pickNote());
    setAnswer(null);
  }, [pool]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pool.length) return null;
  const correct = spelledName(spellMidi(midi, fifths, tonic));
  const options = [...new Set(pool.map((m) => spelledName(spellMidi(m, fifths, tonic))))].sort(
    (a, b) => LETTERS.indexOf(a[0]) - LETTERS.indexOf(b[0]),
  );
  const bars: NotatedEvent[][] = [[{ start: 0, dur: 8, slot: 0, midi }]];

  const guess = (n: string) => {
    if (answer) return;
    unlockAudio();
    pluck(midi, 0, 0.2);
    setAnswer(n);
    setScore((s) => ({ right: s.right + (n === correct ? 1 : 0), tries: s.tries + 1 }));
  };
  const next = () => {
    setMidi(pickNote(midi));
    setAnswer(null);
  };

  return (
    <div className="note-quiz">
      <button type="button" className="btn btn--small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? `Hide quiz` : `Quiz me: name that note`}
      </button>
      {open && (
        <>
          <Staff bars={bars} layout={layout} fifths={fifths} tonic={tonic} />
          <div className="note-quiz__options">
            {options.map((n) => (
              <button
                key={n}
                type="button"
                className={`btn btn--small${answer && n === correct ? ` btn--primary` : ``}${answer === n && n !== correct ? ` note-quiz__wrong` : ``}`}
                onClick={() => guess(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="note-quiz__status">
            {answer ? (answer === correct ? `Yes — it's ${correct}.` : `Not quite — it's ${correct}.`) : `Which note is this?`}{' '}
            {score.tries > 0 && `${score.right} / ${score.tries}`}
            {answer && (
              <button type="button" className="btn btn--small note-quiz__next" onClick={next}>
                Next note →
              </button>
            )}
          </p>
        </>
      )}
    </div>
  );
}
