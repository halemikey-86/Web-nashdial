import type { ResolvedShape } from '../music/chordShapes';

const STRING_LABELS = [`E`, `A`, `D`, `G`, `B`, `e`];
const VISIBLE_FRETS = 5;

function isOpen(fret: number, capo: number): boolean {
  return fret === 0 || (capo > 0 && fret === capo);
}

interface ChordDiagramProps {
  chordLabel: string;
  resolved: ResolvedShape;
  capoFret?: number;
  large?: boolean;
}

export function ChordDiagram({ chordLabel, resolved, capoFret = 0, large = false }: ChordDiagramProps) {
  const { shape, baseFret, strings } = resolved;
  const atNut = baseFret === 0;
  const frets = Array.from({ length: VISIBLE_FRETS }, (_, i) => baseFret + i);

  return (
    <div className={`chord-diagram${large ? ` chord-diagram--large` : ``}`}>
      <div className="chord-diagram__summary">
        <span className="chord-diagram__chord">{chordLabel}</span>
        <span className="chord-diagram__meta">
          {shape} shape
          {!atNut && ` · start at fret ${baseFret}`}
          {capoFret > 0 && ` · capo ${capoFret}`}
        </span>
      </div>
      <div className="chord-diagram__board">
        <div className="chord-diagram__string-labels">
          {STRING_LABELS.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="chord-diagram__nut-area">
          {atNut && <div className="chord-diagram__nut" />}
          <div className="chord-diagram__markers">
            {strings.map((s) =>
              s.fret === null ? (
                <span key={s.stringIndex} className="chord-diagram__marker chord-diagram__marker--mute">
                  ×
                </span>
              ) : isOpen(s.fret, capoFret) ? (
                <span key={s.stringIndex} className="chord-diagram__marker chord-diagram__marker--open">
                  ○
                </span>
              ) : (
                <span key={s.stringIndex} className="chord-diagram__marker" />
              ),
            )}
          </div>
        </div>
        <div className="chord-diagram__grid">
          {frets.map((fret) => (
            <div key={fret} className="chord-diagram__fret-row">
              <span className="chord-diagram__fret-label">{fret}</span>
              {strings.map((s) => (
                <div key={s.stringIndex} className="chord-diagram__cell">
                  {s.fret !== null && s.fret === fret && fret > 0 && !isOpen(fret, capoFret) && (
                    <span
                      className={`chord-diagram__dot${s.isRoot ? ` chord-diagram__dot--root` : ``}`}
                      aria-label={s.isRoot ? `Root note, fret ${fret}` : `Fret ${fret}`}
                    >
                      {fret}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
