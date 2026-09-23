import type { CSSProperties, ReactNode } from 'react';
import neckUrl from '../assets/guitar-neck.webp';
import { NECK, NECK_FRETS, fretX, isWound, stringWidth, stringY, wireX } from './neckGeometry';

const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
const NUMBER_STRIP = 46;

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
  /** Overlay drawn in neck coordinates (use fretX / stringY). */
  children?: ReactNode;
  label?: string;
  className?: string;
}

/** Photo of a guitar neck with strings drawn on top. Strings run low (top) to high (bottom), the player's view. */
export function Neck({ stringCount, fromFret = 0, toFret = NECK_FRETS, capo = 0, vibrating, onPick, children, label, className = `` }: NeckProps) {
  const lastFret = Math.min(toFret, NECK_FRETS);
  const x0 = fromFret <= 0 ? 0 : wireX(fromFret - 1) - 24;
  const x1 = lastFret >= NECK_FRETS ? NECK.width : wireX(lastFret) + 28;
  const width = x1 - x0;
  const frets = Array.from({ length: lastFret - Math.max(0, fromFret) + 1 }, (_, i) => Math.max(0, fromFret) + i);
  const strings = Array.from({ length: stringCount }, (_, i) => i);
  const numberY = NECK.height + 32;

  return (
    <div className={`neck ${className}`} style={{ '--neck-frets': frets.length } as CSSProperties}>
      <svg className="neck__svg" viewBox={`${x0} 0 ${width} ${NECK.height + NUMBER_STRIP}`} role="img" aria-label={label ?? `Guitar neck`}>
        <image href={neckUrl} x={0} y={0} width={NECK.width} height={NECK.height} preserveAspectRatio="none" />

        {capo > 0 && (
          <rect className="neck__blocked" x={x0} y={0} width={Math.max(0, wireX(capo) - 30 - x0)} height={NECK.height} />
        )}

        {strings.map((i) => {
          const w = stringWidth(i, stringCount);
          const ya = stringY(i, stringCount, x0);
          const yb = stringY(i, stringCount, x1);
          const ringing = vibrating?.has(i);
          return (
            <g key={i} className={`neck__string${ringing ? ` neck__string--ringing` : ``}`}>
              <line x1={x0} y1={ya + w * 0.7} x2={x1} y2={yb + w * 0.7} className="neck__string-shadow" strokeWidth={w + 2} />
              <line x1={x0} y1={ya} x2={x1} y2={yb} className={isWound(i, stringCount) ? `neck__string-core neck__string-core--wound` : `neck__string-core`} strokeWidth={w} />
              {isWound(i, stringCount) && <line x1={x0} y1={ya} x2={x1} y2={yb} className="neck__string-winding" strokeWidth={w * 0.92} />}
              <line x1={x0} y1={ya - w * 0.22} x2={x1} y2={yb - w * 0.22} className="neck__string-shine" strokeWidth={Math.max(1, w * 0.28)} />
            </g>
          );
        })}

        {capo > 0 && capo <= lastFret && (
          <g className="neck__capo">
            <rect x={capoX(capo) - 15} y={stringY(0, 2, wireX(capo)) - 42} width={30} height={stringY(1, 2, wireX(capo)) - stringY(0, 2, wireX(capo)) + 84} rx={10} />
            <text x={capoX(capo)} y={NECK.height / 2} className="neck__capo-label" transform={`rotate(-90 ${capoX(capo)} ${NECK.height / 2})`}>
              CAPO {capo}
            </text>
          </g>
        )}

        {frets.map((f) => (
          <g key={f} className="neck__number">
            <text x={fretX(f)} y={numberY} className={f === capo && capo > 0 ? `neck__number-text neck__number-text--capo` : `neck__number-text`}>
              {f}
            </text>
            {INLAYS.includes(f) && <circle cx={fretX(f)} cy={numberY + 10} r={4} className="neck__number-dot" />}
          </g>
        ))}

        {children}

        {onPick &&
          frets.map((f) =>
            strings.map((i) => {
              const x = fretX(f);
              const left = f === 0 ? x0 : wireX(f - 1);
              const right = f === 0 ? NECK.nutX : wireX(f);
              const gap = stringCount > 1 ? stringY(1, stringCount, x) - stringY(0, stringCount, x) : 60;
              return (
                <rect
                  key={`${i}-${f}`}
                  className="neck__hit"
                  x={left}
                  y={stringY(i, stringCount, x) - gap / 2}
                  width={right - left}
                  height={gap}
                  onClick={() => onPick(i, f)}
                >
                  <title>{`String ${stringCount - i}, fret ${f}`}</title>
                </rect>
              );
            }),
          )}
      </svg>
    </div>
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

/** A note on the neck at a string/fret. */
/** x of the capo bar's centre. */
export function capoX(capo: number): number {
  return wireX(capo) - 27;
}

export function NeckMarker({ string, stringCount, fret, label = ``, variant = `dot`, root = false, fills, textColor, capo = 0 }: NeckMarkerProps) {
  const x = capo > 0 && fret === capo ? capoX(capo) : fretX(fret);
  const y = stringY(string, stringCount, x);
  const gap = stringCount > 1 ? stringY(1, stringCount, x) - stringY(0, stringCount, x) : 60;
  const r = Math.min(30, gap * 0.5);
  const cls = `neck-marker neck-marker--${variant}${root ? ` neck-marker--root` : ``}`;

  if (variant === `mute`) {
    return (
      <text x={x} y={y} className={cls}>
        ×
      </text>
    );
  }
  if (variant === `shape` || variant === `block`) {
    const w = r * 2.2;
    const h = r * 2;
    return (
      <g className={cls}>
        <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={6} style={fills?.[0] ? { fill: fills[0] } : undefined} />
        {fills && fills.length > 1 && (
          <path d={`M ${x + w / 2} ${y - h / 2} L ${x + w / 2} ${y + h / 2} L ${x - w / 2} ${y + h / 2} Z`} style={{ fill: fills[1] }} />
        )}
        <rect x={x - w / 2 + 3} y={y - h / 2 + 3} width={w - 6} height={h - 6} rx={4} className="neck-marker__bevel" />
        <text x={x} y={y} style={textColor ? { fill: textColor } : undefined}>
          {label}
        </text>
      </g>
    );
  }
  return (
    <g className={cls}>
      <circle cx={x} cy={y} r={r} />
      {label && <text x={x} y={y}>{label}</text>}
    </g>
  );
}
