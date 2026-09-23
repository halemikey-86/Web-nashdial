import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useToast } from '../components/ui';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getScale } from '../music/scales';
import { getTuning } from '../music/tunings';
import { useLibrary } from './library';
import { SoloControls, SoloIdeaView, useSoloIdea } from './SoloBuilder';
import { loadPref, savePref } from './storage';
import { isChordLine, prefersFlats, spellNote, transposeChordText, transposeNoteText, transposeTabBlock, type TransposeContext } from './songTranspose';
import { TabDisplay, hasTabContent } from './TabDisplay';
import { stringLabels } from './tabStrings';
import type { Song } from './types';

type Part = 'chords' | 'lyrics' | 'lead' | 'notes' | 'solo';
const PARTS: { id: Part; label: string }[] = [
  { id: `chords`, label: `Chords` },
  { id: `lyrics`, label: `Lyrics` },
  { id: `lead`, label: `Lead` },
  { id: `notes`, label: `Notes` },
  { id: `solo`, label: `Solo` },
];

const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;
const MAX_FOCUS_SCALE = 3.2;
const ZOOMS = [1, 1.25, 1.5, 1.75, 2, 2.5];

/**
 * The whole song on one screen: every section's chords, lead (tabs and single notes) and notes,
 * flowed into columns and scaled so it all fits without scrolling, however long the song is.
 * Tap a section to show just that one as big as possible; A−/A+ zooms past the fitted size.
 */
