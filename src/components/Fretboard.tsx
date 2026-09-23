import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { buildFretboard, type FretCell } from '../music/fretboard';
import { KEYS, displayNote, mod12, noteAt, noteIndex } from '../music/notes';
import { diatonicChords, nashvilleLabels, type ChordQuality } from '../music/scales';
import { PIECE_CELLS, PIECE_INFO, PIECE_ORDER, findPieces, pieceMap, type Piece, type PieceType } from '../music/tetrisShapes';
import { INVERSIONS, INVERSION_INFO, stringSetName, triadVoicings, type Inversion } from '../music/triads';
import type { Tuning } from '../music/tunings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Neck, NeckMarker } from './Neck';
import { fretCount, neckFor } from './neckGeometry';

export type FretboardView = 'blocks' | 'dots' | 'shapes';
export type FretboardBoard = 'grid' | 'neck';
export type FretboardLabels = 'notes' | 'intervals';
type ShapeSource = 'scale' | 'triad';

const TRIAD_INTERVALS: Record<ChordQuality, { third: number; fifth: number; suffix: string }> = {
  major: { third: 4, fifth: 7, suffix: `` },
  minor: { third: 3, fifth: 7, suffix: `m` },
  dim: { third: 3, fifth: 6, suffix: `dim` },
  aug: { third: 4, fifth: 8, suffix: `+` },
};

/** Root, 3rd and 5th of a triad, with the interval label for each note. */
function triadTones(root: string, quality: ChordQuality): Map<string, string> {
  const r = noteIndex(root);
  const q = TRIAD_INTERVALS[quality];
  return new Map([
    [noteAt(r), `R`],
    [noteAt(r + q.third), q.third === 3 ? `♭3` : `3`],
    [noteAt(r + q.fifth), q.fifth === 6 ? `♭5` : q.fifth === 8 ? `♯5` : `5`],
  ]);
}

/** Pick which triad to show: a chord from the key, or any root and quality. */
function TriadPicker({
  keyRoot,
  scaleId,
  root,
  quality,
  onChange,
}: {
  keyRoot: string;
  scaleId: string;
  root: string;
  quality: ChordQuality;
  onChange: (root: string, quality: ChordQuality) => void;
}) {
  const chords = diatonicChords(keyRoot, scaleId);
  const degrees = nashvilleLabels(scaleId);
  return (
    <div className="triad-picker">
      <div className="triad-picker__chords" role="group" aria-label="Triad from the key">
        {chords.map((c, i) => (
          <button
            key={c.degree}
            type="button"
            className={`chip-btn triad-picker__chord${c.root === root && c.quality === quality ? ` triad-picker__chord--on` : ``}`}
            onClick={() => onChange(c.root, c.quality)}
          >
            <span className="triad-picker__degree">{degrees[i]}</span> {c.label}
          </button>
        ))}
      </div>
      <div className="triad-picker__custom">
        <span className="field__label">Any triad</span>
        <select className="input input--compact" value={root} onChange={(e) => onChange(e.target.value, quality)} aria-label="Triad root">
          {KEYS.map((k) => (
            <option key={k.root} value={k.root}>
              {k.label}
            </option>
          ))}
        </select>
        <select className="input input--compact" value={quality} onChange={(e) => onChange(root, e.target.value as ChordQuality)} aria-label="Triad quality">
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="dim">Diminished</option>
          <option value="aug">Augmented</option>
        </select>
      </div>
    </div>
  );
}

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

/** A coloured shape covering one note: its colour(s) and a tooltip. */
interface ShapeHit {
  colors: string[];
  text: string;
  title: string;
}

interface BoardProps {
  rows: FretCell[][];
  tuning: Tuning;
  capoFret: number;
  view: FretboardView;
  label: (cell: FretCell) => string;
  /** Shape colouring for a note (string index 0 = lowest), or null to hide it in Shapes view. */
  shapeAt: (s: number, fret: number) => ShapeHit | null;
}

