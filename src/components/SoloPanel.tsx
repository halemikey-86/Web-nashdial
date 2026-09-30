import { useEffect, useMemo, useRef, useState } from 'react';
import { pluck, unlockAudio } from '../audio';
import type { RandomSolo } from '../music/solo';
import { nextSolo } from '../music/soloHistory';
import { keySignature, notateEighths, staffLayout } from '../music/notation';
import { noteIndex } from '../music/notes';
import { openStringMidi, type Tuning } from '../music/tunings';
import { loadPref, savePref } from '../songs/storage';
import { TabDisplay } from '../songs/TabDisplay';
import { stringLabels } from '../songs/tabStrings';
import type { Technique } from '../songs/types';
import { Staff } from './Staff';

type SoloView = 'tab' | 'notes' | 'both';
const MARKS: Record<Technique, string> = { h: `H`, p: `P`, '/': `sl.`, '\\': `sl.`, b: `BU`, r: `R`, '~': `~`, t: `T` };

/**
 * A random solo in the dial's key, scale, tuning and capo. "New solo" (or tapping the Solo tab
 * with the randomizer on — `taps` counts those) rolls another one it has never shown before.
 */
export function SoloPanel({ tuning, root, scaleId, capo, taps }: { tuning: Tuning; root: string; scaleId: string; capo: number; taps: number }) {
  const [randomizer, setRandomizerState] = useState(() => loadPref<string>(`solo-randomizer`, `on`) === `on`);
  const setRandomizer = (on: boolean) => {
    setRandomizerState(on);
    savePref(`solo-randomizer`, on ? `on` : `off`);
  };
  const roll = () => nextSolo(tuning, root, scaleId, capo);
  const [solo, setSolo] = useState<RandomSolo>(roll);
  const [bpm, setBpm] = useState(() => loadPref<number>(`solo-bpm`, 100));
  const [now, setNow] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const [view, setViewState] = useState<SoloView>(() => {
    const v = loadPref<string>(`solo-view`, `both`);
    return v === `tab` || v === `notes` ? v : `both`;
  });
  const setView = (v: SoloView) => {
    setViewState(v);
    savePref(`solo-view`, v);
  };

  // The written (fretted) pitch of each tab column, and the technique marks to print above the staff.
  const notation = useMemo(() => {
    const open = openStringMidi(tuning);
    const width = tuning.strings.length;
    const slots: (number | null)[] = [];
    const marks: Record<number, string> = {};
    for (const step of solo.block.steps) {
      if (step === `|`) continue;
      const row = step.findIndex(Boolean);
      const cell = step[row];
      if (cell && typeof cell.f === `number`) {
        slots.push(open[width - 1 - row] + cell.f + capo);
        if (cell.t) marks[slots.length - 1] = MARKS[cell.t];
      } else slots.push(null);
    }
    return { bars: notateEighths(slots), marks };
  }, [solo, tuning, capo]);
  const keyIndex = noteIndex(root);

  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setNow(null);
  };
  useEffect(() => stop, []);

  const next = () => {
    stop();
    setSolo(roll());
  };

  // A new key, scale, tuning or capo needs a solo that fits it.
  const context = `${tuning.id}|${root}|${scaleId}|${capo}`;
  const lastContext = useRef(context);
  useEffect(() => {
    if (lastContext.current === context) return;
    lastContext.current = context;
    next();
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each tap on the Solo tab rolls a new one while the randomizer is on.
  const lastTaps = useRef(taps);
  useEffect(() => {
    if (lastTaps.current === taps) return;
    lastTaps.current = taps;
    if (randomizer) next();
  }, [taps]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    if (now !== null) return stop();
    unlockAudio();
    const eighth = 30000 / bpm;
    solo.pitches.forEach((midi, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setNow(i);
          if (midi !== null) pluck(midi, 0, 0.18);
        }, i * eighth),
      );
    });
    timers.current.push(window.setTimeout(() => setNow(null), solo.pitches.length * eighth + 300));
    setNow(0);
  };

  const pickBpm = (v: number) => {
    setBpm(v);
    savePref(`solo-bpm`, v);
  };

  return (
    <div className="solo-panel">
      <div className="solo-panel__bar">
        <button type="button" className="btn btn--small btn--primary" onClick={next}>
          🎲 New solo
        </button>
        <button type="button" className="btn btn--small" onClick={play}>
          {now !== null ? `■ Stop` : `▶ Hear it`}
        </button>
        <label className="solo-panel__bpm">
          <input type="range" min={50} max={180} step={5} value={bpm} onChange={(e) => pickBpm(Number(e.target.value))} aria-label="Tempo" />
          {bpm} bpm
        </label>
        <div className="segmented" role="group" aria-label="Show as">
          {([`tab`, `notes`, `both`] as const).map((v) => (
            <button key={v} type="button" className={`segmented__btn${view === v ? ` segmented__btn--active` : ``}`} onClick={() => setView(v)}>
              {v === `tab` ? `Tab` : v === `notes` ? `Sheet music` : `Both`}
            </button>
          ))}
        </div>
        <label className="solo-panel__toggle" title="Roll a new solo every time the Solo tab is tapped">
          <input type="checkbox" checked={randomizer} onChange={(e) => setRandomizer(e.target.checked)} />
          Randomizer
        </label>
      </div>
      <p className="solo-panel__label">{solo.block.label}</p>
      <p className="solo-idea__tip">{solo.tip}</p>
      {view !== `tab` && (
        <Staff
          bars={notation.bars}
          layout={staffLayout(tuning.instrument)}
          fifths={keySignature(keyIndex, scaleId)}
          tonic={keyIndex}
          highlight={now}
          marks={notation.marks}
          onNote={(midi) => {
            unlockAudio();
            pluck(midi, 0, 0.2);
          }}
        />
      )}
      {view !== `notes` && <TabDisplay steps={solo.block.steps} stringLabels={stringLabels(tuning)} highlight={now ?? undefined} />}
      <p className="solo-panel__legend">
        {view === `notes` ? `H hammer-on · P pull-off · sl. slide · BU bend up · ~ vibrato` : `h hammer-on · p pull-off · / \\ slide · b bend · ~ vibrato`}
        {view !== `tab` && ` · sheet music shows the fretted notes, written an octave above how they sound`}
        {view !== `notes` && capo > 0 && ` · frets counted from the capo`}
      </p>
    </div>
  );
}