export function LiveSheet({ song, ctx, hasNav }: { song: Song; ctx: TransposeContext; hasNav: boolean }) {
  const desktop = useMediaQuery(`(min-width: 960px)`);
  const library = useLibrary();
  const toast = useToast();
  const [show, setShow] = useState<Set<Part>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`nashdial-live-parts`) ?? `null`);
      if (Array.isArray(saved)) return new Set((saved as Part[]).filter((p) => p !== `solo`));
    } catch {
      // storage unavailable
    }
    return new Set<Part>([`chords`, `lyrics`, `lead`, `notes`]);
  });
  const [zoom, setZoom] = useState(() => loadPref<number>(`live-zoom`, 1));
  const [fitScale, setFitScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const idea = useSoloIdea(song);

  const tuning = getTuning(song.tuningId);
  const labels = stringLabels(tuning);
  /** A section's chart as shown: transposed, and without lyric lines when Lyrics is off. */
  const chart = (text: string) => {
    const t = transposeChordText(text.replace(/\s+$/, ``), ctx);
    if (show.has(`lyrics`)) return t;
    return t
      .split(`\n`)
      .filter((l) => !l.trim() || isChordLine(l))
      .join(`\n`)
      .replace(/\n{2,}/g, `\n`)
      .trim();
  };
  const keyName = spellNote(ctx.playKey, prefersFlats(ctx.playKey, song.scaleId));
  const hasContent = (s: Song['sections'][number]) =>
    (show.has(`chords`) && s.chords.trim()) ||
    (show.has(`lead`) && (s.tabs.some((t) => hasTabContent(t.steps)) || s.singleNotes.trim())) ||
    (show.has(`notes`) && s.notes.trim()) ||
    (!s.chords.trim() && !s.notes.trim() && !s.singleNotes.trim() && !s.tabs.some((t) => hasTabContent(t.steps)));
  const sections = song.sections.filter(hasContent);
  const solos = show.has(`solo`) ? song.solos.filter((t) => hasTabContent(t.steps)) : [];
  const focusIndex = focusId ? sections.findIndex((s) => s.id === focusId) : -1;
  const focused = focusIndex >= 0 ? sections[focusIndex] : null;
  const visibleSections = focused ? [focused] : sections;

  // Leave focus if that section disappears (song change, parts hidden).
  useEffect(() => {
    if (focusId && focusIndex < 0) setFocusId(null);
  }, [focusId, focusIndex]);
  useEffect(() => setFocusId(null), [song.id]);

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
  const bumpZoom = (dir: 1 | -1) => {
    const i = Math.max(0, ZOOMS.findIndex((z) => z >= zoom - 0.01));
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
    savePref(`live-zoom`, next);
  };

  // Longest chord line: columns are at least that wide so chord charts never wrap.
  const longestChordLine = show.has(`chords`)
    ? Math.max(0, ...visibleSections.flatMap((s) => (s.chords.trim() ? chart(s.chords).split(`\n`).map((l) => l.trimEnd().length) : [])))
    : 0;

  const measureHeight = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (desktop) {
      const parent = box.parentElement;
      if (parent) setHeight(Math.max(240, parent.clientHeight - 4));
      return;
    }
    const top = box.getBoundingClientRect().top;
    setHeight(Math.max(240, window.innerHeight - Math.max(0, top) - (hasNav ? 84 : 12)));
  }, [desktop, hasNav]);

  // Largest text size at which everything fits (binary search on real layout), then apply zoom.
  const fit = useCallback(() => {
    const cols = colsRef.current;
    if (!cols) return;
    // Measure without the zoomed view's scrollbar, which would steal height.
    const overflow = cols.style.overflow;
    cols.style.overflow = `hidden`;
    const fits = (s: number) => {
      cols.style.setProperty(`--fit`, String(s));
      return cols.scrollWidth <= cols.clientWidth + 1 && cols.scrollHeight <= cols.clientHeight + 1;
    };
    let lo = MIN_SCALE;
    let hi = focused ? MAX_FOCUS_SCALE : MAX_SCALE;
    if (fits(hi)) lo = hi;
    else
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    const best = Math.floor(lo * 100) / 100;
    cols.style.overflow = overflow;
    cols.style.setProperty(`--fit`, String(best * zoom));
    setFitScale(best);
  }, [focused, zoom]);

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

  useLayoutEffect(() => {
    if (height !== null) fit();
  }, [height, fit, song, ctx.playKey, ctx.capo, ctx.display, show, longestChordLine, focusId, idea.idea]);
  useLayoutEffect(() => {
    document.fonts?.ready.then(() => height !== null && fit());
  }, [fit, height]);

  const saveIdea = (block: Song['solos'][number]) => {
    library.saveSong({ ...song, solos: [...song.solos, block] });
    toast(`Saved “${block.label}” to the song`);
  };

  const zoomed = zoom > 1.01;
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
        <div className="fit-sheet__tools">
          <div className="segmented fit-sheet__parts" role="group" aria-label="Show">
            {PARTS.map((p) => (
              <button key={p.id} type="button" className={`segmented__btn${show.has(p.id) ? ` segmented__btn--active` : ``}`} aria-pressed={show.has(p.id)} onClick={() => toggle(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="segmented fit-sheet__zoom" role="group" aria-label="Text size">
            <button type="button" className="segmented__btn" onClick={() => bumpZoom(-1)} disabled={zoom <= 1} aria-label="Smaller">
              A−
            </button>
            <button type="button" className="segmented__btn" onClick={() => bumpZoom(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Bigger">
              A+
            </button>
          </div>
        </div>
      </div>

      {focused && (
        <div className="fit-sheet__focus-bar">
          <button type="button" className="btn btn--small" onClick={() => setFocusId(sections[focusIndex - 1]?.id ?? focusId)} disabled={focusIndex <= 0}>
            ← {sections[focusIndex - 1]?.label ?? `Prev`}
          </button>
          <button type="button" className="btn btn--small btn--primary" onClick={() => setFocusId(null)}>
            Show whole song
          </button>
          <button type="button" className="btn btn--small" onClick={() => setFocusId(sections[focusIndex + 1]?.id ?? focusId)} disabled={focusIndex >= sections.length - 1}>
            {sections[focusIndex + 1]?.label ?? `Next`} →
          </button>
        </div>
      )}

      {show.has(`solo`) && !focused && <SoloControls idea={idea} song={song} ctx={ctx} onSave={saveIdea} />}

      <div
        className={`fit-sheet__cols${zoomed ? ` fit-sheet__cols--zoomed` : ``}${focused ? ` fit-sheet__cols--focus` : ``}`}
        ref={colsRef}
        style={{ '--fit': fitScale * zoom, '--chord-ch': longestChordLine } as CSSProperties}
      >
        {!focused && song.notes.trim() && show.has(`notes`) && <p className="fit-part__song-notes">{song.notes}</p>}
        {visibleSections.length === 0 && !solos.length && <p className="sheet__empty">Nothing to show yet — edit the song to add sections.</p>}
        {visibleSections.map((s) => {
          const tabs = s.tabs.filter((t) => hasTabContent(t.steps));
          return (
            <section
              key={s.id}
              className={`fit-part sheet-section--${s.type}${focused ? ` fit-part--focused` : ``}`}
              onClick={() => setFocusId(focused ? null : s.id)}
              title={focused ? `Tap to show the whole song` : `Tap to show just this section, big`}
            >
              <h3 className="fit-part__label">
                {s.label}
                {s.bars ? <span className="fit-part__bars"> · {s.bars} bars</span> : null}
              </h3>
              {show.has(`chords`) && s.chords.trim() && <pre className="fit-part__chords">{chart(s.chords)}</pre>}
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
        {!focused &&
          solos.map((t) => (
            <section key={t.id} className="fit-part fit-part--solo">
              <h3 className="fit-part__label">{t.label || `Solo`}</h3>
              <div className="fit-part__tab">
                <TabDisplay steps={transposeTabBlock(t, ctx).steps} stringLabels={labels} />
              </div>
            </section>
          ))}
        {!focused && show.has(`solo`) && (
          <section className="fit-part fit-part--solo fit-part--idea">
            <h3 className="fit-part__label">Solo idea</h3>
            <span className="fit-part__sublabel">{idea.idea.block.label}</span>
            <SoloIdeaView idea={idea} song={song} ctx={ctx} />
          </section>
        )}
      </div>
      {!focused && !zoomed && fitScale <= MIN_SCALE + 0.01 && <p className="fit-sheet__warn">This song is long — hide Notes or Lead, or tap a section to see it big.</p>}
      {zoomed && <p className="fit-sheet__warn">Zoomed in — swipe sideways to see the rest, or A− to fit.</p>}
    </div>
  );
}