const fillFor = (colors: string[]) =>
  colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(`, `)})`;

/** Row index as displayed (0 = highest string) for string index s (0 = lowest). */
const displayRow = (s: number, count: number) => count - 1 - s;

function GridBoard({ rows, tuning, capoFret, view, label, shapeAt }: BoardProps) {
  const columns = rows[0]?.length ?? 0;
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
              const shown = view === `shapes` && lit ? shapeAt(s, cell.fret) : null;
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
                      style={{ background: fillFor(shown.colors), color: shown.text }}
                      title={`${displayNote(cell.note)} · ${shown.title}`}
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

function NeckBoard({ rows, tuning, capoFret, view, label, shapeAt }: BoardProps) {
  const count = tuning.strings.length;
  // Phones: stand the whole neck upright so every fret fits the screen width.
  const upright = useMediaQuery(`(max-width: 599px)`);
  return (
    <Neck stringCount={count} capo={capoFret} vertical={upright} className="fretboard__neck" label="Scale notes on the neck">
      {rows.flatMap((cells, s) =>
        cells.map((cell) => {
          if (!cell.inScale || (capoFret > 0 && cell.fret < capoFret)) return null;
          const isRoot = cell.degree === 1;
          if (view === `shapes`) {
            const hit = shapeAt(s, cell.fret);
            if (!hit) return null;
            return (
              <NeckMarker
                key={`${s}-${cell.fret}`}
                string={s}
                stringCount={count}
                fret={cell.fret}
                label={label(cell)}
                variant="shape"
                root={isRoot}
                fills={hit.colors.slice(0, 2)}
                textColor={hit.text}
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
  const [source, setSource] = useState<ShapeSource>(`scale`);
  const [triad, setTriad] = useState<{ root: string; quality: ChordQuality }>({ root, quality: diatonicChords(root, scaleId)[0]?.quality ?? `major` });
  // A new key starts the triad picker on its I chord.
  useEffect(() => {
    const first = diatonicChords(root, scaleId)[0];
    setTriad({ root, quality: first?.quality === `minor` || first?.quality === `dim` || first?.quality === `aug` ? first.quality : `major` });
  }, [root, scaleId]);
  const triadMode = view === `shapes` && source === `triad`;
  const tones = useMemo(() => triadTones(triad.root, triad.quality), [triad]);

  const scaleRows = useMemo(() => buildFretboard(tuning, root, scaleId, frets), [tuning, root, scaleId, frets]);
  // In triad mode only the chord's notes are lit; the root counts as degree 1.
  const rows = useMemo(
    () =>
      triadMode
        ? scaleRows.map((cells) => cells.map((c) => ({ ...c, inScale: tones.has(c.note), degree: c.note === triad.root ? 1 : tones.has(c.note) ? 3 : null })))
        : scaleRows,
    [scaleRows, triadMode, tones, triad.root],
  );
  const pieces = useMemo(() => {
    const lit = [...rows].reverse().map((cells) => cells.map((c) => c.inScale && !(capoFret > 0 && c.fret < capoFret)));
    return findPieces(lit);
  }, [rows, capoFret]);
  const pieceAt = useMemo(() => pieceMap(pieces), [pieces]);

  // Triads: three-note shapes on adjacent strings, coloured by inversion.
  const [inversions, setInversions] = useState<Set<Inversion>>(() => new Set(INVERSIONS));
  const [sets, setSets] = useState<Set<number> | null>(null);
  const voicings = useMemo(
    () => (triadMode ? triadVoicings(tuning, tones, frets, capoFret) : []),
    [triadMode, tuning, tones, frets, capoFret],
  );
  const setCount = Math.max(0, tuning.strings.length - 2);
  const visibleSets = sets ?? new Set(Array.from({ length: setCount }, (_, i) => i));
  const voicingAt = useMemo(() => {
    const m = new Map<string, Inversion[]>();
    for (const v of voicings) {
      if (!inversions.has(v.inversion) || !visibleSets.has(v.set)) continue;
      v.frets.forEach((f, i) => {
        const key = `${v.set + i}-${f}`;
        const list = m.get(key) ?? [];
        if (!list.includes(v.inversion)) list.push(v.inversion);
        m.set(key, list);
      });
    }
    return m;
  }, [voicings, inversions, visibleSets]);

  const shapeAt = (sIdx: number, fret: number): ShapeHit | null => {
    if (triadMode) {
      const inv = voicingAt.get(`${sIdx}-${fret}`);
      if (!inv) return null;
      const ordered = INVERSIONS.filter((i) => inv.includes(i));
      return { colors: ordered.map((i) => INVERSION_INFO[i].color), text: INVERSION_INFO[ordered[0]].text, title: ordered.map((i) => INVERSION_INFO[i].name).join(` + `) };
    }
    const piece = pieceAt.get(`${displayRow(sIdx, tuning.strings.length)},${fret}`);
    if (!piece || !visiblePieces.has(piece.type)) return null;
    return { colors: [PIECE_INFO[piece.type].color], text: PIECE_INFO[piece.type].text, title: `${PIECE_INFO[piece.type].name} piece` };
  };
  const degrees = nashvilleLabels(scaleId);
  const label = (cell: FretCell) =>
    labels === `intervals` && cell.inScale
      ? triadMode
        ? (tones.get(cell.note) ?? ``)
        : cell.degree
          ? degrees[cell.degree - 1]
          : displayNote(cell.note)
      : displayNote(cell.note);
  const triadName = `${KEYS[mod12(noteIndex(triad.root))].label}${TRIAD_INTERVALS[triad.quality].suffix}`;
  const props: BoardProps = { rows, tuning, capoFret, view, label, shapeAt };

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
      {view === `shapes` && (
        <div className="shape-source">
          <div className="segmented shape-source__toggle" role="group" aria-label="Shapes from">
            <button type="button" className={`segmented__btn${source === `scale` ? ` segmented__btn--active` : ``}`} onClick={() => setSource(`scale`)}>
              Scale
            </button>
            <button type="button" className={`segmented__btn${source === `triad` ? ` segmented__btn--active` : ``}`} onClick={() => setSource(`triad`)}>
              Triads
            </button>
          </div>
          {triadMode && (
            <>
              <TriadPicker keyRoot={root} scaleId={scaleId} root={triad.root} quality={triad.quality} onChange={(r, q) => setTriad({ root: r, quality: q })} />
              <p className="shape-source__hint">
                <strong>{triadName}</strong> ({[...tones.entries()].map(([n, l]) => `${l} = ${displayNote(n)}`).join(` · `)}) as 3-note shapes on neighboring strings. Color = which note is on the bottom: purple root, yellow 3rd (1st inversion), cyan 5th (2nd inversion). Tap a color or string set to practice just those.
              </p>
            </>
          )}
        </div>
      )}
      {view === `shapes` && !triadMode && <PieceChips pieces={pieces} visible={visiblePieces} onChange={onVisiblePiecesChange} />}
      {triadMode && (
        <div className="shape-chips triad-filters" role="group" aria-label="Triad shapes to show">
          {INVERSIONS.map((inv) => {
            const info = INVERSION_INFO[inv];
            const on = inversions.has(inv);
            const n = voicings.filter((v) => v.inversion === inv && visibleSets.has(v.set)).length;
            return (
              <button
                key={inv}
                type="button"
                className={`shape-chip${on ? ` shape-chip--on` : ``}`}
                style={{ '--chip': info.color } as CSSProperties}
                aria-pressed={on}
                onClick={() => {
                  const all = inversions.size === INVERSIONS.length;
                  if (all) return setInversions(new Set([inv]));
                  const next = new Set(inversions);
                  if (next.has(inv)) next.delete(inv);
                  else next.add(inv);
                  setInversions(next.size ? next : new Set(INVERSIONS));
                }}
              >
                <span className="shape-chip__block" aria-hidden />
                {info.short}
                <span className="shape-chip__name">×{n}</span>
              </button>
            );
          })}
          <span className="triad-filters__divider" aria-hidden />
          {Array.from({ length: setCount }, (_, i) => i).reverse().map((set) => {
            const on = visibleSets.has(set);
            return (
              <button
                key={set}
                type="button"
                className={`shape-chip shape-chip--set${on ? ` shape-chip--on` : ``}`}
                aria-pressed={on}
                onClick={() => {
                  const all = visibleSets.size === setCount;
                  if (all) return setSets(new Set([set]));
                  const next = new Set(visibleSets);
                  if (next.has(set)) next.delete(set);
                  else next.add(set);
                  setSets(next.size ? next : null);
                }}
                title={`Strings ${stringSetName(tuning, set)}`}
              >
                {stringSetName(tuning, set)}
              </button>
            );
          })}
          <button
            type="button"
            className="shape-chip shape-chip--all"
            disabled={inversions.size === INVERSIONS.length && sets === null}
            onClick={() => {
              setInversions(new Set(INVERSIONS));
              setSets(null);
            }}
          >
            All
          </button>
        </div>
      )}
      {capoFret > 0 && <p className="fretboard__capo-note">Capo on fret {capoFret} — scale shows sounding pitches above the capo.</p>}
      {board === `neck` ? <NeckBoard {...props} /> : <GridBoard {...props} />}
    </div>
  );
}
