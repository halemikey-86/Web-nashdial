import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { noteIndex, noteAt, type NoteName } from '../music/notes';
import { navigate } from '../router';
import { useLibrary } from './library';
import { songDisplayName } from './model';
import { SongStage } from './SongStage';
import type { Song } from './types';

export type OpenInDial = (song: Song, playKey: number, capo: number) => void;

/** A song from the library. Key and capo changes here are for this session only. */
export function SongView({ songId, onOpenInDial }: { songId: string; onOpenInDial: OpenInDial }) {
  const library = useLibrary();
  const song = library.getSong(songId);
  const [playKey, setPlayKey] = useState(() => (song ? noteIndex(song.key) : 0));
  const [capo, setCapo] = useState(() => song?.capo ?? 0);

  if (!song) {
    return (
      <div className="page">
        <PageHeader title="Song not found" onBack={() => navigate({ name: `songs` })} backLabel="Songs" />
      </div>
    );
  }

  return (
    <SongStage
      song={song}
      playKey={playKey}
      capo={capo}
      onPlayKeyChange={setPlayKey}
      onCapoChange={setCapo}
      onBack={() => navigate({ name: `songs` })}
      backLabel="Songs"
      onEdit={() => navigate({ name: `song-edit`, id: song.id })}
      onOpenInDial={() => onOpenInDial(song, playKey, capo)}
      keyNote={playKey !== noteIndex(song.key) ? `Key changes here aren't saved. Set a key per setlist song to keep it.` : undefined}
    />
  );
}

/** Playing through a setlist. Key and capo changes are saved to this setlist entry. */
export function SetPlay({ setlistId, index, onOpenInDial }: { setlistId: string; index: number; onOpenInDial: OpenInDial }) {
  const library = useLibrary();
  const setlist = library.getSetlist(setlistId);

  if (!setlist || setlist.items.length === 0) {
    return (
      <div className="page">
        <PageHeader title={setlist ? `This set is empty` : `Setlist not found`} onBack={() => navigate({ name: `sets` })} backLabel="Setlists" />
      </div>
    );
  }

  const i = Math.min(index, setlist.items.length - 1);
  const item = setlist.items[i];
  const song = library.getSong(item.songId);
  const titleAt = (j: number) => {
    const it = setlist.items[j];
    if (!it) return null;
    const s = library.getSong(it.songId);
    return s ? songDisplayName(s) : `Missing song`;
  };
  const go = (j: number) => {
    if (j >= 0 && j < setlist.items.length) navigate({ name: `set-play`, id: setlist.id, index: j }, { replace: true });
  };
  const nav = {
    index: i,
    count: setlist.items.length,
    prevTitle: titleAt(i - 1),
    nextTitle: titleAt(i + 1),
    onPrev: () => go(i - 1),
    onNext: () => go(i + 1),
  };

  if (!song) {
    return (
      <div className="page">
        <PageHeader title="Missing song" onBack={() => navigate({ name: `set`, id: setlist.id })} backLabel={setlist.name} />
        <p className="list-empty card">This song isn't in your library. Import its file from the setlist page to restore it.</p>
        <div className="empty__actions">
          <button type="button" className="btn" onClick={nav.onPrev} disabled={i === 0}>
            ← Prev
          </button>
          <button type="button" className="btn" onClick={nav.onNext} disabled={i === setlist.items.length - 1}>
            Next →
          </button>
        </div>
      </div>
    );
  }

  const playKey = noteIndex(item.key ?? song.key);
  const capo = item.capo ?? song.capo;
  const saveItem = (patch: { key?: NoteName | null; capo?: number | null }) =>
    library.saveSetlist({ ...setlist, items: setlist.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <SongStage
      key={item.id}
      song={song}
      playKey={playKey}
      capo={capo}
      onPlayKeyChange={(k) => saveItem({ key: k === noteIndex(song.key) ? null : noteAt(k) })}
      onCapoChange={(c) => saveItem({ capo: c === song.capo ? null : c })}
      onBack={() => navigate({ name: `set`, id: setlist.id })}
      backLabel={setlist.name || `Setlist`}
      onEdit={() => navigate({ name: `song-edit`, id: song.id })}
      onOpenInDial={() => onOpenInDial(song, playKey, capo)}
      nav={nav}
      keyNote={`Key and capo are saved to “${setlist.name}”.`}
    />
  );
}
