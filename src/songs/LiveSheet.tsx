import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getScale } from '../music/scales';
import { getTuning } from '../music/tunings';
import { loadPref, savePref } from './storage';
import { prefersFlats, spellNote, transposeChordText, transposeNoteText, transposeTabBlock, type TransposeContext } from './songTranspose';
import { TabDisplay, hasTabContent } from './TabDisplay';
import { stringLabels } from './tabStrings';
import type { Song } from './types';

type Part = 'chords' | 'lead' | 'notes';
const PARTS: { id: Part; label: string }[] = [
  { id: `chords`, label: `Chords` },
  { id: `lead`, label: `Lead` },
  { id: `notes`, label: `Notes` },
];

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;

/**
 * The whole song on one screen: every section's chords, lead (tabs and single notes) and notes,
 * flowed into columns and scaled so it all fits without scrolling, however long the song is.
 */
export function LiveSheet({ song, ctx, hasNav }: { song: Song; ctx: TransposeContext; hasNav: boolean }) {
  const desktop = useMediaQuery(`(min-width: 960px)`);
  const [show, setShow] = useState<Set<Part>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`nashdial-live-parts`) ?? `null`);
      if (Array.isArray(saved)) return new Set(saved as Part[]);
    } catch {
      // storage unavailable
    }
    return new Set<Part>([`chords`, `lead`, `notes`]);
  });
  const [scale, setScale] = useState(() => loadPref<number>(`live-scale`, 1));
  const [height, setHeight] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);

  const tuning = getTuning(song.tuningId);
  const labels = stringLabels(tuning);
  const keyName = spellNote(ctx.playKey, prefersFlats(ctx.playKey, song.scaleId));
  const sections = song.sections.filter(
    (s) =>
      (show.has(`chords`) && s.chords.trim()) ||
      (show.has(`lead`) && (s.tabs.some((t) => hasTabContent(t.steps)) || s.singleNotes.trim())) ||
      (show.has(`notes`) && s.notes.trim()) ||
      (!s.chords.trim() && !s.notes.trim() && !s.singleNotes.trim() && !s.tabs.some((t) => hasTabContent(t.steps))),
  );

  // Columns are at least as wide as the longest chord line, so chord charts never wrap.
  const longestChordLine = show.has(`chords`)
    ? Math.max(0, ...sections.flatMap((s) => (s.chords.trim() ? transposeChordText(s.chords, ctx).split(`
`).map((l) => l.trimEnd().length) : [])))
    : 0;

  const toggle = (p: Part) => {
    const next = new Set(show);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setShow(next);
    try {
      localStorage.setItem(`nashdial-live-parts`, JSON.stringify([...next]));
    } catch {
      // storage unavailable
    }
  };

  // Height available on screen for the sheet.
  const measureHeight = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (desktop) {
      const parent = box.parentElement;
      if (parent) setHeight(Math.max(240, parent.clientHeight - 4));
      return;
    }
    const top = box.getBoundingClientRect().top;
    const reserve = hasNav ? 84 : 12;
    setHeight(Math.max(240, window.innerHeight - Math.max(0, top) - reserve));
  }, [desktop, hasNav]);

  // Find the largest text size at which everything fits (binary search on real layout).
  const fit = useCallback(() => {
    const cols = colsRef.current;
    if (!cols) return;
    const fits = (s: number) => {
      cols.style.setProperty(`--fit`, String(s));
      return cols.scrollWidth <= cols.clientWidth + 1 && cols.scrollHeight <= cols.clientHeight + 1;
    };
    let lo = MIN_SCALE;
    let hi = MAX_SCALE;
    if (fits(hi)) lo = hi;
    else
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    const best = Math.floor(lo * 100) / 100;
    cols.style.setProperty(`--fit`, String(best));
    setScale(best);
    savePref(`live-scale`, best);
  }, []);

  useLayoutEffect(() => {
    measureHeight();
    const onResize = () => measureHeight();
    window.addEventListener(`resize`, onResize);
    window.addEventListener(`orientationchange`, onResize);
    const parent = boxRef.current?.parentElement;
    const ro = parent ? new ResizeObserver(onResize) : null;
    if (parent && ro) ro.observe(parent);
    return () => {
      window.removeEventListener(`resize`, onResize);
      window.removeEventListener(`orientationchange`, onResize);
      ro?.disconnect();
    };
  }, [measureHeight]);

  // Refit whenever the space, the song, the key or the visible parts change.
  useLayoutEffect(() => {
    if (height !== null) fit();
  }, [height, fit, song, ctx.playKey, ctx.capo, ctx.display, show, longestChordLine]);
  useLayoutEffect(() => {
    // Web fonts arriving late change text widths.
    document.fonts?.ready.then(() => height !== null && fit());
  }, [fit, height]);

  return (
    <div className="fit-sheet" ref={boxRef} style={height ? { height } : undefined}>
      <div className="fit-sheet__bar">
        <div className="fit-sheet__title">
          <strong>{song.title || `Untitled song`}</strong>
          {song.artist && <span> · {song.artist}</span>}
          <span className="fit-sheet__chip">
            {keyName} {getScale(song.scaleId).shortName}
          </span>
          {ctx.capo > 0 && <span className="fit-sheet__chip">Capo {ctx.capo}</span>}
          {song.bpm && <span className="fit-sheet__chip">{song.bpm} BPM</span>}
          {song.timeSignature !== `4/4` && <span className="fit-sheet__chip">{song.timeSignature}</span>}
        </div>
        <div className="segmented fit-sheet__parts" role="group" aria-label="Show">
          {PARTS.map((p) => (
            <button key={p.id} type="button" className={`segmented__btn${show.has(p.id) ? ` segmented__btn--active` : ``}`} aria-pressed={show.has(p.id)} onClick={() => toggle(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fit-sheet__cols" ref={colsRef} style={{ '--fit': scale, '--chord-ch': longestChordLine } as CSSProperties}>
        {song.notes.trim() && show.has(`notes`) && <p className="fit-part__song-notes">{song.notes}</p>}
        {sections.length === 0 && <p className="sheet__empty">Nothing to show yet — edit the song to add sections.</p>}
        {sections.map((s) => {
          const tabs = s.tabs.filter((t) => hasTabContent(t.steps));
          return (
            <section key={s.id} className={`fit-part sheet-section--${s.type}`}>
              <h3 className="fit-part__label">
                {s.label}
                {s.bars ? <span className="fit-part__bars"> · {s.bars} bars</span> : null}
              </h3>
              {show.has(`chords`) && s.chords.trim() && <pre className="fit-part__chords">{transposeChordText(s.chords.replace(/\s+$/, ``), ctx)}</pre>}
              {show.has(`lead`) &&
                tabs.map((t) => (
                  <div key={t.id} className="fit-part__tab">
                    {t.label && <span className="fit-part__sublabel">{t.label}</span>}
                    <TabDisplay steps={transposeTabBlock(t, ctx).steps} stringLabels={labels} />
                  </div>
                ))}
              {show.has(`lead`) && s.singleNotes.trim() && <pre className="fit-part__single">{transposeNoteText(s.singleNotes.trim(), ctx)}</pre>}
              {show.has(`notes`) && s.notes.trim() && <p className="fit-part__notes">{s.notes}</p>}
            </section>
          );
        })}
      </div>
      {scale <= MIN_SCALE + 0.01 && <p className="fit-sheet__warn">This song is long — hide Notes or Lead to make the text bigger.</p>}
    </div>
  );
}
