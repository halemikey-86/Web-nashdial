import { useEffect, useMemo, useRef, useState } from 'react';
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
import { createSection, createSong, createTabBlock, emptyColumn, newId, nextSectionLabel, songDisplayName } from './model';
import { fileSlug, saveJsonFile, songFile } from './io';
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
}

function SectionEditor({ section, song, index, count, onChange, onMove, onDuplicate, onDelete }: SectionEditorProps) {
  const [open, setOpen] = useState(true);
  const chordsRef = useRef<HTMLTextAreaElement>(null);
  const tuning = getTuning(song.tuningId);
  const labels = stringLabels(tuning);
  const palette = useMemo(() => diatonicChords(song.key, song.scaleId), [song.key, song.scaleId]);
  const set = <K extends keyof Section>(key: K, value: Section[K]) => onChange({ ...section, [key]: value });

  return (
    <div className={`section-editor section-editor--${section.type}`}>
      <div className="section-editor__head">
        <button
          type="button"
          className="section-editor__toggle"
          onClick={() => setOpen((o) => !o)}
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
        <input className="input input--compact section-editor__label" value={section.label} onChange={(e) => set(`label`, e.target.value)} aria-label="Section name" />
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

  const editor = (
    <div className="song-editor__form">
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
        <Field label="Song notes" wide>
          <textarea className="input" rows={2} value={draft.notes} onChange={(e) => set(`notes`, e.target.value)} placeholder="Feel, arrangement, who starts…" />
        </Field>
      </fieldset>

      {draft.sections.map((section, i) => (
        <SectionEditor
          key={section.id}
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
      ))}

      <div className="card add-section">
        <span className="field__label">Add section</span>
        <div className="add-section__buttons">
          {SECTION_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip-btn"
              onClick={() => setSections([...draft.sections, createSection(t.id, nextSectionLabel(draft.sections, t.id))])}
            >
              + {t.label}
            </button>
          ))}
        </div>
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
