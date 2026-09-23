import { useMemo, type CSSProperties } from 'react';
import { CAGED, type CagedShape } from '../music/chordShapes';
import { SHAPE_COLORS, cagedPositions, shapeFill, shapesAt, type ShapePosition } from '../music/cagedPositions';
import { buildFretboard, type FretCell } from '../music/fretboard';
import { displayNote } from '../music/notes';
import type { Tuning } from '../music/tunings';
import { Neck, NeckMarker } from './Neck';
import { NECK_FRETS } from './neckGeometry';

export type FretboardView = 'blocks' | 'dots' | 'shapes';
export type FretboardBoard = 'grid' | 'neck';

const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="fretboard-view-toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`fretboard-view-toggle__btn${value === o.id ? ` fretboard-view-toggle__btn--active` : ``}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Color chips for the five CAGED shapes. Tapping one while all are showing solos it. */
export function ShapeChips({ visible, onChange }: { visible: ReadonlySet<CagedShape>; onChange: (next: Set<CagedShape>) => void }) {
  const all = visible.size === CAGED.length;
  const tap = (shape: CagedShape) => {
    if (all) return onChange(new Set([shape]));
    const next = new Set(visible);
    if (next.has(shape)) next.delete(shape);
    else next.add(shape);
    onChange(next.size ? next : new Set(CAGED));
  };
  return (
    <div className="shape-chips" role="group" aria-label="Shapes to show">
      {CAGED.map((shape) => {
        const c = SHAPE_COLORS[shape];
        const on = visible.has(shape);
        return (
          <button
            key={shape}
            type="button"
            className={`shape-chip${on ? ` shape-chip--on` : ``}`}
            style={{ '--chip': c.fill, '--chip-text': c.text } as CSSProperties}
            aria-pressed={on}
            onClick={() => tap(shape)}
            title={`${c.name} = ${shape} shape`}
          >
            <span className="shape-chip__block" aria-hidden />
            {shape} <span className="shape-chip__name">{c.name}</span>
          </button>
        );
      })}
      <button type="button" className="shape-chip shape-chip--all" disabled={all} onClick={() => onChange(new Set(CAGED))}>
        All
      </button>
      <span className="shape-chips__hint">{all ? `Tap a color to practice just that shape` : `Tap more colors to add them`}</span>
    </div>
  );
}

