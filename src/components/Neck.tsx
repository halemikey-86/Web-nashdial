import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { fretCount, fretX, isWound, neckFor, stringGap, stringWidth, stringY, wireX, type NeckSpec } from './neckGeometry';

const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
const NUMBER_STRIP = 46;

interface NeckState {
  spec: NeckSpec;
  vertical: boolean;
}

const NeckContext = createContext<NeckState>({ spec: neckFor(6), vertical: false });

/** The neck being drawn, for overlays that need its geometry. */
export function useNeck(): NeckState {
  return useContext(NeckContext);
}

/** x of the capo bar's centre. */
export function capoX(spec: NeckSpec, capo: number): number {
  return wireX(spec, capo) - 27;
}

/** Text that stays upright when the neck is drawn vertically. */
function Upright({ x, y, vertical, children }: { x: number; y: number; vertical: boolean; children: ReactNode }) {
  return <g transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}>{children}</g>;
}

interface NeckProps {
  stringCount: number;
  /** First and last fret shown (0 = include the nut and open strings). */
  fromFret?: number;
  toFret?: number;
  capo?: number;
  /** String indices (0 = lowest) currently ringing. */
  vibrating?: ReadonlySet<number>;
  /** Makes every string/fret tappable. */
  onPick?: (string: number, fret: number) => void;
  /** Draw the neck upright like a chord chart: nut at the top, low string on the left. */
  vertical?: boolean;
  /** Overlay drawn in neck coordinates (use fretX / stringY with useNeck().spec). */
  children?: ReactNode;
  label?: string;
  className?: string;
}

/**
 * Photo of a neck with strings drawn on top: the bass neck for 4-string instruments, the guitar
 * neck otherwise. Like tab, the low string is at the bottom and the high string at the top.
 */
export function Neck({ stringCount, fromFret = 0, toFret, capo = 0, vibrating, onPick, vertical = false, children, label, className = `` }: NeckProps) {
  const spec = neckFor(stringCount);
  const maxFret = fretCount(spec);
  const lastFret = Math.min(toFret ?? maxFret, maxFret);
  // Starting at the capo shows the capo bar, not the dead fret behind it.
  const x0 = fromFret <= 0 ? Math.min(0, spec.openX - 40) : capo > 0 && fromFret === capo ? capoX(spec, capo) - 34 : wireX(spec, fromFret - 1) - 24;
  const x1 = lastFret >= maxFret ? spec.width : wireX(spec, lastFret) + 28;
  const width = x1 - x0;
  const height = spec.height + NUMBER_STRIP;
  const frets = Array.from({ length: lastFret - Math.max(0, fromFret) + 1 }, (_, i) => Math.max(0, fromFret) + i);
  const strings = Array.from({ length: stringCount }, (_, i) => i);
  const numberY = spec.height + 32;
  const viewBox = vertical ? `${-height} ${x0} ${height} ${width}` : `${x0} 0 ${width} ${height}`;
  const capoTop = Math.min(stringY(spec, 0, 2, wireX(spec, capo)), stringY(spec, 1, 2, wireX(spec, capo)));

  return (
    <NeckContext.Provider value={{ spec, vertical }}>
      <div className={`neck neck--${spec.id}${vertical ? ` neck--vertical` : ``} ${className}`} style={{ '--neck-frets': frets.length } as CSSProperties}>
        <svg className="neck__svg" viewBox={viewBox} role="img" aria-label={label ?? (spec.id === `bass` ? `Bass neck` : `Guitar neck`)}>
          <g transform={vertical ? `rotate(90)` : undefined}>
            <image href={spec.image} x={0} y={0} width={spec.width} height={spec.height} preserveAspectRatio="none" />

            {capo > 0 && <rect className="neck__blocked" x={x0} y={0} width={Math.max(0, capoX(spec, capo) - 15 - x0)} height={spec.height} />}

            {strings.map((i) => {
              const w = stringWidth(spec, i, stringCount);
              const ya = stringY(spec, i, stringCount, x0);
              const yb = stringY(spec, i, stringCount, x1);
              const wound = isWound(spec, i, stringCount);
              return (
                <g key={i} className={`neck__string${vibrating?.has(i) ? ` neck__string--ringing` : ``}`}>
                  <line x1={x0} y1={ya + w * 0.7} x2={x1} y2={yb + w * 0.7} className="neck__string-shadow" strokeWidth={w + 2} />
                  <line x1={x0} y1={ya} x2={x1} y2={yb} className={wound ? `neck__string-core neck__string-core--wound` : `neck__string-core`} strokeWidth={w} />
                  {wound && <line x1={x0} y1={ya} x2={x1} y2={yb} className="neck__string-winding" strokeWidth={w * 0.92} />}
                  <line x1={x0} y1={ya - w * 0.22} x2={x1} y2={yb - w * 0.22} className="neck__string-shine" strokeWidth={Math.max(1, w * 0.28)} />
                </g>
              );
            })}

            {capo > 0 && capo <= lastFret && (
              <g className="neck__capo">
                <rect x={capoX(spec, capo) - 15} y={capoTop - 42} width={30} height={stringGap(spec, 2, wireX(spec, capo)) + 84} rx={10} />
                <text x={capoX(spec, capo)} y={spec.height / 2} className="neck__capo-label" transform={`rotate(-90 ${capoX(spec, capo)} ${spec.height / 2})`}>
                  CAPO {capo}
                </text>
              </g>
            )}

            {frets.map((f) => (
              <g key={f} className="neck__number">
                <Upright x={fretX(spec, f)} y={numberY} vertical={vertical}>
                  <text x={fretX(spec, f)} y={numberY} className={f === capo && capo > 0 ? `neck__number-text neck__number-text--capo` : `neck__number-text`}>
                    {f}
                  </text>
                </Upright>
                {INLAYS.includes(f) && <circle cx={fretX(spec, f)} cy={numberY + 12} r={4} className="neck__number-dot" />}
              </g>
            ))}

            {children}

            {onPick &&
              frets.map((f) =>
                strings.map((i) => {
                  const x = fretX(spec, f);
                  const left = f === 0 ? x0 : wireX(spec, f - 1);
                  const right = f === 0 ? spec.nutX : wireX(spec, f);
                  const gap = stringGap(spec, stringCount, x);
                  return (
                    <rect
                      key={`${i}-${f}`}
                      className="neck__hit"
                      x={left}
                      y={stringY(spec, i, stringCount, x) - gap / 2}
                      width={right - left}
                      height={gap}
                      onClick={() => onPick(i, f)}
                    >
                      <title>{`String ${stringCount - i}, fret ${f}`}</title>
                    </rect>
                  );
                }),
              )}
          </g>
        </svg>
      </div>
    </NeckContext.Provider>
  );
}

