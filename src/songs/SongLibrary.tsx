import { useMemo, useState } from 'react';
import { PageHeader, useToast } from '../components/ui';
import { KEYS, noteIndex } from '../music/notes';
import { getScale } from '../music/scales';
import { navigate } from '../router';
import { fileSlug, libraryFile, saveJsonFile, songFile } from './io';
import { extractShareCode, shareFile } from './share';
import { useLibrary } from './library';
import { createSetlist, createSetlistItem, songDisplayName } from './model';
import { useImport } from './useImport';
import type { Song } from './types';

function SongRow({ song }: { song: Song }) {
  const library = useLibrary();
  const toast = useToast();
  const [menu, setMenu] = useState(false);

  const addToSet = (value: string) => {
    if (!value) return;
    if (value === `__new`) {
      const list = { ...createSetlist(), items: [createSetlistItem(song.id)] };
      library.saveSetlist(list);
      toast(`Created “${list.name}” with this song`);
      navigate({ name: `set`, id: list.id });
      return;
    }
    library.addSongsToSetlist(value, [song.id]);
    toast(`Added to “${library.getSetlist(value)?.name}”`);
    setMenu(false);
  };

  return (
    <li className="list-row">
      <button type="button" className="list-row__main" onClick={() => navigate({ name: `song`, id: song.id })}>
        <span className="list-row__title">{songDisplayName(song)}</span>
        <span className="list-row__sub">
          {song.artist || `Unknown artist`} · {KEYS[noteIndex(song.key)].label} {getScale(song.scaleId).shortName}
          {song.capo > 0 && ` · Capo ${song.capo}`}
        </span>
      </button>
      <div className="list-row__actions">
        <button type="button" className="btn btn--small" onClick={() => navigate({ name: `song-edit`, id: song.id })}>
          Edit
        </button>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="More actions">
          ⋯
        </button>
      </div>
      {menu && (
        <div className="list-row__menu">
          <select className="input input--compact" value="" onChange={(e) => addToSet(e.target.value)} aria-label="Add to setlist">
            <option value="">Add to setlist…</option>
            {library.setlists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new">+ New setlist</option>
          </select>
          <button
            type="button"
            className="btn btn--small"
            onClick={async () => {
              const r = await shareFile(songFile(song), songDisplayName(song));
              if (r === `copied`) toast(`Share link copied — paste it in a message`);
            }}
          >
            Share
          </button>
          <button type="button" className="btn btn--small" onClick={() => saveJsonFile(`${fileSlug(song.title, song.artist)}.nashdial-song.json`, songFile(song))}>
            Export
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              const copy = library.duplicateSong(song.id);
              if (copy) toast(`Duplicated as “${copy.title}”`);
              setMenu(false);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="btn btn--small btn--danger"
            onClick={() => {
              const uses = library.setlists.filter((l) => l.items.some((i) => i.songId === song.id)).length;
              const warn = uses ? `\n\nIt will also be removed from ${uses} setlist${uses === 1 ? `` : `s`}.` : ``;
              if (confirm(`Delete “${songDisplayName(song)}”?${warn}`)) library.deleteSong(song.id);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

export function SongLibrary() {
  const library = useLibrary();
  const runImport = useImport();
  const [query, setQuery] = useState(``);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState(``);
  const submitPaste = () => {
    const code = extractShareCode(pasted);
    if (code) navigate({ name: `share`, code });
    else runImport.fromText(pasted);
    setPasted(``);
    setPasting(false);
  };

  const songs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...library.songs]
      .filter((s) => !q || `${s.title} ${s.artist}`.toLowerCase().includes(q))
      .sort((a, b) => songDisplayName(a).localeCompare(songDisplayName(b)));
  }, [library.songs, query]);

  return (
    <div className="page">
      <PageHeader title="Songs">
        <button type="button" className="btn btn--ghost" onClick={() => runImport()} title="NashDial files, chord sheets (.txt), ChordPro, PDF or MusicXML">
          Import
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setPasting((p) => !p)} aria-expanded={pasting}>
          Paste
        </button>
        <button type="button" className="btn btn--primary" onClick={() => navigate({ name: `song-edit`, id: null })}>
          + New song
        </button>
      </PageHeader>
      {pasting && (
        <div className="card paste-panel">
          <span className="field__label">Paste a share link, or a chord sheet copied from anywhere</span>
          <textarea
            className="input input--mono"
            rows={8}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={`Amazing Grace - Traditional\nKey: G\n\n[Verse 1]\nG        G7       C       G\nAmazing grace, how sweet the sound…`}
            autoFocus
          />
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={submitPaste} disabled={!pasted.trim()}>
              {extractShareCode(pasted) ? `Open shared song / setlist` : `Make a song from this`}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {library.songs.length > 0 && (
        <input className="input search" type="search" placeholder="Search songs or artists" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {library.songs.length === 0 ? (
        <div className="empty card">
          <p className="empty__title">No songs yet</p>
          <p>Tab out a song — chords, lead lines and single notes for each section — then pull it up on stage in any key.</p>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={() => navigate({ name: `song-edit`, id: null })}>
              + New song
            </button>
            <button type="button" className="btn" onClick={() => runImport()}>
              Import a file (chord sheet, PDF, ChordPro, MusicXML…)
            </button>
          </div>
        </div>
      ) : (
        <ul className="list">
          {songs.map((s) => (
            <SongRow key={s.id} song={s} />
          ))}
          {songs.length === 0 && <li className="list-empty">No songs match “{query}”.</li>}
        </ul>
      )}
      {library.songs.length > 0 && (
        <div className="page-footer">
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => saveJsonFile(`nashdial-library-${new Date().toISOString().slice(0, 10)}.json`, libraryFile(library.songs, library.setlists))}
          >
            Back up everything (all songs + setlists)
          </button>
        </div>
      )}
    </div>
  );
}
