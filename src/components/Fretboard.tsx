import { useMemo, type CSSProperties } from 'react';
import { buildFretboard } from '../music/fretboard';
import { displayNote } from '../music/notes';
import type { Tuning } from '../music/tunings';

export type FretboardView = 'blocks' | 'dots';

const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

function FretboardViewToggle({ view, onChange }: { view: FretboardView; onChange: (v: FretboardView) => void }) {
  return (
    <div className="fretboard-view-toggle" role="group" aria-label="Fretboard display">
      {([`blocks`, `dots`] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`fretboard-view-toggle__btn${view === v ? ` fretboard-view-toggle__btn--active` : ``}`}
          onClick={() => onChange(v)}
          aria-pressed={view === v}
        >
          {v === `blocks` ? `Blocks` : `Dots`}
        </button>
      ))}
    </div>
  );
}

interface FretboardProps {
  tuning: Tuning;
  root: string;
  scaleId: string;
  capoFret?: number;
  view: FretboardView;
  onViewChange: (v: FretboardView) => void;
  fretCount?: number;
  compact?: boolean;
}

export function Fretboard({ tuning, root, scaleId, capoFret = 0, view, onViewChange, fretCount = 15, compact = false }: FretboardProps) {
  const rows = useMemo(() => buildFretboard(tuning, root, scaleId, fretCount), [tuning, root, scaleId, fretCount]);
  const columns = rows[0]?.length ?? fretCount;
  const hasCapo = capoFret > 0;

  return (
    <div className={`fretboard fretboard--${view}${compact ? ` fretboard--compact` : ``}`}>
      <div className="fretboard__header">
        <FretboardViewToggle view={view} onChange={onViewChange} />
      </div>
      {hasCapo && (
        <p className="fretboard__capo-note">Capo on fret {capoFret} — scale shows sounding pitches above the capo.</p>
      )}
      <div className="fretboard__scroll">
        <div
          className={`fretboard__board${hasCapo ? ` fretboard__board--capo` : ``}`}
          style={{ '--fret-count': columns, '--string-count': tuning.strings.length, '--capo-fret': capoFret } as CSSProperties}
        >
          {hasCapo && <div className="fretboard__capo-bar" aria-hidden title={`Capo fret ${capoFret}`} />}
          <div className="fretboard__fret-numbers">
            <div className="fretboard__string-label" />
            {Array.from({ length: columns }, (_, fret) => (
              <div key={fret} className={`fretboard__fret-num${fret === capoFret && hasCapo ? ` fretboard__fret-num--capo` : ``}`}>
                {fret}
                {INLAY_FRETS.includes(fret) && <span className="fretboard__marker-dot" />}
              </div>
            ))}
          </div>
          {rows.map((cells, s) => (
            <div key={s} className={`fretboard__string-row ${s % 2 === 1 ? `fretboard__string-row--alt` : ``}`}>
              <div className="fretboard__string-label">{displayNote(tuning.strings[s])}</div>
              {cells.map((cell) => {
                const blocked = hasCapo && cell.fret < capoFret;
                const isRoot = cell.degree === 1;
                const name = displayNote(cell.note);
                const lit = cell.inScale && !blocked;
                return (
                  <div
                    key={`${s}-${cell.fret}`}
                    className={[
                      `fretboard__cell`,
                      lit ? `fretboard__cell--in-scale` : ``,
                      blocked ? `fretboard__cell--blocked` : ``,
                      cell.fret === capoFret && hasCapo ? `fretboard__cell--capo` : ``,
                      isRoot && lit ? `fretboard__cell--root` : ``,
                    ]
                      .filter(Boolean)
                      .join(` `)}
                  >
                    {lit && view === `blocks` && <span className="fretboard__note-name">{name}</span>}
                    {lit && view === `dots` && (
                      <span className={`fretboard__scale-dot${isRoot ? ` fretboard__scale-dot--root` : ``}`} title={name}>
                        {name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
