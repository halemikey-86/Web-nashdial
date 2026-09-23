import { useMemo, useState } from 'react';
import { Field, PageHeader, useToast } from '../components/ui';
import { CAPO_FRETS, KEYS, capoLabel, type NoteName } from '../music/notes';
import { navigate } from '../router';
import { fileSlug, saveJsonFile, setlistFile } from './io';
import { shareFile } from './share';
import { useLibrary } from './library';
import { createSetlist, songDisplayName } from './model';
import { useImport } from './useImport';
import type { Setlist, SetlistItem } from './types';

export function SetlistList() {
  const library = useLibrary();
  const runImport = useImport();

  const create = () => {
    const list = createSetlist();
    library.saveSetlist(list);
    navigate({ name: `set`, id: list.id });
  };

  const lists = [...library.setlists].sort((a, b) => (b.date || b.updatedAt).localeCompare(a.date || a.updatedAt));

  return (
    <div className="page">
      <PageHeader title="Setlists">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            const result = await runImport();
            if (result?.setlistIds.length === 1) navigate({ name: `set`, id: result.setlistIds[0] });
          }}
        >
          Import
        </button>
        <button type="button" className="btn btn--primary" onClick={create}>
          + New setlist
        </button>
      </PageHeader>
      {lists.length === 0 ? (
        <div className="empty card">
          <p className="empty__title">No setlists yet</p>
          <p>Build a set from your songs, pick the key for each one, then play through it with Next / Prev.</p>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={create}>
              + New setlist
            </button>
          </div>
        </div>
      ) : (
        <ul className="list">
          {lists.map((l) => (
            <li key={l.id} className="list-row">
              <button type="button" className="list-row__main" onClick={() => navigate({ name: `set`, id: l.id })}>
                <span className="list-row__title">{l.name}</span>
                <span className="list-row__sub">
                  {l.date && `${l.date} · `}
                  {l.items.length} song{l.items.length === 1 ? `` : `s`}
                </span>
              </button>
              <div className="list-row__actions">
                <button type="button" className="btn btn--small btn--primary" disabled={!l.items.length} onClick={() => navigate({ name: `set-play`, id: l.id, index: 0 })}>
                  ▶ Play
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function SongPicker({ setlist, onDone }: { setlist: Setlist; onDone: () => void }) {
  const library = useLibrary();
  const toast = useToast();
  const [query, setQuery] = useState(``);
  const [picked, setPicked] = useState<string[]>([]);
  const inSet = new Set(setlist.items.map((i) => i.songId));
  const songs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...library.songs]
      .filter((s) => !q || `${s.title} ${s.artist}`.toLowerCase().includes(q))
      .sort((a, b) => songDisplayName(a).localeCompare(songDisplayName(b)));
  }, [library.songs, query]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="card picker">
      <div className="picker__head">
        <input className="input" type="search" placeholder="Search your songs" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <button
          type="button"
          className="btn btn--primary"
          disabled={!picked.length}
          onClick={() => {
            library.addSongsToSetlist(setlist.id, picked);
            toast(`Added ${picked.length} song${picked.length === 1 ? `` : `s`}`);
            onDone();
          }}
        >
          Add {picked.length || ``}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
      {library.songs.length === 0 && <p className="list-empty">Your library is empty — create or import songs first.</p>}
      <ul className="picker__list">
        {songs.map((s) => (
          <li key={s.id}>
            <label className="picker__row">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
              <span className="picker__order">{picked.includes(s.id) ? picked.indexOf(s.id) + 1 : ``}</span>
              <span>
                <span className="list-row__title">{songDisplayName(s)}</span>
                <span className="list-row__sub">
                  {s.artist || `Unknown artist`}
                  {inSet.has(s.id) && ` · already in this set`}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SetlistEditor({ setlistId }: { setlistId: string }) {
  const library = useLibrary();
  const toast = useToast();
  const runImport = useImport();
  const setlist = library.getSetlist(setlistId);
  const [picking, setPicking] = useState(false);
  const [swapFrom, setSwapFrom] = useState<number | null>(null);

  if (!setlist) {
    return (
      <div className="page">
        <PageHeader title="Setlist not found" onBack={() => navigate({ name: `sets` })} backLabel="Setlists" />
      </div>
    );
  }

  const save = (patch: Partial<Setlist>) => library.saveSetlist({ ...setlist, ...patch });
  const setItems = (items: SetlistItem[]) => save({ items });
  const updateItem = (index: number, patch: Partial<SetlistItem>) => setItems(setlist.items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const swapWith = (index: number) => {
    if (swapFrom === null) return;
    const items = [...setlist.items];
    [items[swapFrom], items[index]] = [items[index], items[swapFrom]];
    setItems(items);
    setSwapFrom(null);
    toast(`Swapped songs ${swapFrom + 1} and ${index + 1}`);
  };

  return (
    <div className="page setlist-editor">
      <PageHeader title={setlist.name || `Setlist`} onBack={() => navigate({ name: `sets` })} backLabel="Setlists">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={async () => {
            const r = await shareFile(setlistFile(setlist, library.songs), setlist.name || `Setlist`);
            if (r === `copied`) toast(`Share link copied — send it to your band`);
          }}
        >
          Share
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => saveJsonFile(`${fileSlug(setlist.name, setlist.date)}.nashdial-setlist.json`, setlistFile(setlist, library.songs))}>
          Export
        </button>
        <button type="button" className="btn btn--primary" disabled={!setlist.items.length} onClick={() => navigate({ name: `set-play`, id: setlist.id, index: 0 })}>
          ▶ Play set
        </button>
      </PageHeader>

      <fieldset className="card setlist-editor__details">
        <Field label="Setlist name" wide>
          <input className="input" value={setlist.name} onChange={(e) => save({ name: e.target.value })} />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={setlist.date} onChange={(e) => save({ date: e.target.value })} />
        </Field>
        <Field label="Notes" wide>
          <input className="input" value={setlist.notes} onChange={(e) => save({ notes: e.target.value })} placeholder="Venue, band, set length…" />
        </Field>
      </fieldset>

      <div className="setlist-editor__toolbar">
        <button type="button" className="btn" onClick={() => setPicking((p) => !p)}>
          + Add songs from library
        </button>
        <button type="button" className="btn" onClick={() => runImport(setlist.id)}>
          + Import song file into set
        </button>
      </div>

      {picking && <SongPicker setlist={setlist} onDone={() => setPicking(false)} />}

      {swapFrom !== null && (
        <div className="swap-banner">
          Tap <strong>Swap here</strong> on the song to trade places with #{swapFrom + 1}.
          <button type="button" className="btn btn--small" onClick={() => setSwapFrom(null)}>
            Cancel
          </button>
        </div>
      )}

      {setlist.items.length === 0 ? (
        <p className="list-empty card">No songs in this set yet.</p>
      ) : (
        <ol className="set-items">
          {setlist.items.map((item, i) => {
            const song = library.getSong(item.songId);
            const songKey = song?.key ?? `C`;
            return (
              <li key={item.id} className={`set-item${swapFrom === i ? ` set-item--swapping` : ``}${song ? `` : ` set-item--missing`}`}>
                <span className="set-item__num">{i + 1}</span>
                <div className="set-item__info">
                  <button type="button" className="set-item__title" onClick={() => navigate({ name: `set-play`, id: setlist.id, index: i })} disabled={!song}>
                    {song ? songDisplayName(song) : `Missing song`}
                  </button>
                  <span className="list-row__sub">{song ? song.artist || `Unknown artist` : `Import the song file to restore it`}</span>
                </div>
                <div className="set-item__settings">
                  <select
                    className="input input--compact"
                    value={item.key ?? ``}
                    onChange={(e) => updateItem(i, { key: (e.target.value || null) as NoteName | null })}
                    aria-label="Key for this set"
                    disabled={!song}
                  >
                    <option value="">Key: {KEYS.find((k) => k.root === songKey)?.label} (song)</option>
                    {KEYS.map((k) => (
                      <option key={k.root} value={k.root}>
                        Key: {k.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input input--compact"
                    value={item.capo ?? ``}
                    onChange={(e) => updateItem(i, { capo: e.target.value === `` ? null : Number(e.target.value) })}
                    aria-label="Capo for this set"
                    disabled={!song}
                  >
                    <option value="">{capoLabel(song?.capo ?? 0)} (song)</option>
                    {CAPO_FRETS.map((f) => (
                      <option key={f} value={f}>
                        {capoLabel(f)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="set-item__actions">
                  {swapFrom !== null && swapFrom !== i ? (
                    <button type="button" className="btn btn--small btn--primary" onClick={() => swapWith(i)}>
                      Swap here
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn--icon" onClick={() => setItems(moveItem(setlist.items, i, i - 1))} disabled={i === 0} aria-label="Move up">
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon"
                        onClick={() => setItems(moveItem(setlist.items, i, i + 1))}
                        disabled={i === setlist.items.length - 1}
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                      <button type="button" className="btn btn--icon" onClick={() => setSwapFrom(swapFrom === i ? null : i)} aria-label="Swap with another song" title="Swap">
                        ⇅
                      </button>
                      <button
                        type="button"
                        className="btn btn--icon btn--danger"
                        onClick={() => confirm(`Remove “${song ? songDisplayName(song) : `this song`}” from the set?`) && setItems(setlist.items.filter((_, j) => j !== i))}
                        aria-label="Remove from set"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="page-footer">
        <button
          type="button"
          className="btn btn--small btn--danger"
          onClick={() => {
            if (confirm(`Delete the setlist “${setlist.name}”? Your songs stay in the library.`)) {
              library.deleteSetlist(setlist.id);
              navigate({ name: `sets` });
            }
          }}
        >
          Delete setlist
        </button>
      </div>
    </div>
  );
}