export type NoteMarkerVariant = 'dot' | 'block' | 'shape' | 'ghost' | 'press' | 'mute' | 'open';

interface NeckMarkerProps {
  string: number;
  stringCount: number;
  fret: number;
  label?: string;
  variant?: NoteMarkerVariant;
  root?: boolean;
  /** Colours for 'shape' markers; two colours split the block diagonally. */
  fills?: string[];
  textColor?: string;
  /** With a capo, notes at the capo fret sit on the capo (open against it). */
  capo?: number;
}

/** A note on the neck at a string/fret. Must be rendered inside <Neck>. */
export function NeckMarker({ string, stringCount, fret, label = ``, variant = `dot`, root = false, fills, textColor, capo = 0 }: NeckMarkerProps) {
  const { spec, vertical } = useNeck();
  const x = capo > 0 && fret === capo ? capoX(spec, capo) : fretX(spec, fret);
  const y = stringY(spec, string, stringCount, x);
  const gap = stringGap(spec, stringCount, x);
  const r = Math.min(30, gap * 0.5);
  const cls = `neck-marker neck-marker--${variant}${root ? ` neck-marker--root` : ``}`;

  if (variant === `mute`) {
    return (
      <Upright x={x} y={y} vertical={vertical}>
        <text x={x} y={y} className={cls}>
          ×
        </text>
      </Upright>
    );
  }
  if (variant === `shape` || variant === `block`) {
    const w = vertical ? r * 2 : r * 2.2;
    const h = vertical ? r * 2.2 : r * 2;
    return (
      <g className={cls}>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={6} style={fills?.[0] ? { fill: fills[0] } : undefined} />
        {fills && fills.length > 1 && <path d={`M ${x + w / 2} ${y - h / 2} L ${x + w / 2} ${y + h / 2} L ${x - w / 2} ${y + h / 2} Z`} style={{ fill: fills[1] }} />}
        <rect x={x - w / 2 + 3} y={y - h / 2 + 3} width={w - 6} height={h - 6} rx={4} className="neck-marker__bevel" />
        <Upright x={x} y={y} vertical={vertical}>
          <text x={x} y={y} style={textColor ? { fill: textColor } : undefined}>
            {label}
          </text>
        </Upright>
      </g>
    );
  }
  return (
    <g className={cls}>
      <circle cx={x} cy={y} r={r} />
      {label && (
        <Upright x={x} y={y} vertical={vertical}>
          <text x={x} y={y}>{label}</text>
        </Upright>
      )}
    </g>
  );
}
