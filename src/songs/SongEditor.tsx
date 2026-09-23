import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Field, PageHeader, useToast } from '../components/ui';
import { ScaleSelector } from '../components/Selectors';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { KEYS, CAPO_FRETS, capoLabel, noteIndex, type NoteName } from '../music/notes';
import { diatonicChords } from '../music/scales';
import { INSTRUMENTS, TUNINGS, getTuning, midiName, openStringMidi, type Tuning } from '../music/tunings';
import { Neck, NeckMarker } from '../components/Neck';
import { loadPref, savePref } from './storage';
import { navigate } from '../router';
import { useLibrary } from './library';
import { TIME_SIGNATURES, createSection, createSong, createTabBlock, emptyColumn, newId, nextSectionLabel, sectionBars, songDisplayName } from './model';
import { fileSlug, saveJsonFile, songFile } from './io';
import { shareFile } from './share';
import { SongSheet } from './SongSheet';
import { TabEditor } from './TabEditor';
import { stringLabels } from './tabStrings';
import { SECTION_TYPES, type Section, type SectionType, type Song } from './types';

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Insert text at the textarea's cursor, keeping focus there. */
function insertAtCursor(el: HTMLTextAreaElement | null, value: string, text: string, onChange: (v: string) => void) {
  if (!el) {
    onChange(value + text);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const pad = before && !/\s$/.test(before) ? ` ` : ``;
  const next = `${before}${pad}${text} ${value.slice(end)}`;
  onChange(next);
  const pos = start + pad.length + text.length + 1;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

/** Fretboard for entering single notes: each tap appends the note (with octave) to the line. */
function NotePicker({ tuning, capo, value, onChange }: { tuning: Tuning; capo: number; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(() => loadPref<string>(`notes-neck`, `on`) === `on`);
  const [taps, setTaps] = useState<{ string: number; fret: number }[]>([]);
  const midi = openStringMidi(tuning);
  const count = tuning.strings.length;

  const toggle = () => {
    setOpen((o) => !o);
    savePref(`notes-neck`, open ? `off` : `on`);
  };
  const pick = (string: number, fret: number) => {
    if (fret < capo) return;
    const name = midiName(midi[string] + fret);
    const trimmed = value.replace(/\s+$/, ``);
    onChange(trimmed ? `${trimmed} ${name}` : name);
    setTaps((t) => [...t.slice(-11), { string, fret }]);
  };
  const undo = () => {
    const tokens = value.trim().split(/\s+/);
    tokens.pop();
    onChange(tokens.join(` `));
    setTaps((t) => t.slice(0, -1));
  };

  return (
    <div className="note-picker">
      <div className="note-picker__bar">
        <button type="button" className="btn btn--small" onClick={toggle} aria-expanded={open}>
          {open ? `Hide fretboard` : `Pick notes on the fretboard`}
        </button>
        {open && (
          <>
            <button type="button" className="btn btn--small" onClick={() => onChange(`${value.replace(/\s+$/, ``)} |`)} disabled={!value.trim()}>
              + Bar |
            </button>
            <button type="button" className="btn btn--small btn--danger" onClick={undo} disabled={!value.trim()}>
              ⌫ Last note
            </button>
          </>
        )}
      </div>
      {open && (
        <Neck stringCount={count} capo={capo} onPick={pick} label="Tap a string and fret to add that note">
          {taps.map((t, i) => (
            <NeckMarker
              key={`${i}-${t.string}-${t.fret}`}
              string={t.string}
              stringCount={count}
              fret={t.fret}
              label={midiName(midi[t.string] + t.fret).replace(/-?\d+$/, ``)}
              variant={i === taps.length - 1 ? `press` : `ghost`}
            />
          ))}
        </Neck>
      )}
    </div>
  );
}

interface SectionEditorProps {
  section: Section;
  song: Song;
  index: number;
  count: number;
  onChange: (s: Section) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Press on the header (or grip) to start dragging this section. */
  onDragStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  dragging: boolean;
  open: boolean;
  onToggle: () => void;
}

function SectionEditor({ section, song, index, count, onChange, onMove, onDuplicate, onDelete, onDragStart, dragging, open, onToggle }: SectionEditorProps) {
  const chordsRef = useRef<HTMLTextAreaElement>(null);
  const tuning = getTuning(song.tuningId);
  const labels = stringLabels(tuning);
  const palette = useMemo(() => diatonicChords(song.key, song.scaleId), [song.key, song.scaleId]);
  const set = <K extends keyof Section>(key: K, value: Section[K]) => onChange({ ...section, [key]: value });

  return (
    <div className={`section-editor section-editor--${section.type}${dragging ? ` section-editor--dragging` : ``}`} data-section-id={section.id}>
      <div className="section-editor__head" onPointerDown={onDragStart}>
        <span className="section-editor__grip" title="Drag to move (or press and hold the header)" aria-hidden>
          ⠿
        </span>
        <button
          type="button"
          className="section-editor__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Collapse section` : `Expand section`}
        >
          {open ? `▾` : `▸`}
        </button>
        <select className="input input--compact" value={section.type} onChange={(e) => set(`type`, e.target.value as SectionType)} aria-label="Section type">
          {SECTION_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          className="input input--compact section-editor__label"
          value={section.label}
          onChange={(e) => set(`label`, e.target.value)}
          aria-label="Section name"
          placeholder={section.type === `custom` ? `Name this section` : undefined}
        />
        <label className="section-editor__bars" title="Length in bars (for the drum view)">
          <input
            className="input input--compact"
            type="number"
            inputMode="numeric"
            min={1}
            max={256}
            value={section.bars ?? ``}
            placeholder={`≈${sectionBars({ ...section, bars: null }).bars}`}
            onChange={(e) => set(`bars`, e.target.value ? Math.max(1, Math.min(256, Number(e.target.value))) : null)}
            aria-label="Bars"
          />
          <span>bars</span>
        </label>
        <div className="section-editor__tools">
          <button type="button" className="btn btn--icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move section up">
            ▲
          </button>
          <button type="button" className="btn btn--icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move section down">
            ▼
          </button>
          <button type="button" className="btn btn--icon" onClick={onDuplicate} aria-label="Duplicate section" title="Duplicate">
            ⧉
          </button>
          <button type="button" className="btn btn--icon btn--danger" onClick={onDelete} aria-label="Delete section" title="Delete">
            ✕
          </button>
        </div>
      </div>

      {open && (
        <div className="section-editor__body">
          <div className="section-editor__block">
            <span className="field__label">Chords</span>
            <div className="chord-palette" role="group" aria-label="Insert chord">
              {palette.map((c) => (
                <button key={c.degree} type="button" className="chip-btn" onClick={() => insertAtCursor(chordsRef.current, section.chords, c.label.replace(`♯`, `#`), (v) => set(`chords`, v))}>
                  {c.label}
                </button>
              ))}
              <button type="button" className="chip-btn" onClick={() => insertAtCursor(chordsRef.current, section.chords, `|`, (v) => set(`chords`, v))}>
                |
              </button>
            </div>
            <textarea
              ref={chordsRef}
              className="input input--mono"
              rows={Math.max(2, section.chords.split(`\n`).length)}
              value={section.chords}
              onChange={(e) => set(`chords`, e.target.value)}
              placeholder={`| G . . . | D/F# . . . | Em7 . . . | C . . . |`}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          <div className="section-editor__block">
            <span className="field__label">Tabs</span>
            {section.tabs.map((tab, ti) => (
              <div key={tab.id} className="section-editor__tab">
                <div className="section-editor__tab-head">
                  <input
                    className="input input--compact"
                    value={tab.label}
                    placeholder="e.g. Lead riff, Solo, Fill"
                    onChange={(e) => set(`tabs`, section.tabs.map((t, i) => (i === ti ? { ...t, label: e.target.value } : t)))}
                    aria-label="Tab name"
                  />
                  <button
                    type="button"
                    className="btn btn--icon btn--danger"
                    onClick={() => confirm(`Delete this tab?`) && set(`tabs`, section.tabs.filter((_, i) => i !== ti))}
                    aria-label="Delete tab"
                  >
                    ✕
                  </button>
                </div>
                <TabEditor
                  block={tab}
                  stringLabels={labels}
                  capo={song.capo}
                  onChange={(b) => set(`tabs`, section.tabs.map((t, i) => (i === ti ? b : t)))}
                />
              </div>
            ))}
            <button type="button" className="btn btn--small" onClick={() => set(`tabs`, [...section.tabs, createTabBlock(labels.length)])}>
              + Add tab
            </button>
          </div>

          <div className="section-editor__block">
            <span className="field__label">Single notes</span>
            <textarea
              className="input input--mono"
              rows={2}
              value={section.singleNotes}
              onChange={(e) => set(`singleNotes`, e.target.value)}
              placeholder="B3 D4 G4 | A3 B3 D4"
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <NotePicker tuning={tuning} capo={song.capo} value={section.singleNotes} onChange={(v) => set(`singleNotes`, v)} />
          </div>

          <div className="section-editor__block">
            <span className="field__label">Notes</span>
            <textarea className="input" rows={1} value={section.notes} onChange={(e) => set(`notes`, e.target.value)} placeholder="Dynamics, cues, repeats…" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-shape every tab so it has one row per string of the new tuning. */
function fitTabsToStrings(song: Song, stringCount: number): Song {
  return {
    ...song,
    sections: song.sections.map((s) => ({
      ...s,
      tabs: s.tabs.map((t) => ({
        ...t,
        steps: t.steps.map((st) => (st === `|` ? st : [...st.slice(0, stringCount), ...emptyColumn(Math.max(0, stringCount - st.length))])),
      })),
    })),
  };
}

export function SongEditor({ songId }: { songId: string | null }) {
  const library = useLibrary();
  const toast = useToast();
  const stored = songId ? library.getSong(songId) : undefined;
  const [draft, setDraft] = useState<Song>(() => (stored ? structuredClone(stored) : createSong()));
  const [dirty, setDirty] = useState(!stored);
  const [preview, setPreview] = useState(false);
  const [customName, setCustomName] = useState(``);
  /** Sections folded down to their header. New songs and imports start with everything open. */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleSection = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Add a section and fold the others so the new one is easy to fill in. */
  const addSection = (section: Section) => {
    setCollapsed(new Set(draft.sections.map((x) => x.id)));
    setSections([...draft.sections, section]);
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-section-id="${section.id}"]`)?.scrollIntoView({ block: `center`, behavior: `smooth` }),
    );
  };
  const listRef = useRef<HTMLDivElement>(null);
  /** The section being dragged, where it would drop (index among the others), and the pointer's y. */
  const [drag, setDrag] = useState<{ id: string; target: number; y: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const sideBySide = useMediaQuery(`(min-width: 1200px)`);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const update = (next: Song) => {
    setDraft(next);
    setDirty(true);
  };
  const set = <K extends keyof Song>(key: K, value: Song[K]) => update({ ...draft, [key]: value });
  const setSections = (sections: Section[]) => update({ ...draft, sections });

  const save = () => {
    library.saveSong(draftRef.current);
    setDirty(false);
    toast(`Saved “${songDisplayName(draftRef.current)}”`);
    if (!songId) navigate({ name: `song-edit`, id: draftRef.current.id }, { replace: true });
  };

  const leave = () => {
    if (dirty && !confirm(`You have unsaved changes. Leave without saving?`)) return;
    // Go back to wherever the editor was opened from (song, setlist, library).
    if (history.length > 1) history.back();
    else navigate(stored ? { name: `song`, id: draft.id } : { name: `songs` });
  };

  // ---- Drag to reorder sections ----------------------------------------------------------------
  const scroller = (): HTMLElement | null => {
    const page = listRef.current?.closest<HTMLElement>(`.page`);
    return page && page.scrollHeight > page.clientHeight + 1 && getComputedStyle(page).overflowY !== `visible` ? page : null;
  };
  const dropIndex = (y: number, id: string): number => {
    const els = [...(listRef.current?.querySelectorAll<HTMLElement>(`[data-section-id]`) ?? [])].filter((el) => el.dataset.sectionId !== id);
    return els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < y;
    }).length;
  };
  const beginDrag = (id: string, y: number) => {
    navigator.vibrate?.(12);
    setDrag({ id, target: draft.sections.findIndex((x) => x.id === id), y });
  };
  const holdTimer = useRef<number | undefined>(undefined);
  const pressSection = (id: string, e: ReactPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const onGrip = !!t.closest(`.section-editor__grip`);
    if (!onGrip && t.closest(`input, select, textarea, button, label`)) return;
    if (e.pointerType === `mouse` && e.button !== 0) return;
    if (onGrip && e.pointerType === `mouse`) {
      e.preventDefault();
      beginDrag(id, e.clientY);
      return;
    }
    // Touch/pen, or a mouse on the header: press and hold to pick the section up.
    const x0 = e.clientX;
    const y0 = e.clientY;
    let lastY = y0;
    const cleanup = () => {
      window.clearTimeout(holdTimer.current);
      window.removeEventListener(`pointermove`, onMove);
      window.removeEventListener(`pointerup`, cleanup);
      window.removeEventListener(`pointercancel`, cleanup);
    };
    const onMove = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10) cleanup();
    };
    window.addEventListener(`pointermove`, onMove);
    window.addEventListener(`pointerup`, cleanup);
    window.addEventListener(`pointercancel`, cleanup);
    holdTimer.current = window.setTimeout(
      () => {
        cleanup();
        beginDrag(id, lastY);
      },
      onGrip ? 150 : 400,
    );
  };

  // While dragging: follow the pointer, auto-scroll near the edges, drop on release.
  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) return;
    let y = dragRef.current?.y ?? 0;
    const follow = () => {
      const d = dragRef.current;
      if (!d) return;
      const target = dropIndex(y, d.id);
      if (target !== d.target || y !== d.y) setDrag({ ...d, target, y });
    };
    const onMove = (ev: PointerEvent) => {
      y = ev.clientY;
      follow();
    };
    const blockScroll = (ev: TouchEvent) => ev.preventDefault();
    const finish = (commit: boolean) => {
      const d = dragRef.current;
      setDrag(null);
      if (!commit || !d) return;
      const current = draftRef.current.sections;
      const moved = current.find((x) => x.id === d.id);
      if (!moved) return;
      const rest = current.filter((x) => x.id !== d.id);
      rest.splice(d.target, 0, moved);
      if (rest.some((x, i) => x.id !== current[i].id)) update({ ...draftRef.current, sections: rest });
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === `Escape`) finish(false);
    };
    const timer = window.setInterval(() => {
      const edge = 80;
      const speed = y < edge ? -(edge - y) / 4 : y > window.innerHeight - edge ? (y - (window.innerHeight - edge)) / 4 : 0;
      if (!speed) return;
      const sc = scroller();
      if (sc) sc.scrollBy(0, speed);
      else window.scrollBy(0, speed);
      follow();
    }, 16);
    window.addEventListener(`pointermove`, onMove);
    window.addEventListener(`pointerup`, onUp);
    window.addEventListener(`pointercancel`, onCancel);
    window.addEventListener(`keydown`, onKey);
    window.addEventListener(`touchmove`, blockScroll, { passive: false });
    document.documentElement.classList.add(`is-dragging`);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(`pointermove`, onMove);
      window.removeEventListener(`pointerup`, onUp);
      window.removeEventListener(`pointercancel`, onCancel);
      window.removeEventListener(`keydown`, onKey);
      window.removeEventListener(`touchmove`, blockScroll);
      document.documentElement.classList.remove(`is-dragging`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  // Sections fold to their headers while dragging; keep the grabbed one under the pointer.
  const dragId = drag?.id;
  useLayoutEffect(() => {
    if (!dragId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-section-id="${dragId}"]`);
    const y = dragRef.current?.y;
    if (!el || y === undefined) return;
    const delta = el.getBoundingClientRect().top + 24 - y;
    const sc = scroller();
    if (sc) sc.scrollBy(0, delta);
    else window.scrollBy(0, delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === `s`) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener(`keydown`, onKey);
    return () => window.removeEventListener(`keydown`, onKey);
  });

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener(`beforeunload`, onBeforeUnload);
    return () => window.removeEventListener(`beforeunload`, onBeforeUnload);
  }, [dirty]);

  if (songId && !stored && !dirty) {
    return (
      <div className="page">
        <PageHeader title="Song not found" onBack={() => navigate({ name: `songs` })} />
      </div>
    );
  }

  const keyIndex = noteIndex(draft.key);
  const previewCtx = { songKey: keyIndex, playKey: keyIndex, scaleId: draft.scaleId, songCapo: draft.capo, capo: draft.capo, display: `sounding` as const };

  // Sections other than the one being dragged; drop positions are indexes into this list.
  const others = drag ? draft.sections.filter((x) => x.id !== drag.id) : draft.sections;

  const editor = (
    <div className={`song-editor__form${drag ? ` song-editor__form--dragging` : ``}`}>
      <fieldset className="card song-editor__details">
        <Field label="Song name" wide>
          <input className="input" value={draft.title} onChange={(e) => set(`title`, e.target.value)} placeholder="Song name" autoFocus={!stored} />
        </Field>
        <Field label="Artist" wide>
          <input className="input" value={draft.artist} onChange={(e) => set(`artist`, e.target.value)} placeholder="Artist name" />
        </Field>
        <Field label="Key">
          <select className="input" value={draft.key} onChange={(e) => set(`key`, e.target.value as NoteName)}>
            {KEYS.map((k) => (
              <option key={k.root} value={k.root}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <ScaleSelector scaleId={draft.scaleId} onChange={(v) => set(`scaleId`, v)} id="song-scale" />
        </div>
        <Field label="Tuning">
          <select
            className="input"
            value={draft.tuningId}
            onChange={(e) => {
              const tuning = getTuning(e.target.value);
              update(fitTabsToStrings({ ...draft, tuningId: tuning.id }, tuning.strings.length));
            }}
          >
            {INSTRUMENTS.map((inst) => (
              <optgroup key={inst.id} label={inst.label}>
                {TUNINGS.filter((t) => t.instrument === inst.id).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Capo">
          <select className="input" value={draft.capo} onChange={(e) => set(`capo`, Number(e.target.value))}>
            {CAPO_FRETS.map((f) => (
              <option key={f} value={f}>
                {capoLabel(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="BPM">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={20}
            max={400}
            value={draft.bpm ?? ``}
            onChange={(e) => set(`bpm`, e.target.value ? Number(e.target.value) : null)}
            placeholder="—"
          />
        </Field>
        <Field label="Time">
          <select className="input" value={draft.timeSignature} onChange={(e) => set(`timeSignature`, e.target.value)}>
            {TIME_SIGNATURES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Song notes" wide>
          <textarea className="input" rows={2} value={draft.notes} onChange={(e) => set(`notes`, e.target.value)} placeholder="Feel, arrangement, who starts…" />
        </Field>
      </fieldset>

      {draft.sections.length > 0 ? (
        <div className="song-editor__sections-bar">
          <span className="field__label">
            {draft.sections.length} section{draft.sections.length === 1 ? `` : `s`}
          </span>
          <label className="ex-check">
            <input
              type="checkbox"
              checked={draft.sections.every((x) => collapsed.has(x.id))}
              onChange={(e) => setCollapsed(e.target.checked ? new Set(draft.sections.map((x) => x.id)) : new Set())}
            />
            {draft.sections.every((x) => collapsed.has(x.id)) ? `Collapsed — uncheck to expand all` : `Collapse all`}
          </label>
        </div>
      ) : (
        <div className="card song-editor__empty">
          <p className="empty__title">Build your song's structure</p>
          <p>Add sections in the order you play them — Intro, Verse, Chorus… or name your own. You can drag them around later.</p>
        </div>
      )}
      <div className="song-editor__sections" ref={listRef}>
        {draft.sections.map((section, i) => (
          <div key={section.id} className="song-editor__slot">
            {drag && drag.id !== section.id && drag.target === others.findIndex((x) => x.id === section.id) && <div className="drop-line" aria-hidden />}
            <SectionEditor
          dragging={drag?.id === section.id}
          onDragStart={(e) => pressSection(section.id, e)}
          open={!collapsed.has(section.id)}
          onToggle={() => toggleSection(section.id)}
          section={section}
          song={draft}
          index={i}
          count={draft.sections.length}
          onChange={(s) => setSections(draft.sections.map((x) => (x.id === s.id ? s : x)))}
          onMove={(dir) => setSections(moveItem(draft.sections, i, i + dir))}
          onDuplicate={() => {
            const copy = structuredClone(section);
            copy.id = newId();
            copy.tabs = copy.tabs.map((t) => ({ ...t, id: newId() }));
            copy.label = nextSectionLabel(draft.sections, section.type);
            const next = [...draft.sections];
            next.splice(i + 1, 0, copy);
            setSections(next);
          }}
          onDelete={() => confirm(`Delete “${section.label}”?`) && setSections(draft.sections.filter((x) => x.id !== section.id))}
            />
          </div>
        ))}
        {drag && drag.target === others.length && <div className="drop-line" aria-hidden />}
      </div>

      <div className="card add-section">
        <span className="field__label">Add section</span>
        <div className="add-section__buttons">
          {SECTION_TYPES.filter((t) => t.id !== `custom`).map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip-btn"
              onClick={() => addSection(createSection(t.id, nextSectionLabel(draft.sections, t.id)))}
            >
              + {t.label}
            </button>
          ))}
        </div>
        <form
          className="add-section__custom"
          onSubmit={(e) => {
            e.preventDefault();
            const name = customName.trim();
            if (!name) return;
            addSection(createSection(`custom`, name));
            setCustomName(``);
          }}
        >
          <input
            className="input input--compact"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Your own section name, e.g. Tag, Solo, Breakdown"
            aria-label="Custom section name"
          />
          <button type="submit" className="btn btn--small" disabled={!customName.trim()}>
            + Add custom
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="page song-editor">
      <PageHeader title={stored ? `Edit song` : `New song`} onBack={leave}>
        {!sideBySide && (
          <button type="button" className="btn btn--ghost" onClick={() => setPreview((p) => !p)}>
            {preview ? `Edit` : `Preview`}
          </button>
        )}
        {stored && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              const r = await shareFile(songFile(draft), songDisplayName(draft));
              if (r === `copied`) toast(`Share link copied — paste it in a message`);
            }}
          >
            Share
          </button>
        )}
        {stored && (
          <button type="button" className="btn btn--ghost" onClick={() => saveJsonFile(`${fileSlug(draft.title, draft.artist)}.nashdial-song.json`, songFile(draft))}>
            Export
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty}>
          {dirty ? `Save` : `Saved`}
        </button>
      </PageHeader>
      <div className={`song-editor__layout${sideBySide ? ` song-editor__layout--split` : ``}`}>
        {(sideBySide || !preview) && editor}
        {(sideBySide || preview) && (
          <div className="song-editor__preview card">
            <SongSheet song={draft} ctx={previewCtx} />
          </div>
        )}
      </div>
    </div>
  );
}
