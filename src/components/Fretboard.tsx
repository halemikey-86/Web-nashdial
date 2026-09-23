import { useMemo, type CSSProperties } from 'react';
import { buildFretboard, type FretCell } from '../music/fretboard';
import { displayNote } from '../music/notes';
import { nashvilleLabels } from '../music/scales';
import { PIECE_CELLS, PIECE_INFO, PIECE_ORDER, findPieces, pieceMap, type Piece, type PieceType } from '../music/tetrisShapes';
import type { Tuning } from '../music/tunings';
import { Neck, NeckMarker } from './Neck';
import { fretCount, neckFor } from './neckGeometry';

export type FretboardView = 'blocks' | 'dots' | 'shapes';
export type FretboardBoard = 'grid' | 'neck';
export type FretboardLabels = 'notes' | 'intervals';

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

/** Small drawing of a tetris piece. */
export function PieceIcon({ type, size = 7 }: { type: PieceType; size?: number }) {
  const cells = PIECE_CELLS[type];
  const rows = Math.max(...cells.map((c) => c[0])) + 1;
  const cols = Math.max(...cells.map((c) => c[1])) + 1;
  return (
    <svg className="piece-icon" width={cols * size} height={rows * size} viewBox={`0 0 ${cols * size} ${rows * size}`} aria-hidden>
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c * size + 0.5} y={r * size + 0.5} width={size - 1} height={size - 1} rx={1} style={{ fill: PIECE_INFO[type].color }} />
      ))}
    </svg>
  );
}

/** One chip per piece found on the board. Tapping a chip while all are showing solos it. */
export function PieceChips({
  pieces,
  visible,
  onChange,
}: {
  pieces: Piece[];
  visible: ReadonlySet<PieceType>;
  onChange: (next: Set<PieceType>) => void;
}) {
  const counts = new Map<PieceType, number>();
  for (const p of pieces) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const present = PIECE_ORDER.filter((t) => counts.has(t));
  const all = present.every((t) => visible.has(t));
  const tap = (type: PieceType) => {
    if (all) return onChange(new Set([type]));
    const next = new Set(visible);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(present.some((t) => next.has(t)) ? next : new Set(PIECE_ORDER));
  };
  return (
    <div className="shape-chips" role="group" aria-label="Shapes to show">
      {present.map((type) => {
        const info = PIECE_INFO[type];
        const on = visible.has(type);
        return (
          <button
            key={type}
            type="button"
            className={`shape-chip${on ? ` shape-chip--on` : ``}`}
            style={{ '--chip': info.color } as CSSProperties}
            aria-pressed={on}
            onClick={() => tap(type)}
            title={`${info.name} piece — ${counts.get(type)} on the board`}
          >
            <PieceIcon type={type} />
            {info.name}
            <span className="shape-chip__name">×{counts.get(type)}</span>
          </button>
        );
      })}
      <button type="button" className="shape-chip shape-chip--all" disabled={all} onClick={() => onChange(new Set(PIECE_ORDER))}>
        All
      </button>
      <span className="shape-chips__hint">{all ? `Tap a shape to practice just that one` : `Tap more shapes to add them`}</span>
    </div>
  );
}

interface BoardProps {
  rows: FretCell[][];
  tuning: Tuning;
  capoFret: number;
  view: FretboardView;
  label: (cell: FretCell) => string;
  pieceAt: Map<string, Piece>;
  visible: ReadonlySet<PieceType>;
}

/** Row index as displayed (0 = highest string) for string index s (0 = lowest). */
const displayRow = (s: number, count: number) => count - 1 - s;

