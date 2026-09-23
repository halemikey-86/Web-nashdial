import { useEffect, useMemo, useRef, useState } from 'react';
import { pluck, unlockAudio } from '../audio';
import { SOLO_PATTERNS, boxNotes, buildSoloPattern, soloPositions, soloScaleOptions, soloToTab, type SoloDirection, type SoloPattern } from '../music/solo';
import { getTuning, openStringMidi } from '../music/tunings';
import { newId } from './model';
import { transposeTabBlock, type TransposeContext } from './songTranspose';
import { TabDisplay } from './TabDisplay';
import { stringLabels } from './tabStrings';
import type { Song, TabBlock } from './types';

export interface SoloIdea {
  block: TabBlock;
  tip: string;
}

/** Settings for a solo idea; kept by the parent so the controls and the tab can live in different places. */
export interface SoloSettings {
  scale: string;
  position: number;
  pattern: SoloPattern;
  direction: SoloDirection;
}

export function useSoloIdea(song: Song) {
  const tuning = getTuning(song.tuningId);
  const scales = useMemo(() => soloScaleOptions(song.key, song.scaleId), [song.key, song.scaleId]);
  const [settings, setSettings] = useState<SoloSettings>({ scale: scales[0].id, position: -1, pattern: `threes`, direction: `up` });
  const scale = scales.find((s) => s.id === settings.scale) ?? scales[0];
  const positions = useMemo(() => soloPositions(tuning, scale.root, scale.scaleId, song.capo), [tuning, scale, song.capo]);
  const position = positions.some((p) => p.fret === settings.position) ? settings.position : (positions[0]?.fret ?? song.capo);

  // A new song or scale starts from its first position.
  useEffect(() => {
    setSettings((s) => ({ ...s, scale: scales.some((x) => x.id === s.scale) ? s.scale : scales[0].id, position: -1 }));
  }, [song.id, scales]);

  const idea = useMemo<SoloIdea>(() => {
    const notes = buildSoloPattern(boxNotes(tuning, scale.root, scale.scaleId, position), settings.pattern, settings.direction);
    const group = SOLO_PATTERNS.find((p) => p.id === settings.pattern)?.group ?? 0;
    const perBar = group >= 3 ? group * 2 : 8;
    const patternName = SOLO_PATTERNS.find((p) => p.id === settings.pattern)?.label ?? ``;
    return {
      block: {
        id: `idea`,
        label: `${scale.label} · ${patternName.toLowerCase()} · fret ${position}`,
        steps: soloToTab(notes, tuning.strings.length, song.capo, perBar),
      },
      tip: scale.tip,
    };
  }, [tuning, scale, position, settings.pattern, settings.direction, song.capo]);

  return { settings, setSettings, scales, positions, position, idea, tuning };
}

type Idea = ReturnType<typeof useSoloIdea>;

/** The scale / position / pattern / direction pickers, plus play and save. */
export function SoloControls({ idea, song, ctx, onSave }: { idea: Idea; song: Song; ctx?: TransposeContext; onSave?: (block: TabBlock) => void }) {
  const { settings, setSettings, scales, positions, position, tuning } = idea;
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setPlaying(false);
  };
  useEffect(() => stop, []);

  const play = () => {
    if (playing) return stop();
    unlockAudio();
    const open = openStringMidi(tuning);
    const block = ctx ? transposeTabBlock(idea.idea.block, ctx) : idea.idea.block;
    const capo = ctx ? ctx.capo : song.capo;
    const eighth = 30000 / (song.bpm ?? 90);
    let i = 0;
    for (const step of block.steps) {
      if (step === `|`) continue;
      step.forEach((cell, row) => {
        if (cell && typeof cell.f === `number`) {
          const midi = open[tuning.strings.length - 1 - row] + cell.f + capo;
          timers.current.push(window.setTimeout(() => pluck(midi, 0, 0.18), i * eighth));
        }
      });
      i++;
    }
    timers.current.push(window.setTimeout(() => setPlaying(false), i * eighth + 200));
    setPlaying(true);
  };

  return (
    <div className="solo-controls">
      <select className="input input--compact" value={settings.scale} onChange={(e) => setSettings({ ...settings, scale: e.target.value, position: -1 })} aria-label="Scale">
        {scales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <select className="input input--compact" value={position} onChange={(e) => setSettings({ ...settings, position: Number(e.target.value) })} aria-label="Position">
        {positions.map((p) => (
          <option key={p.fret} value={p.fret}>
            {p.label}
          </option>
        ))}
      </select>
      <select className="input input--compact" value={settings.pattern} onChange={(e) => setSettings({ ...settings, pattern: e.target.value as SoloPattern })} aria-label="Pattern">
        {SOLO_PATTERNS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <div className="segmented" role="group" aria-label="Direction">
        {([`up`, `down`, `both`] as const).map((d) => (
          <button key={d} type="button" className={`segmented__btn${settings.direction === d ? ` segmented__btn--active` : ``}`} onClick={() => setSettings({ ...settings, direction: d })}>
            {d === `up` ? `Up` : d === `down` ? `Down` : `Up & down`}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--small" onClick={play}>
        {playing ? `■ Stop` : `▶ Hear it`}
      </button>
      {onSave && (
        <button type="button" className="btn btn--small btn--primary" onClick={() => onSave({ ...idea.idea.block, id: newId() })}>
          Save to song
        </button>
      )}
    </div>
  );
}

/** A solo idea's tab and tip, transposed for display when a context is given. */
export function SoloIdeaView({ idea, song, ctx }: { idea: Idea; song: Song; ctx?: TransposeContext }) {
  const labels = stringLabels(getTuning(song.tuningId));
  const block = ctx ? transposeTabBlock(idea.idea.block, ctx) : idea.idea.block;
  return (
    <div className="solo-idea">
      <p className="solo-idea__tip">{idea.idea.tip}</p>
      <TabDisplay steps={block.steps} stringLabels={labels} />
    </div>
  );
}

/** Everything in one box (used in the song editor). */
export function SoloBuilder({ song, onSave }: { song: Song; onSave: (block: TabBlock) => void }) {
  const idea = useSoloIdea(song);
  return (
    <div className="solo-builder">
      <SoloControls idea={idea} song={song} onSave={onSave} />
      <SoloIdeaView idea={idea} song={song} />
    </div>
  );
}
