import { useEffect, useMemo, useRef, useState } from 'react';
import { click, pickClock, unlockAudio } from '../audio';
import { PageHeader } from '../components/ui';
import { navigate } from '../router';
import { useLibrary } from './library';
import { beatsPerBar, sectionBars, songDisplayName } from './model';
import { loadPref, savePref } from './storage';
import type { Song } from './types';

/** Two crossed drumsticks. */
export function DrumsticksIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="drumsticks-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      {/* Each stick tapers from a thick butt end to a thin neck, with a bead tip. */}
      <path d="M2.6 20.2 L4.2 21.8 L18.4 7.2 L17.2 6 Z" />
      <path d="M21.4 20.2 L19.8 21.8 L5.6 7.2 L6.8 6 Z" />
      <ellipse cx="18.9" cy="5.2" rx="1.6" ry="2.1" transform="rotate(45 18.9 5.2)" />
      <ellipse cx="5.1" cy="5.2" rx="1.6" ry="2.1" transform="rotate(-45 5.1 5.2)" />
    </svg>
  );
}

interface Part {
  id: string;
  label: string;
  type: string;
  notes: string;
  bars: number;
  estimated: boolean;
  startBar: number;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, `0`)}`;
}

/**
 * The song for a drummer: tempo, time signature and the section roadmap, with a click track
 * that follows along, counts in, and flags the bar before each change.
 */
export function DrumView({ song }: { song: Song }) {
  const bpb = beatsPerBar(song.timeSignature);
  const [bpm, setBpm] = useState(song.bpm ?? 90);
  const [clickOn, setClickOn] = useState(() => loadPref<string>(`drum-click`, `on`) === `on`);
  const [countIn, setCountIn] = useState(() => loadPref<string>(`drum-count-in`, `on`) === `on`);
  const [running, setRunning] = useState(false);
  /** Beat since the start of the song; negative during the count-in; null = stopped. */
  const [beat, setBeat] = useState<number | null>(null);
  const [cursorBar, setCursorBar] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  const parts = useMemo(() => {
    let bar = 0;
    const out: Part[] = [];
    for (const s of song.sections) {
      const { bars, estimated } = sectionBars(s);
      out.push({ id: s.id, label: s.label, type: s.type, notes: s.notes, bars, estimated, startBar: bar });
      bar += bars;
    }
    return out;
  }, [song.sections]);
  const totalBars = parts.reduce((n, p) => n + p.bars, 0);
  const totalSeconds = (totalBars * bpb * 60) / bpm;

  // Keep tempo in step with the song when switching songs.
  useEffect(() => {
    setBpm(song.bpm ?? 90);
  }, [song.id, song.bpm]);

  // The click engine: schedule ticks slightly ahead on a steady clock and derive the beat from it.
  const engine = useRef<{ timer: number; stop: () => void } | null>(null);
  const stop = () => {
    engine.current?.stop();
    engine.current = null;
    setRunning(false);
    setBeat(null);
  };
  const start = (fromBar: number) => {
    engine.current?.stop();
    unlockAudio();
    const clock = pickClock();
    const spb = 60 / bpm;
    const lead = countIn ? bpb : 0;
    const t0 = clock.now() + 0.12;
    const firstBeat = fromBar * bpb - lead;
    let next = firstBeat;
    let shown: number | null = null;
    const endBeat = totalBars * bpb;
    const tick = () => {
      const now = clock.now();
      while (clock.audio && t0 + (next - firstBeat) * spb < now + 0.15 && next < endBeat) {
        if (clickOn) click(((next % bpb) + bpb) % bpb === 0 || next < fromBar * bpb, t0 + (next - firstBeat) * spb);
        next++;
      }
      const current = firstBeat + Math.floor((now - t0) / spb);
      if (now >= t0 && current !== shown) {
        shown = current;
        if (!clock.audio && clickOn) click(((current % bpb) + bpb) % bpb === 0);
        if (current >= endBeat) {
          stop();
          setCursorBar(0);
          return;
        }
        setBeat(current);
        if (current >= 0) setCursorBar(Math.floor(current / bpb));
      }
    };
    const timer = window.setInterval(tick, 20);
    engine.current = { timer, stop: () => window.clearInterval(timer) };
    setRunning(true);
    setBeat(firstBeat - 1);
    tick();
  };
  useEffect(() => () => engine.current?.stop(), []);
  // Restart from the current bar when tempo or options change mid-run.
  useEffect(() => {
    if (running) start(cursorBar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, clickOn, countIn]);
  // Stop when the song changes (setlist next/prev).
  useEffect(() => {
    stop();
    setCursorBar(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  const inCountIn = beat !== null && beat < 0;
  const bar = inCountIn || beat === null ? cursorBar : Math.floor(beat / bpb);
  const beatInBar = beat === null ? -1 : ((beat % bpb) + bpb) % bpb;
  const partIndex = Math.max(
    0,
    parts.findIndex((p) => bar >= p.startBar && bar < p.startBar + p.bars),
  );
  const part = parts[partIndex];
  const nextPart = parts[partIndex + 1];
  const barInPart = part ? bar - part.startBar + 1 : 0;
  const barsLeft = part ? part.bars - barInPart + 1 : 0;
  const fillBar = running && !inCountIn && !!nextPart && barsLeft === 1;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-part="${partIndex}"]`)?.scrollIntoView({ block: `nearest`, behavior: `smooth` });
  }, [partIndex]);

  const jump = (p: Part) => {
    setCursorBar(p.startBar);
    if (running) start(p.startBar);
  };

  return (
    <div className="drums">
      <header className="drums__head">
        <div>
          <h2 className="drums__title">{song.title || `Untitled song`}</h2>
          {song.artist && <p className="drums__artist">{song.artist}</p>}
        </div>
        <div className="drums__tempo">
          <span className="drums__bpm">{bpm}</span>
          <span className="drums__bpm-unit">BPM</span>
          <span className="drums__sig">{song.timeSignature}</span>
          <span className="drums__length">≈ {formatTime(totalSeconds)}</span>
        </div>
      </header>
      {song.notes.trim() && <p className="drums__song-notes">{song.notes}</p>}

      <div className={`drums__now${fillBar ? ` drums__now--fill` : ``}${inCountIn ? ` drums__now--count` : ``}`}>
        <div className="drums__beats" aria-label={beatInBar >= 0 ? `Beat ${beatInBar + 1}` : `Stopped`}>
          {Array.from({ length: bpb }, (_, i) => (
            <span key={i} className={`drums__beat${i === beatInBar ? ` drums__beat--on` : ``}${i === 0 ? ` drums__beat--one` : ``}`}>
              {i + 1}
            </span>
          ))}
        </div>
        <div className="drums__status">
          {inCountIn ? (
            <span className="drums__big">Count-in…</span>
          ) : (
            <>
              <span className="drums__big">{part?.label ?? `—`}</span>
              <span className="drums__sub">
                Bar {barInPart} of {part?.bars ?? 0}
                {nextPart ? ` · Next: ${nextPart.label} in ${barsLeft} bar${barsLeft === 1 ? `` : `s`}` : ` · Last section`}
              </span>
            </>
          )}
          {fillBar && <span className="drums__fill">FILL → {nextPart?.label}</span>}
        </div>
      </div>

      <div className="ex-controls drums__controls">
        <button type="button" className="btn" onClick={() => jump(parts[0])} aria-label="Back to the top" disabled={!parts.length}>
          ⏮
        </button>
        <button type="button" className="btn btn--primary ex-controls__play" onClick={() => (running ? stop() : start(cursorBar))} disabled={!totalBars}>
          {running ? `■ Stop` : `▶ Start`}
        </button>
        <div className="drums__bpm-set">
          <button type="button" className="btn btn--icon" onClick={() => setBpm((b) => Math.max(30, b - 1))} aria-label="Slower">
            −
          </button>
          <input
            className="input input--compact drums__bpm-input"
            type="number"
            inputMode="numeric"
            min={30}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(Math.min(300, Math.max(30, Number(e.target.value) || 30)))}
            aria-label="Tempo in BPM"
          />
          <button type="button" className="btn btn--icon" onClick={() => setBpm((b) => Math.min(300, b + 1))} aria-label="Faster">
            +
          </button>
        </div>
        <label className="ex-check">
          <input
            type="checkbox"
            checked={clickOn}
            onChange={(e) => {
              setClickOn(e.target.checked);
              savePref(`drum-click`, e.target.checked ? `on` : `off`);
            }}
          />
          Click
        </label>
        <label className="ex-check">
          <input
            type="checkbox"
            checked={countIn}
            onChange={(e) => {
              setCountIn(e.target.checked);
              savePref(`drum-count-in`, e.target.checked ? `on` : `off`);
            }}
          />
          Count-in
        </label>
      </div>

      <ol className="drums__roadmap" ref={listRef}>
        {parts.map((p, i) => {
          const now = i === partIndex && (running || cursorBar > 0);
          const done = running && bar >= p.startBar + p.bars;
          const progress = now && !inCountIn ? Math.min(1, (bar - p.startBar + (beatInBar + 1) / bpb) / p.bars) : done ? 1 : 0;
          return (
            <li key={p.id} data-part={i}>
              <button
                type="button"
                className={`drums__part sheet-section--${p.type}${now ? ` drums__part--now` : ``}${done ? ` drums__part--done` : ``}`}
                onClick={() => jump(p)}
              >
                <span className="drums__part-fill" style={{ transform: `scaleX(${progress})` }} aria-hidden />
                <span className="drums__part-num">{i + 1}</span>
                <span className="drums__part-main">
                  <span className="drums__part-label">{p.label}</span>
                  {p.notes.trim() && <span className="drums__part-notes">{p.notes}</span>}
                </span>
                <span className="drums__part-bars">
                  {p.estimated ? `≈` : ``}
                  {p.bars}
                  <small> bars</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {parts.some((p) => p.estimated) && (
        <p className="drums__hint">≈ bar counts are estimated from the chord chart. Set exact bars per section when editing the song.</p>
      )}
    </div>
  );
}

/** Drums section: pick a setlist or song to open in the drum view. */
export function DrumsHome() {
  const library = useLibrary();
  const open = (go: () => void) => {
    savePref(`stage-view`, `drums`);
    go();
  };
  const lists = [...library.setlists].sort((a, b) => (b.date || b.updatedAt).localeCompare(a.date || a.updatedAt));
  const songs = [...library.songs].sort((a, b) => songDisplayName(a).localeCompare(songDisplayName(b)));
  return (
    <div className="page drums-home">
      <PageHeader
        title={
          <span className="drums-home__title">
            <DrumsticksIcon size={22} /> Drums
          </span>
        }
      />
      <p className="warmup__intro">Pick a set or a song to see its structure, tempo and a click that counts you in and cues every change.</p>
      <h3 className="drums-home__heading">Setlists</h3>
      {lists.length === 0 ? (
        <p className="list-empty card">No setlists yet.</p>
      ) : (
        <ul className="list">
          {lists.map((l) => (
            <li key={l.id} className="list-row">
              <button type="button" className="list-row__main" disabled={!l.items.length} onClick={() => open(() => navigate({ name: `set-play`, id: l.id, index: 0 }))}>
                <span className="list-row__title">{l.name}</span>
                <span className="list-row__sub">
                  {l.date && `${l.date} · `}
                  {l.items.length} song{l.items.length === 1 ? `` : `s`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="drums-home__heading">Songs</h3>
      {songs.length === 0 ? (
        <p className="list-empty card">No songs yet.</p>
      ) : (
        <ul className="list">
          {songs.map((s) => (
            <li key={s.id} className="list-row">
              <button type="button" className="list-row__main" onClick={() => open(() => navigate({ name: `song`, id: s.id }))}>
                <span className="list-row__title">{songDisplayName(s)}</span>
                <span className="list-row__sub">
                  {s.artist || `Unknown artist`} · {s.bpm ? `${s.bpm} BPM` : `no tempo set`} · {s.timeSignature}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
