import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { pluck, strum, usePlayback } from '../audio';
import { Neck, NeckMarker } from '../components/Neck';
import { NECK_FRETS } from '../components/neckGeometry';
import { SHAPE_COLORS } from '../music/cagedPositions';
import { CAGED, resolveShape, type CagedShape, type ResolvedShape } from '../music/chordShapes';
import { noteAt } from '../music/notes';
import { getTuning, openStringMidi, type Tuning } from '../music/tunings';
import { loadPref, savePref } from './storage';
import { parseNote, transposeChord, transposeTabBlock, type TransposeContext } from './songTranspose';
import { cellText, hasTabContent } from './TabDisplay';
import { stringLabels } from './tabStrings';
import type { Section, Song, TabColumn } from './types';

interface LiveChord {
  label: string;
  root: string;
  quality: 'major' | 'minor';
}

/** Chords in a section's chart, as displayed and as sounding (for the neck). */
function sectionChords(section: Section, ctx: TransposeContext): LiveChord[] {
  const sounding = { ...ctx, display: `sounding` as const };
  const out: LiveChord[] = [];
  for (const token of section.chords.split(/\s+/)) {
    if (!token) continue;
    const label = transposeChord(token, ctx);
    const actual = transposeChord(token, sounding);
    if (!label || !actual) continue;
    const m = /^[(\[]?([A-G])([#b♯♭]?)(.*)$/.exec(actual);
    if (!m) continue;
    const suffix = m[3];
    const minor = (/^m(?!aj)/.test(suffix) || /^(dim|°|ø)/.test(suffix));
    out.push({ label: label.replace(/^[(\[]|[)\],.*]+$/g, ``), root: noteAt(parseNote(m[1], m[2])), quality: minor ? `minor` : `major` });
  }
  return out;
}

function bestShape(chord: LiveChord, tuning: Tuning, capo: number, prefer: CagedShape | null): ResolvedShape | null {
  if (prefer) {
    const r = resolveShape(prefer, chord.root, chord.quality, tuning, capo);
    if (r) return r;
  }
  let best: ResolvedShape | null = null;
  for (const shape of CAGED) {
    const r = resolveShape(shape, chord.root, chord.quality, tuning, capo);
    if (r && (!best || r.baseFret < best.baseFret)) best = r;
  }
  return best;
}

function Transport({
  playing,
  onToggle,
  onStep,
  bpm,
  onBpm,
  perBeat,
  onPerBeat,
  loop,
  onLoop,
  sound,
  onSound,
}: {
  playing: boolean;
  onToggle: () => void;
  onStep: (d: number) => void;
  bpm: number;
  onBpm: (v: number) => void;
  perBeat?: number;
  onPerBeat?: (v: number) => void;
  loop: boolean;
  onLoop: (v: boolean) => void;
  sound: boolean;
  onSound: (v: boolean) => void;
}) {
  return (
    <div className="ex-controls live__transport">
      <button type="button" className="btn" onClick={() => onStep(-1)} aria-label="Back one step">
        ◀
      </button>
      <button type="button" className="btn btn--primary ex-controls__play" onClick={onToggle}>
        {playing ? `❚❚ Pause` : `▶ Play`}
      </button>
      <button type="button" className="btn" onClick={() => onStep(1)} aria-label="Forward one step">
        ▶
      </button>
      <label className="ex-tempo">
        <span className="field__label">Tempo {bpm} BPM</span>
        <input type="range" min={30} max={220} step={2} value={bpm} onChange={(e) => onBpm(Number(e.target.value))} />
      </label>
      {perBeat !== undefined && onPerBeat && (
        <label className="ex-check">
          Notes/beat
          <select className="input input--compact live__per-beat" value={perBeat} onChange={(e) => onPerBeat(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
      )}
      <label className="ex-check">
        <input type="checkbox" checked={loop} onChange={(e) => onLoop(e.target.checked)} />
        Loop section
      </label>
      <label className="ex-check">
        <input type="checkbox" checked={sound} onChange={(e) => onSound(e.target.checked)} />
        Sound
      </label>
    </div>
  );
}

interface PlayerSettings {
  bpm: number;
  setBpm: (v: number) => void;
  perBeat: number;
  setPerBeat: (v: number) => void;
  loop: boolean;
  setLoop: (v: boolean) => void;
  sound: boolean;
  setSound: (v: boolean) => void;
}

function TabPlayer({
  columns,
  capo,
  tuning,
  settings,
  autoStart,
  onEnd,
}: {
  columns: { col: TabColumn; barBefore: boolean }[];
  capo: number;
  tuning: Tuning;
  settings: PlayerSettings;
  autoStart: boolean;
  onEnd: () => void;
}) {
  const count = tuning.strings.length;
  const labels = stringLabels(tuning);
  const midi = openStringMidi(tuning);
  const interval = 60000 / (settings.bpm * settings.perBeat);
  const { index, playing, toggle, step, jump, setPlaying } = usePlayback(columns.length, interval, { loop: settings.loop, onEnd });
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoStart) setPlaying(true);
  }, [autoStart, setPlaying]);

  const current = columns[index]?.col ?? [];
  const next = columns[index + 1]?.col ?? [];
  // Tab frets are relative to the capo; the neck shows actual frets.
  const notes = (col: TabColumn) =>
    col.flatMap((c, i) => (c && typeof c.f === `number` ? [{ string: count - 1 - i, fret: c.f + capo, text: cellText(c) }] : []));
  const now = notes(current);
  const upcoming = notes(next);
  const all = columns.flatMap((c) => notes(c.col).map((n) => n.fret));
  const lowest = Math.min(...(all.length ? all : [capo]));
  const from = capo > 0 ? capo : Math.max(0, lowest - 1);
  const to = Math.min(NECK_FRETS, Math.max(from + 5, ...(all.length ? all.map((f) => f + 1) : [from + 5])));

  useEffect(() => {
    if (settings.sound) now.forEach((n) => pluck(midi[n.string] + n.fret, 0, 0.2));
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    const box = stripRef.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2, behavior: `smooth` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <>
      <div className="live__neck">
        <Neck stringCount={count} fromFret={from} toFret={to} capo={capo} vibrating={new Set(now.map((n) => n.string))} label="Current tab notes on the neck">
          {upcoming.map((n) => (
            <NeckMarker key={`g${n.string}-${n.fret}`} string={n.string} stringCount={count} fret={n.fret} variant="ghost" capo={capo} />
          ))}
          {now.map((n) => (
            <NeckMarker key={`p${n.string}-${n.fret}-${index}`} string={n.string} stringCount={count} fret={n.fret} label={n.text} variant={n.fret === capo && capo > 0 ? `open` : `press`} capo={capo} />
          ))}
          {current.map((c, i) =>
            c?.f === `x` ? <NeckMarker key={`x${i}`} string={count - 1 - i} stringCount={count} fret={Math.max(0, from)} variant="mute" /> : null,
          )}
        </Neck>
      </div>
      <p className="live__status">
        Step {index + 1} / {columns.length}
        {now.length > 0 && ` · ${now.map((n) => `${labels[count - 1 - n.string]} string fret ${n.fret}`).join(`, `)}`}
      </p>
      <div className="ex-tab live__strip" ref={stripRef}>
        <div className="ex-tab__labels" aria-hidden>
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        {columns.map(({ col, barBefore }, i) => (
          <button key={i} type="button" data-i={i} className={`ex-tab__col${i === index ? ` ex-tab__col--now` : ``}${barBefore ? ` ex-tab__col--bar` : ``}`} onClick={() => jump(i)}>
            {labels.map((_, r) => (
              <span key={r} className="ex-tab__cell">
                {cellText(col[r])}
              </span>
            ))}
          </button>
        ))}
      </div>
      <Transport
        playing={playing}
        onToggle={toggle}
        onStep={step}
        bpm={settings.bpm}
        onBpm={settings.setBpm}
        perBeat={settings.perBeat}
        onPerBeat={settings.setPerBeat}
        loop={settings.loop}
        onLoop={settings.setLoop}
        sound={settings.sound}
        onSound={settings.setSound}
      />
    </>
  );
}

function ChordPlayer({
  chords,
  capo,
  tuning,
  settings,
  autoStart,
  onEnd,
}: {
  chords: LiveChord[];
  capo: number;
  tuning: Tuning;
  settings: PlayerSettings;
  autoStart: boolean;
  onEnd: () => void;
}) {
  const count = tuning.strings.length;
  const midi = openStringMidi(tuning);
  const [prefer, setPrefer] = useState<CagedShape | null>(null);
  // One chord per bar of 4 beats.
  const { index, playing, toggle, step, jump, setPlaying } = usePlayback(chords.length, 240000 / settings.bpm, { loop: settings.loop, onEnd });
  const chord = chords[index];
  const shape = chord ? bestShape(chord, tuning, capo, prefer) : null;

  useEffect(() => {
    if (autoStart) setPlaying(true);
  }, [autoStart, setPlaying]);

  useEffect(() => {
    if (settings.sound && shape) strum(shape.fingers.map((f) => midi[f.stringIndex] + (f.fret ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, prefer]);

  if (count !== 6) return <p className="list-empty card">Chord shapes on the neck are for 6-string guitar tunings.</p>;
  const base = shape?.baseFret ?? 0;
  const from = capo > 0 ? capo : Math.max(0, base - 1);
  const to = Math.min(NECK_FRETS, Math.max(from + 5, base + 4));

  return (
    <>
      <div className="live__chord-head">
        <span className="live__chord-name">{chord?.label ?? `—`}</span>
        {shape && (
          <span className="live__chord-shape" style={{ background: SHAPE_COLORS[shape.shape].fill, color: SHAPE_COLORS[shape.shape].text }}>
            {shape.shape} shape{base > 0 ? ` · fret ${base}` : ``}
          </span>
        )}
      </div>
      <div className="live__neck">
        <Neck stringCount={count} fromFret={from} toFret={to} capo={capo} vibrating={new Set(shape?.fingers.map((f) => f.stringIndex))} label="Chord shape on the neck">
          {shape?.strings.map((s) =>
            s.fret === null ? (
              <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={count} fret={from} variant="mute" />
            ) : s.fret === 0 || s.fret === capo ? (
              <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={count} fret={s.fret} variant="open" root={s.isRoot} capo={capo} />
            ) : (
              <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={count} fret={s.fret} label={String(s.fret)} variant="press" root={s.isRoot} />
            ),
          )}
        </Neck>
      </div>
      <div className="shape-chips live__shapes" role="group" aria-label="Chord shape">
        {CAGED.map((sh) => {
          const ok = chord ? !!resolveShape(sh, chord.root, chord.quality, tuning, capo) : false;
          return (
            <button
              key={sh}
              type="button"
              className={`shape-chip${shape?.shape === sh ? ` shape-chip--on` : ``}`}
              style={{ '--chip': SHAPE_COLORS[sh].fill, '--chip-text': SHAPE_COLORS[sh].text } as CSSProperties}
              disabled={!ok}
              onClick={() => setPrefer(sh)}
            >
              <span className="shape-chip__block" aria-hidden />
              {sh}
            </button>
          );
        })}
        <button type="button" className="shape-chip shape-chip--all" disabled={prefer === null} onClick={() => setPrefer(null)}>
          Lowest
        </button>
      </div>
      <div className="live__chords" role="list">
        {chords.map((c, i) => (
          <button key={i} type="button" role="listitem" className={`chip-btn live__chord${i === index ? ` live__chord--now` : ``}`} onClick={() => jump(i)}>
            {c.label}
          </button>
        ))}
      </div>
      <Transport
        playing={playing}
        onToggle={toggle}
        onStep={step}
        bpm={settings.bpm}
        onBpm={settings.setBpm}
        loop={settings.loop}
        onLoop={settings.setLoop}
        sound={settings.sound}
        onSound={settings.setSound}
      />
    </>
  );
}

type LiveMode = 'tab' | 'chords';

/** Song on the guitar neck: tabs step through note by note, chords show their shape. */
export function LiveView({ song, ctx }: { song: Song; ctx: TransposeContext }) {
  const tuning = getTuning(song.tuningId);
  const sections = useMemo(
    () => song.sections.filter((s) => s.chords.trim() || s.tabs.some((t) => hasTabContent(t.steps))),
    [song.sections],
  );
  const [sectionIdx, setSectionIdx] = useState(0);
  const [tabIdx, setTabIdx] = useState(0);
  const [mode, setMode] = useState<LiveMode>(`tab`);
  const [autoStart, setAutoStart] = useState(false);
  const [bpm, setBpmState] = useState(() => song.bpm ?? loadPref<number>(`live-bpm`, 80));
  const [perBeat, setPerBeatState] = useState(() => loadPref<number>(`live-per-beat`, 2));
  const [loop, setLoop] = useState(false);
  const [sound, setSoundState] = useState(() => loadPref<string>(`live-sound`, `on`) === `on`);

  const settings: PlayerSettings = {
    bpm,
    setBpm: (v) => {
      setBpmState(v);
      savePref(`live-bpm`, v);
    },
    perBeat,
    setPerBeat: (v) => {
      setPerBeatState(v);
      savePref(`live-per-beat`, v);
    },
    loop,
    setLoop,
    sound,
    setSound: (v) => {
      setSoundState(v);
      savePref(`live-sound`, v ? `on` : `off`);
    },
  };

  const section = sections[Math.min(sectionIdx, sections.length - 1)];
  const tabs = section ? section.tabs.filter((t) => hasTabContent(t.steps)) : [];
  const chords = section ? sectionChords(section, ctx) : [];
  const hasTab = tabs.length > 0;
  const hasChords = chords.length > 0;
  const effectiveMode: LiveMode = mode === `tab` && !hasTab ? `chords` : mode === `chords` && !hasChords ? `tab` : mode;
  const tab = tabs[Math.min(tabIdx, tabs.length - 1)];

  const columns = useMemo(() => {
    if (!tab) return [];
    const out: { col: TabColumn; barBefore: boolean }[] = [];
    let bar = false;
    for (const s of transposeTabBlock(tab, ctx).steps) {
      if (s === `|`) bar = out.length > 0;
      else {
        out.push({ col: s, barBefore: bar });
        bar = false;
      }
    }
    // Drop trailing empty columns.
    while (out.length && !out[out.length - 1].col.some(Boolean)) out.pop();
    return out;
  }, [tab, ctx]);

  const pick = (i: number, auto = false) => {
    setSectionIdx(i);
    setTabIdx(0);
    setAutoStart(auto);
  };
  const onEnd = () => {
    if (sectionIdx + 1 < sections.length) pick(sectionIdx + 1, true);
  };

  if (!section) return <p className="sheet__empty">Nothing to play yet — add chords or tabs to this song.</p>;

  return (
    <div className="live">
      <div className="live__sections" role="tablist" aria-label="Sections">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === sectionIdx}
            className={`live__section sheet-section--${s.type}${i === sectionIdx ? ` live__section--now` : ``}`}
            onClick={() => pick(i)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="live__options">
        {hasTab && hasChords && (
          <div className="segmented" role="group" aria-label="Show">
            <button type="button" className={`segmented__btn${effectiveMode === `tab` ? ` segmented__btn--active` : ``}`} onClick={() => setMode(`tab`)}>
              Tab
            </button>
            <button type="button" className={`segmented__btn${effectiveMode === `chords` ? ` segmented__btn--active` : ``}`} onClick={() => setMode(`chords`)}>
              Chords
            </button>
          </div>
        )}
        {effectiveMode === `tab` && tabs.length > 1 && (
          <select className="input input--compact live__tab-pick" value={tabIdx} onChange={(e) => setTabIdx(Number(e.target.value))} aria-label="Which tab">
            {tabs.map((t, i) => (
              <option key={t.id} value={i}>
                {t.label || `Tab ${i + 1}`}
              </option>
            ))}
          </select>
        )}
        {effectiveMode === `tab` && tabs.length === 1 && tab?.label && <span className="sheet-section__sublabel">{tab.label}</span>}
      </div>

      {effectiveMode === `tab` && tab ? (
        <TabPlayer key={`${section.id}-${tab.id}`} columns={columns} capo={ctx.capo} tuning={tuning} settings={settings} autoStart={autoStart} onEnd={onEnd} />
      ) : (
        <ChordPlayer key={`${section.id}-chords`} chords={chords} capo={ctx.capo} tuning={tuning} settings={settings} autoStart={autoStart} onEnd={onEnd} />
      )}
      {section.notes.trim() && <p className="sheet-section__notes">{section.notes}</p>}
    </div>
  );
}
