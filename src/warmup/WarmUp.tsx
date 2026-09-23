import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { click, pluck, usePlayback } from '../audio';
import { Neck } from '../components/Neck';
import { GUITAR_NECK, fretX, stringY } from '../components/neckGeometry';
import { PageHeader } from '../components/ui';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { openStringMidi, DEFAULT_TUNING } from '../music/tunings';
import { navigate } from '../router';
import { loadPref, savePref } from '../songs/storage';
import { EXERCISES, FINGER_COLORS, FINGER_NAMES, handStates, type Exercise } from './exercises';

const STRINGS = 6;
const OPEN_MIDI = openStringMidi(DEFAULT_TUNING);
const TAB_NAMES = [`e`, `B`, `G`, `D`, `A`, `E`];

function ExerciseTab({ exercise, index, onJump }: { exercise: Exercise; index: number; onJump: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-i="${index}"]`);
    const box = ref.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2, behavior: `smooth` });
  }, [index]);
  const perBar = exercise.perBeat * 4;
  return (
    <div className="ex-tab" ref={ref} aria-label="Tab">
      <div className="ex-tab__labels" aria-hidden>
        {TAB_NAMES.map((n, i) => (
          <span key={i}>{n}</span>
        ))}
      </div>
      {exercise.steps.map((step, i) => (
        <button
          key={i}
          type="button"
          data-i={i}
          className={`ex-tab__col${i === index ? ` ex-tab__col--now` : ``}${i % perBar === 0 && i > 0 ? ` ex-tab__col--bar` : ``}`}
          onClick={() => onJump(i)}
          aria-label={`Note ${i + 1}: string ${STRINGS - step.s}, fret ${step.f}, finger ${step.finger}`}
        >
          {TAB_NAMES.map((_, r) => {
            const s = STRINGS - 1 - r;
            return (
              <span key={r} className="ex-tab__cell">
                {step.s === s ? `${step.tech ?? ``}${step.f}` : ``}
              </span>
            );
          })}
          <span className="ex-tab__finger" style={{ color: FINGER_COLORS[step.finger] }}>
            {step.finger}
          </span>
        </button>
      ))}
    </div>
  );
}

function ExercisePlayer({ exercise }: { exercise: Exercise }) {
  const [bpm, setBpm] = useState(() => loadPref<number>(`warmup-bpm-${exercise.id}`, exercise.bpm));
  const [sound, setSound] = useState(() => loadPref<string>(`warmup-sound`, `on`) === `on`);
  const [metronome, setMetronome] = useState(() => loadPref<string>(`warmup-click`, `on`) === `on`);
  const interval = 60000 / (bpm * exercise.perBeat);
  const { index, playing, toggle, step, jump, setIndex, setPlaying } = usePlayback(exercise.steps.length, interval);
  const states = useMemo(() => handStates(exercise.steps), [exercise]);
  const current = exercise.steps[index];
  const hand = states[index];
  const frets = exercise.steps.map((s) => s.f);
  const from = Math.max(0, Math.min(...frets) - 1);
  const to = Math.max(...frets) + 1;

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [exercise, setIndex, setPlaying]);

  // Sound for each note, and a click on every beat.
  useEffect(() => {
    if (sound) pluck(OPEN_MIDI[current.s] + current.f, 0, current.tech ? 0.12 : 0.2);
    if (metronome && playing && index % exercise.perBeat === 0) click(index % (exercise.perBeat * 4) === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing]);

  const changeBpm = (v: number) => {
    setBpm(v);
    savePref(`warmup-bpm-${exercise.id}`, v);
  };

  const beat = Math.floor(index / exercise.perBeat) % 4;

  return (
    <div className="ex-player" style={{ '--move-ms': `${Math.min(180, interval * 0.55)}ms` } as CSSProperties}>
      <div className="ex-player__head">
        <div>
          <h3 className="ex-player__title">{exercise.name}</h3>
          <p className="ex-player__summary">{exercise.summary}</p>
        </div>
        <span className={`ex-level ex-level--${exercise.level.toLowerCase()}`}>{exercise.level}</span>
      </div>

      <div className="ex-player__neck">
        <Neck stringCount={STRINGS} fromFret={from} toFret={to} vibrating={new Set([current.s])} label="Finger animation">
          {([1, 2, 3, 4] as const).map((n) => {
            const pos = hand.fingers[n];
            const x = fretX(GUITAR_NECK, pos.f);
            const y = stringY(GUITAR_NECK, pos.s, STRINGS, x);
            return (
              <g key={n} className={`finger${pos.pressed ? ` finger--pressed` : ``}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
                <g className="finger__lift">
                  <ellipse className="finger__shadow" cx={6} cy={10} rx={24} ry={20} />
                  <circle className="finger__tip" r={24} style={{ fill: FINGER_COLORS[n] }} />
                  <text className="finger__num">{n}</text>
                </g>
                {pos.pressed && <circle key={index} className="finger__ripple" r={26} style={{ stroke: FINGER_COLORS[n] }} />}
              </g>
            );
          })}
          {current.tech && (
            <text className="finger__tech" x={fretX(GUITAR_NECK, current.f)} y={stringY(GUITAR_NECK, current.s, STRINGS, fretX(GUITAR_NECK, current.f)) - 40}>
              {current.tech === `h` ? `hammer` : `pull`}
            </text>
          )}
        </Neck>
      </div>

      <div className="ex-player__legend">
        {([1, 2, 3, 4] as const).map((n) => (
          <span key={n} className={`ex-legend${current.finger === n ? ` ex-legend--now` : ``}`}>
            <span className="ex-legend__dot" style={{ background: FINGER_COLORS[n] }}>
              {n}
            </span>
            {FINGER_NAMES[n]}
          </span>
        ))}
        <span className="ex-beats" aria-label={`Beat ${beat + 1}`}>
          {[0, 1, 2, 3].map((b) => (
            <span key={b} className={`ex-beats__dot${b === beat ? ` ex-beats__dot--on` : ``}`} />
          ))}
        </span>
      </div>

      <ExerciseTab exercise={exercise} index={index} onJump={jump} />

      <div className="ex-controls">
        <button type="button" className="btn" onClick={() => jump(0)} aria-label="Back to start">
          ⏮
        </button>
        <button type="button" className="btn" onClick={() => step(-1)} aria-label="Previous note">
          ◀
        </button>
        <button type="button" className="btn btn--primary ex-controls__play" onClick={toggle}>
          {playing ? `❚❚ Pause` : `▶ Play`}
        </button>
        <button type="button" className="btn" onClick={() => step(1)} aria-label="Next note">
          ▶
        </button>
        <label className="ex-tempo">
          <span className="field__label">Tempo {bpm} BPM</span>
          <input type="range" min={30} max={200} step={2} value={bpm} onChange={(e) => changeBpm(Number(e.target.value))} />
        </label>
        <label className="ex-check">
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              setSound(e.target.checked);
              savePref(`warmup-sound`, e.target.checked ? `on` : `off`);
            }}
          />
          Notes
        </label>
        <label className="ex-check">
          <input
            type="checkbox"
            checked={metronome}
            onChange={(e) => {
              setMetronome(e.target.checked);
              savePref(`warmup-click`, e.target.checked ? `on` : `off`);
            }}
          />
          Click
        </label>
      </div>

      <ul className="ex-tips">
        {exercise.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function WarmUp({ exerciseId }: { exerciseId: string | null }) {
  const wide = useMediaQuery(`(min-width: 960px)`);
  const selected = EXERCISES.find((e) => e.id === exerciseId) ?? (wide ? EXERCISES[0] : null);

  const list = (
    <ul className="ex-list">
      {EXERCISES.map((e) => (
        <li key={e.id}>
          <button
            type="button"
            className={`ex-card${selected?.id === e.id ? ` ex-card--active` : ``}`}
            onClick={() => navigate({ name: `warmup`, id: e.id }, { replace: wide })}
          >
            <span className="ex-card__top">
              <span className="list-row__title">{e.name}</span>
              <span className={`ex-level ex-level--${e.level.toLowerCase()}`}>{e.level}</span>
            </span>
            <span className="list-row__sub">{e.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  if (!wide && selected) {
    return (
      <div className="page">
        <PageHeader title="Warm-up" onBack={() => navigate({ name: `warmup`, id: null })} backLabel="All exercises" />
        <ExercisePlayer key={selected.id} exercise={selected} />
      </div>
    );
  }

  return (
    <div className="page warmup">
      <PageHeader title="Warm-up" />
      {wide && selected ? (
        <div className="warmup__layout">
          {list}
          <ExercisePlayer key={selected.id} exercise={selected} />
        </div>
      ) : (
        <>
          <p className="warmup__intro">Pick an exercise to watch the fingering, then play along. Start slow — clean beats fast.</p>
          {list}
        </>
      )}
    </div>
  );
}
