import { useCallback, useMemo, useRef, type PointerEvent } from 'react';
import { KEYS, keyLabel, keyName } from '../music/notes';
import { getScale, hasRelativeKey, relativeKeyIndex } from '../music/scales';

/** Circle-of-fifths order of key indices, starting at C. */
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

function fifthsAngle(position: number): number {
  return position * 30 - 90;
}

function signatureLabel(position: number): string {
  if (position === 0) return `♮`;
  return position <= 7 ? `${position}♯` : `${12 - position}♭`;
}

function relativeMinorLabel(keyIndex: number): string {
  return keyName(keyIndex + 9, true).toLowerCase();
}

function geometry(componentSize: number, faceSize: number) {
  const k = faceSize / 260;
  return {
    componentSize,
    faceSize,
    faceInset: (componentSize - faceSize) / 2,
    faceCenter: faceSize / 2,
    componentCenter: componentSize / 2,
    scaleRadius: 112 * k,
    labelRadius: 96 * k,
    dotRadius: 106 * k,
    cofOuterRadius: componentSize / 2 - 4,
    cofInnerRadius: componentSize / 2 - (componentSize / 360) * 38,
    cofLabelRadius: componentSize / 2 - (componentSize / 360) * 20,
  };
}

function angleToIndex(deg: number): number {
  const normalized = ((((deg % 360) + 360) % 360) + 90) % 360;
  return Math.round(normalized / 30) % 12;
}

function indexAngle(index: number): number {
  return index * 30 - 90;
}

interface KeyDialProps {
  selectedIndex: number;
  onChange: (index: number) => void;
  variant?: 'primary' | 'transpose';
  scaleId?: string;
  /** Replaces the scale name under the key in the knob readout. */
  subLabel?: string;
}

export function KeyDial({ selectedIndex, onChange, variant = `primary`, scaleId = `major`, subLabel }: KeyDialProps) {
  const faceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const isTranspose = variant === `transpose`;
  const g = useMemo(() => geometry(isTranspose ? 200 : 360, isTranspose ? 148 : 260), [isTranspose]);
  const scale = getScale(scaleId);
  const selectedAngle = indexAngle(selectedIndex);
  const relative = relativeKeyIndex(selectedIndex, scaleId);
  const showRelative = !isTranspose && hasRelativeKey(scaleId) && relative !== null;
  const relativeAngle = relative === null ? 0 : indexAngle(relative);
  const knobRotation = selectedAngle + 90;

  const facePoint = useCallback(
    (deg: number, radius: number) => {
      const rad = (deg * Math.PI) / 180;
      return { x: g.faceCenter + radius * Math.cos(rad), y: g.faceCenter + radius * Math.sin(rad) };
    },
    [g.faceCenter],
  );

  const componentPoint = useCallback(
    (deg: number, radius: number) => {
      const rad = (deg * Math.PI) / 180;
      return { x: g.componentCenter + radius * Math.cos(rad), y: g.componentCenter + radius * Math.sin(rad) };
    },
    [g.componentCenter],
  );

  const relativeTick = useMemo(() => {
    const p = componentPoint(relativeAngle, g.cofOuterRadius);
    const rad = ((relativeAngle + 90) * Math.PI) / 180;
    const dx = 7 * Math.cos(rad);
    const dy = 7 * Math.sin(rad);
    return { x1: p.x - dx, y1: p.y - dy, x2: p.x + dx, y2: p.y + dy };
  }, [componentPoint, relativeAngle, g.cofOuterRadius]);

  const pickFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const face = faceRef.current;
      if (!face) return;
      const rect = face.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      onChange(angleToIndex((Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI));
    },
    [onChange],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    pickFromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) pickFromPointer(e.clientX, e.clientY);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  const relativeLabel = scaleId === `major` ? `Rel. minor` : scaleId === `natural-minor` ? `Rel. major` : ``;

  return (
    <div className={`key-dial${isTranspose ? ` key-dial--transpose` : ``}`} style={{ width: g.componentSize, height: g.componentSize }}>
      {!isTranspose && (
        <div className="key-dial__cof-outer" aria-hidden="false">
          <svg width={g.componentSize} height={g.componentSize} className="key-dial__cof-svg">
            <circle cx={g.componentCenter} cy={g.componentCenter} r={g.cofOuterRadius} className="key-dial__cof-band" />
            <circle cx={g.componentCenter} cy={g.componentCenter} r={g.cofInnerRadius} className="key-dial__cof-band-hole" />
            {showRelative && selectedIndex !== relative && (
              <line {...relativeTick} className="key-dial__relative-tick" strokeLinecap="round" />
            )}
          </svg>
          {FIFTHS.map((keyIndex, position) => {
            const angle = fifthsAngle(position);
            const p = componentPoint(angle, g.cofLabelRadius);
            const signature = signatureLabel(position);
            const minor = relativeMinorLabel(keyIndex);
            return (
              <button
                key={`cof-${keyIndex}`}
                type="button"
                className={`key-dial__cof-cell ${keyIndex === selectedIndex ? `key-dial__cof-cell--selected` : ``}`}
                style={{ left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${angle + 90}deg)` }}
                onClick={() => onChange(keyIndex)}
                aria-label={`${KEYS[keyIndex].label} major, ${signature}, ${minor} minor`}
              >
                <span className="key-dial__cof-major">{KEYS[keyIndex].label}</span>
                <span className="key-dial__cof-signature">{signature}</span>
                <span className="key-dial__cof-minor">{minor}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={faceRef}
        className="key-dial__face"
        style={{ width: g.faceSize, height: g.faceSize, top: g.faceInset, left: g.faceInset }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg width={g.faceSize} height={g.faceSize} className="key-dial__svg key-dial__svg--base">
          <circle cx={g.faceCenter} cy={g.faceCenter} r={g.scaleRadius} className="key-dial__scale-ring" />
          {Array.from({ length: 12 }, (_, i) => {
            const p = facePoint(indexAngle(i), g.dotRadius);
            const active = i === selectedIndex;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={active ? (isTranspose ? 2 : 2.5) : isTranspose ? 1.4 : 1.8}
                className={`key-dial__scale-dot ${active ? `key-dial__scale-dot--active` : ``}`}
              />
            );
          })}
        </svg>
        {KEYS.map((key, i) => {
          const p = facePoint(indexAngle(i), g.labelRadius);
          return (
            <button
              key={key.root}
              type="button"
              className={[
                `key-dial__label`,
                i === selectedIndex ? `key-dial__label--active` : ``,
                showRelative && i === relative ? `key-dial__label--relative` : ``,
              ]
                .filter(Boolean)
                .join(` `)}
              style={{ left: p.x, top: p.y }}
              onClick={() => onChange(i)}
            >
              {key.label}
            </button>
          );
        })}
        <div className="key-dial__knob">
          <div className="key-dial__knob-rotator" style={{ transform: `rotate(${knobRotation}deg)` }}>
            <div className="key-dial__knob-top">
              <div className="key-dial__knob-line" />
            </div>
          </div>
          <div className="key-dial__knob-readout">
            <span className="key-dial__center-label">{keyLabel(selectedIndex, scaleId)}</span>
            {!isTranspose && <span className="key-dial__center-sub">{subLabel ?? scale.shortName}</span>}
            {showRelative && relative !== null && (
              <span className="key-dial__center-relative">
                {relativeLabel}: {keyName(relative, scaleId === `major`)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
