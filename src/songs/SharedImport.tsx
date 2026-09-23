import { useEffect, useState } from 'react';
import { PageHeader, useToast } from '../components/ui';
import { navigate } from '../router';
import { parseImport, type ParsedImport } from './io';
import { useLibrary } from './library';
import { songDisplayName } from './model';
import { decodeShare } from './share';

/** Opened from a share link: preview what's in it and add it to this device's library. */
export function SharedImport({ code }: { code: string }) {
  const library = useLibrary();
  const toast = useToast();
  const [data, setData] = useState<ParsedImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    decodeShare(code)
      .then((json) => setData(parseImport(json)))
      .catch(() => setError(`This share link is incomplete or damaged. Ask for it to be sent again.`));
  }, [code]);

  const add = () => {
    if (!data) return;
    const result = library.importData(data);
    toast(result.message);
    if (data.kind === `setlist` && result.setlistIds[0]) navigate({ name: `set`, id: result.setlistIds[0] }, { replace: true });
    else if (data.songs.length === 1 && result.songIds[0]) navigate({ name: `song`, id: result.songIds[0] }, { replace: true });
    else navigate({ name: `songs` }, { replace: true });
  };

  const existing = new Set(library.songs.map((s) => s.id));
  return (
    <div className="page shared-import">
      <PageHeader title="Shared with you" onBack={() => navigate({ name: `songs` })} backLabel="Songs" />
      {error && <p className="list-empty card">{error}</p>}
      {!data && !error && <p className="list-empty card">Opening…</p>}
      {data && (
        <div className="card shared-import__card">
          {data.setlists.map((l) => (
            <p key={l.id} className="shared-import__title">
              Setlist: <strong>{l.name}</strong> · {l.items.length} song{l.items.length === 1 ? `` : `s`}
            </p>
          ))}
          <ul className="shared-import__songs">
            {data.songs.map((s) => (
              <li key={s.id}>
                <strong>{songDisplayName(s)}</strong>
                {s.artist && ` — ${s.artist}`}
                {existing.has(s.id) && <span className="shared-import__badge">already in your library — will update</span>}
              </li>
            ))}
          </ul>
          <div className="empty__actions">
            <button type="button" className="btn btn--primary" onClick={add}>
              Add to my library
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate({ name: `songs` })}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