function GridBoard({
  rows,
  tuning,
  capoFret,
  view,
  positions,
  visible,
}: {
  rows: FretCell[][];
  tuning: Tuning;
  capoFret: number;
  view: FretboardView;
  positions: ShapePosition[];
  visible: ReadonlySet<CagedShape>;
}) {
  const columns = rows[0]?.length ?? 0;
  const hasCapo = capoFret > 0;
  return (
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
              const shapes = view === `shapes` && lit ? shapesAt(positions, cell.fret, visible) : [];
              const showLit = lit && (view !== `shapes` || shapes.length > 0);
              return (
                <div
                  key={`${s}-${cell.fret}`}
                  className={[
                    `fretboard__cell`,
                    showLit && view !== `shapes` ? `fretboard__cell--in-scale` : ``,
                    blocked ? `fretboard__cell--blocked` : ``,
                    cell.fret === capoFret && hasCapo ? `fretboard__cell--capo` : ``,
                    isRoot && showLit && view !== `shapes` ? `fretboard__cell--root` : ``,
                  ]
                    .filter(Boolean)
                    .join(` `)}
                >
                  {showLit && view === `blocks` && <span className="fretboard__note-name">{name}</span>}
                  {showLit && view === `dots` && (
                    <span className={`fretboard__scale-dot${isRoot ? ` fretboard__scale-dot--root` : ``}`} title={name}>
                      {name}
                    </span>
                  )}
                  {shapes.length > 0 && (
                    <span
                      className={`tetris-block${isRoot ? ` tetris-block--root` : ``}`}
                      style={{ background: shapeFill(shapes), color: SHAPE_COLORS[shapes[0]].text }}
                      title={`${name} · ${shapes.map((sh) => `${sh} shape`).join(` + `)}`}
                    >
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
  );
}

function NeckBoard({
  rows,
  tuning,
  capoFret,
  view,
  positions,
  visible,
}: {
  rows: FretCell[][];
  tuning: Tuning;
  capoFret: number;
  view: FretboardView;
  positions: ShapePosition[];
  visible: ReadonlySet<CagedShape>;
}) {
  const count = tuning.strings.length;
  return (
    <Neck stringCount={count} capo={capoFret} className="fretboard__neck" label="Scale notes on a guitar neck">
      {rows.flatMap((cells, s) =>
        cells.map((cell) => {
          if (!cell.inScale || (capoFret > 0 && cell.fret < capoFret)) return null;
          const name = displayNote(cell.note);
          const isRoot = cell.degree === 1;
          if (view === `shapes`) {
            const shapes = shapesAt(positions, cell.fret, visible);
            if (!shapes.length) return null;
            return (
              <NeckMarker
                key={`${s}-${cell.fret}`}
                string={s}
                stringCount={count}
                fret={cell.fret}
                label={name}
                variant="shape"
                root={isRoot}
                fills={shapes.map((sh) => SHAPE_COLORS[sh].fill)}
                textColor={SHAPE_COLORS[shapes[0]].text}
              />
            );
          }
          return <NeckMarker key={`${s}-${cell.fret}`} string={s} stringCount={count} fret={cell.fret} label={name} variant={view === `blocks` ? `block` : `dot`} root={isRoot} />;
        }),
      )}
    </Neck>
  );
}

interface FretboardProps {
  tuning: Tuning;
  root: string;
  scaleId: string;
  capoFret?: number;
  view: FretboardView;
  onViewChange: (v: FretboardView) => void;
  board: FretboardBoard;
  onBoardChange: (b: FretboardBoard) => void;
  visibleShapes: ReadonlySet<CagedShape>;
  onVisibleShapesChange: (s: Set<CagedShape>) => void;
  fretCount?: number;
  compact?: boolean;
}

export function Fretboard({
  tuning,
  root,
  scaleId,
  capoFret = 0,
  view,
  onViewChange,
  board,
  onBoardChange,
  visibleShapes,
  onVisibleShapesChange,
  fretCount = 15,
  compact = false,
}: FretboardProps) {
  const frets = board === `neck` ? NECK_FRETS : fretCount;
  const rows = useMemo(() => buildFretboard(tuning, root, scaleId, frets), [tuning, root, scaleId, frets]);
  const positions = useMemo(() => cagedPositions(tuning, root, scaleId, capoFret, frets), [tuning, root, scaleId, capoFret, frets]);

  return (
    <div className={`fretboard fretboard--${view} fretboard--board-${board}${compact ? ` fretboard--compact` : ``}`}>
      <div className="fretboard__header">
        <Toggle
          label="Board style"
          value={board}
          onChange={onBoardChange}
          options={[
            { id: `grid`, label: `Grid` },
            { id: `neck`, label: `Guitar` },
          ]}
        />
        <Toggle
          label="Fretboard display"
          value={view}
          onChange={onViewChange}
          options={[
            { id: `blocks`, label: `Blocks` },
            { id: `dots`, label: `Dots` },
            { id: `shapes`, label: `Shapes` },
          ]}
        />
      </div>
      {view === `shapes` && <ShapeChips visible={visibleShapes} onChange={onVisibleShapesChange} />}
      {capoFret > 0 && <p className="fretboard__capo-note">Capo on fret {capoFret} — scale shows sounding pitches above the capo.</p>}
      {board === `neck` ? (
        <NeckBoard rows={rows} tuning={tuning} capoFret={capoFret} view={view} positions={positions} visible={visibleShapes} />
      ) : (
        <GridBoard rows={rows} tuning={tuning} capoFret={capoFret} view={view} positions={positions} visible={visibleShapes} />
      )}
    </div>
  );
}
