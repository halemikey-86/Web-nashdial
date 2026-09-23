import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { KeyDial } from '../components/KeyDial';
import { CapoSelector } from '../components/Selectors';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { noteIndex } from '../music/notes';
import { describeInterval, intervalBetween } from '../music/transpose';
import { loadPref, savePref } from './storage';
import { SongSheet } from './SongSheet';
import { prefersFlats, spellNote, type ChordDisplay, type TransposeContext } from './songTranspose';
import type { Song } from './types';

/** Scales the fixed-size key dial down to fit its container. */
function FitDial({ children, size = 360 }: { children: ReactNode; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / size)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  return (
    <div ref={ref} className="fit-dial" style={{ height: size * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: `top left`, width: size, marginLeft: `calc((100% - ${size * scale}px) / 2)` }}>{children}</div>
    </div>
  );
}

/** Keep the screen awake while a song is on stage. */
function useWakeLock() {
  useEffect(() => {
    if (!(`wakeLock` in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== `visible`) return;
      navigator.wakeLock
        .request(`screen`)
        .then((l) => {
          if (cancelled) l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener(`visibilitychange`, acquire);
    return () => {
      cancelled = true;
      document.removeEventListener(`visibilitychange`, acquire);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

export interface StageNav {
  index: number;
  count: number;
  prevTitle: string | null;
  nextTitle: string | null;
  onPrev: () => void;
  onNext: () => void;
}

interface SongStageProps {
  song: Song;
  playKey: number;
  capo: number;
  onPlayKeyChange: (key: number) => void;
  onCapoChange: (capo: number) => void;
  onBack: () => void;
  backLabel: string;
  onEdit: () => void;
  onOpenInDial: () => void;
  nav?: StageNav;
  /** Extra line under the controls, e.g. "Saved to this setlist". */
  keyNote?: string;
}

const DISPLAY_OPTIONS: { id: ChordDisplay; label: string }[] = [
  { id: `sounding`, label: `Chords` },
  { id: `shapes`, label: `Capo shapes` },
  { id: `numbers`, label: `Numbers` },
];

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function SongStage({ song, playKey, capo, onPlayKeyChange, onCapoChange, onBack, backLabel, onEdit, onOpenInDial, nav, keyNote }: SongStageProps) {
  const [display, setDisplay] = useState<ChordDisplay>(() => loadPref<string>(`chord-display`, `sounding`) as ChordDisplay);
  const [fontScale, setFontScale] = useState(() => loadPref<number>(`sheet-scale`, 1));
  const [controlsOpen, setControlsOpen] = useState(false);
  const desktop = useMediaQuery(`(min-width: 960px)`);
  const sheetRef = useRef<HTMLDivElement>(null);
  const songKey = noteIndex(song.key);
  useWakeLock();

  const effectiveDisplay: ChordDisplay = display === `shapes` && capo === 0 ? `sounding` : display;
  const ctx: TransposeContext = { songKey, playKey, scaleId: song.scaleId, songCapo: song.capo, capo, display: effectiveDisplay };

  const pickDisplay = (d: ChordDisplay) => {
    setDisplay(d);
    savePref(`chord-display`, d);
  };
  const bumpFont = (delta: number) => {
    const next = Math.round(Math.min(2, Math.max(0.7, fontScale + delta)) * 100) / 100;
    setFontScale(next);
    savePref(`sheet-scale`, next);
  };

  // Scroll back to the top when the song changes.
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
    if (!desktop) window.scrollTo({ top: 0 });
  }, [song.id, desktop]);

  // Arrow keys change songs; PageUp/PageDown (most Bluetooth page-turner pedals) scroll, then turn the page at the ends.
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ` ` && e.target instanceof HTMLButtonElement) return;
      const n = navRef.current;
      const scroller = desktop ? sheetRef.current : document.scrollingElement;
      if (!scroller) return;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      const atTop = scroller.scrollTop <= 4;
      const page = scroller.clientHeight * 0.8;
      if (e.key === `ArrowRight` && n) n.onNext();
      else if (e.key === `ArrowLeft` && n) n.onPrev();
      else if (e.key === `PageDown` || (e.key === ` ` && !e.shiftKey)) {
        if (atBottom && n) n.onNext();
        else scroller.scrollBy({ top: page, behavior: `smooth` });
      } else if (e.key === `PageUp` || (e.key === ` ` && e.shiftKey)) {
        if (atTop && n) n.onPrev();
        else scroller.scrollBy({ top: -page, behavior: `smooth` });
      } else return;
      e.preventDefault();
    };
    window.addEventListener(`keydown`, onKey);
    return () => window.removeEventListener(`keydown`, onKey);
  }, [desktop]);

  // Horizontal swipe on the sheet changes songs.
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== `touch` || (e.target as HTMLElement).closest(`.tab-display`)) return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId || !nav) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
      if (dx < 0) nav.onNext();
      else nav.onPrev();
    }
  };

  const keyLabel = spellNote(playKey, prefersFlats(playKey, song.scaleId));
  const writtenLabel = spellNote(songKey, prefersFlats(songKey, song.scaleId));
  const interval = intervalBetween(songKey, playKey);
  const showControls = desktop || controlsOpen;

  return (
    <div className={`stage${nav ? ` stage--with-nav` : ``}`}>
      <div className="stage__bar">
        <button type="button" className="btn btn--ghost stage__back" onClick={onBack}>
          ← <span className="stage__back-label">{backLabel}</span>
        </button>
        <div className="stage__heading">
          <span className="stage__song">{song.title || `Untitled song`}</span>
          {nav && (
            <span className="stage__position">
              {nav.index + 1} / {nav.count}
            </span>
          )}
        </div>
        {!desktop && (
          <button type="button" className={`btn stage__key-btn${controlsOpen ? ` stage__key-btn--open` : ``}`} onClick={() => setControlsOpen((o) => !o)} aria-expanded={controlsOpen}>
            Key {keyLabel}
            {capo > 0 && ` · Capo ${capo}`} {controlsOpen ? `▴` : `▾`}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="stage__body">
        {showControls && (
          <aside className="stage__controls" aria-label="Key and display">
            <p className="app__dial-label">Play in — turn the dial to change key</p>
            <FitDial>
              <KeyDial selectedIndex={playKey} onChange={onPlayKeyChange} scaleId={song.scaleId} subLabel={`Written in ${writtenLabel}`} />
            </FitDial>
            <p className="stage__interval">
              {interval === 0 ? `Original key (${writtenLabel})` : `${describeInterval(interval)} from ${writtenLabel}`}
              {interval !== 0 && (
                <button type="button" className="btn btn--small stage__reset" onClick={() => onPlayKeyChange(songKey)}>
                  Reset
                </button>
              )}
            </p>
            {keyNote && <p className="stage__key-note">{keyNote}</p>}
            <CapoSelector capoFret={capo} onChange={onCapoChange} id="stage-capo" />
            <div className="stage__display">
              <span className="field__label">Show chords as</span>
              <div className="segmented" role="group" aria-label="Chord display">
                {DISPLAY_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`segmented__btn${effectiveDisplay === o.id ? ` segmented__btn--active` : ``}`}
                    onClick={() => pickDisplay(o.id)}
                    disabled={o.id === `shapes` && capo === 0}
                    title={o.id === `shapes` && capo === 0 ? `Set a capo to see capo shapes` : undefined}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stage__text-size">
              <span className="field__label">Text size</span>
              <div className="segmented" role="group" aria-label="Text size">
                <button type="button" className="segmented__btn" onClick={() => bumpFont(-0.1)} aria-label="Smaller text">
                  A−
                </button>
                <button type="button" className="segmented__btn" onClick={() => bumpFont(0.1)} aria-label="Larger text">
                  A+
                </button>
              </div>
            </div>
            <button type="button" className="btn btn--small" onClick={onOpenInDial}>
              Open key on fretboard →
            </button>
          </aside>
        )}

        <div
          ref={sheetRef}
          className="stage__sheet"
          style={{ '--sheet-scale': fontScale } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          <SongSheet song={song} ctx={ctx} />
        </div>
      </div>

      {nav && (
        <nav className="stage__nav" aria-label="Setlist navigation">
          <button type="button" className="btn stage__nav-btn" onClick={nav.onPrev} disabled={nav.prevTitle === null}>
            <span className="stage__nav-dir">← Prev</span>
            <span className="stage__nav-title">{nav.prevTitle ?? `Start of set`}</span>
          </button>
          <span className="stage__nav-count">
            {nav.index + 1} / {nav.count}
          </span>
          <button type="button" className="btn stage__nav-btn stage__nav-btn--next" onClick={nav.onNext} disabled={nav.nextTitle === null}>
            <span className="stage__nav-dir">Next →</span>
            <span className="stage__nav-title">{nav.nextTitle ?? `End of set`}</span>
          </button>
        </nav>
      )}
    </div>
  );
}