function GridBoard({ rows, tuning, capoFret, view, label, pieceAt, visible }: BoardProps) {
  const columns = rows[0]?.length ?? 0;
  const count = rows.length;
  const hasCapo = capoFret > 0;
  // High string on top, like tab and the guitar view.
  const ordered = rows.map((cells, s) => ({ cells, s })).reverse();
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
        {ordered.map(({ cells, s }, r) => (
          <div key={s} className={`fretboard__string-row ${r % 2 === 1 ? `fretboard__string-row--alt` : ``}`}>
            <div className="fretboard__string-label">{displayNote(tuning.strings[s])}</div>
            {cells.map((cell) => {
              const blocked = hasCapo && cell.fret < capoFret;
              const isRoot = cell.degree === 1;
              const text = label(cell);
              const lit = cell.inScale && !blocked;
              const piece = view === `shapes` && lit ? pieceAt.get(`${displayRow(s, count)},${cell.fret}`) : undefined;
              const shown = piece && visible.has(piece.type) ? piece : undefined;
              const plain = lit && view !== `shapes`;
              return (
                <div
                  key={`${s}-${cell.fret}`}
                  className={[
                    `fretboard__cell`,
                    plain ? `fretboard__cell--in-scale` : ``,
                    blocked ? `fretboard__cell--blocked` : ``,
                    cell.fret === capoFret && hasCapo ? `fretboard__cell--capo` : ``,
                    isRoot && plain ? `fretboard__cell--root` : ``,
                  ]
                    .filter(Boolean)
                    .join(` `)}
                >
                  {plain && view === `blocks` && <span className="fretboard__note-name">{text}</span>}
                  {plain && view === `dots` && (
                    <span className={`fretboard__scale-dot${isRoot ? ` fretboard__scale-dot--root` : ``}`} title={displayNote(cell.note)}>
                      {text}
                    </span>
                  )}
                  {shown && (
                    <span
                      className={`tetris-block${isRoot ? ` tetris-block--root` : ``}`}
                      style={{ background: PIECE_INFO[shown.type].color, color: PIECE_INFO[shown.type].text }}
                      title={`${displayNote(cell.note)} · ${PIECE_INFO[shown.type].name} piece`}
                    >
                      {text}
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

function NeckBoard({ rows, tuning, capoFret, view, label, pieceAt, visible }: BoardProps) {
  const count = tuning.strings.length;
  return (
    <Neck stringCount={count} capo={capoFret} className="fretboard__neck" label="Scale notes on the neck">
      {rows.flatMap((cells, s) =>
        cells.map((cell) => {
          if (!cell.inScale || (capoFret > 0 && cell.fret < capoFret)) return null;
          const isRoot = cell.degree === 1;
          if (view === `shapes`) {
            const piece = pieceAt.get(`${displayRow(s, count)},${cell.fret}`);
            if (!piece || !visible.has(piece.type)) return null;
            return (
              <NeckMarker
                key={`${s}-${cell.fret}`}
                string={s}
                stringCount={count}
                fret={cell.fret}
                label={label(cell)}
                variant="shape"
                root={isRoot}
                fills={[PIECE_INFO[piece.type].color]}
                textColor={PIECE_INFO[piece.type].text}
              />
            );
          }
          return (
            <NeckMarker key={`${s}-${cell.fret}`} string={s} stringCount={count} fret={cell.fret} label={label(cell)} variant={view === `blocks` ? `block` : `dot`} root={isRoot} />
          );
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
  labels: FretboardLabels;
  onLabelsChange: (l: FretboardLabels) => void;
  visiblePieces: ReadonlySet<PieceType>;
  onVisiblePiecesChange: (s: Set<PieceType>) => void;
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
  labels,
  onLabelsChange,
  visiblePieces,
  onVisiblePiecesChange,
  fretCount: gridFrets = 15,
  compact = false,
}: FretboardProps) {
  const frets = board === `neck` ? fretCount(neckFor(tuning.strings.length)) : gridFrets;
  const rows = useMemo(() => buildFretboard(tuning, root, scaleId, frets), [tuning, root, scaleId, frets]);
  const pieces = useMemo(() => {
    const lit = [...rows].reverse().map((cells) => cells.map((c) => c.inScale && !(capoFret > 0 && c.fret < capoFret)));
    return findPieces(lit);
  }, [rows, capoFret]);
  const pieceAt = useMemo(() => pieceMap(pieces), [pieces]);
  const degrees = nashvilleLabels(scaleId);
  const label = (cell: FretCell) => (labels === `intervals` && cell.degree ? degrees[cell.degree - 1] : displayNote(cell.note));
  const props: BoardProps = { rows, tuning, capoFret, view, label, pieceAt, visible: visiblePieces };

  return (
    <div className={`fretboard fretboard--${view} fretboard--board-${board}${compact ? ` fretboard--compact` : ``}`}>
      <div className="fretboard__header">
        <Toggle
          label="Board style"
          value={board}
          onChange={onBoardChange}
          options={[
            { id: `grid`, label: `Grid` },
            { id: `neck`, label: tuning.strings.length <= 5 ? `Bass` : `Guitar` },
          ]}
        />
        <Toggle
          label="Note labels"
          value={labels}
          onChange={onLabelsChange}
          options={[
            { id: `notes`, label: `Notes` },
            { id: `intervals`, label: `1-2-3` },
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
      {view === `shapes` && <PieceChips pieces={pieces} visible={visiblePieces} onChange={onVisiblePiecesChange} />}
      {capoFret > 0 && <p className="fretboard__capo-note">Capo on fret {capoFret} — scale shows sounding pitches above the capo.</p>}
      {board === `neck` ? <NeckBoard {...props} /> : <GridBoard {...props} />}
    </div>
  );
}
