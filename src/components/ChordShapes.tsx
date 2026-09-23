import { useEffect, useMemo, useState } from 'react';
import { CAGED, lowestShape, resolveShape, type CagedShape } from '../music/chordShapes';
import { diatonicChords } from '../music/scales';
import type { Tuning } from '../music/tunings';
import { ChordDiagram } from './ChordDiagram';

interface ChordShapesProps {
  root: string;
  scaleId: string;
  tuning: Tuning;
  capoFret?: number;
}

export function ChordShapes({ root, scaleId, tuning, capoFret = 0 }: ChordShapesProps) {
  const chords = useMemo(() => diatonicChords(root, scaleId), [root, scaleId]);
  const [degree, setDegree] = useState(1);
  const [shapes, setShapes] = useState<Record<number, CagedShape>>({});

  useEffect(() => {
    const next: Record<number, CagedShape> = {};
    chords.forEach((c) => {
      next[c.degree] = lowestShape(c, tuning, capoFret);
    });
    setShapes(next);
    setDegree(1);
  }, [root, scaleId, tuning, capoFret, chords]);

  const chord = chords.find((c) => c.degree === degree) ?? chords[0];
  const shape = shapes[chord.degree] ?? `E`;
  const resolved = resolveShape(shape, chord.root, chord.quality, tuning, capoFret);
  const pickShape = (s: CagedShape) => setShapes((prev) => ({ ...prev, [chord.degree]: s }));

  return (
    <div className="chord-shapes">
      <div className="chord-shapes__legend" aria-label="How to read chord diagrams">
        <p className="chord-shapes__legend-title">How to read</p>
        <ul className="chord-shapes__legend-list">
          <li>
            <span className="chord-shapes__legend-dot" /> Finger — number is the fret to press
          </li>
          <li>
            <span className="chord-shapes__legend-dot chord-shapes__legend-dot--root" /> Red = root note of the chord
          </li>
          <li>
            <span className="chord-shapes__legend-open">○</span> Open string (no finger)
          </li>
          <li>
            <span className="chord-shapes__legend-mute">×</span> Mute — don't play this string
          </li>
        </ul>
        <p className="chord-shapes__legend-note">
          Strings run <strong>E → e</strong> (thick to thin). Numbers are <strong>actual frets</strong> on the neck
          {capoFret > 0 && <> — ○ at fret {capoFret} means open against the capo</>}.
        </p>
      </div>
      <div className="chord-shapes__degree-pick" role="tablist" aria-label="Chord degree">
        {chords.map((c) => (
          <button
            key={c.degree}
            type="button"
            role="tab"
            aria-selected={degree === c.degree}
            className={`chord-shapes__degree-btn${degree === c.degree ? ` chord-shapes__degree-btn--active` : ``}`}
            onClick={() => setDegree(c.degree)}
          >
            <span className="chord-shapes__degree-num">{c.degree}</span>
            <span className="chord-shapes__degree-label">{c.label}</span>
          </button>
        ))}
      </div>
      <div className="chord-shapes__shape-pick" role="group" aria-label="CAGED shape">
        {CAGED.map((s) => (
          <button
            key={s}
            type="button"
            className={`chord-shapes__shape-btn${shape === s ? ` chord-shapes__shape-btn--active` : ``}`}
            disabled={!resolveShape(s, chord.root, chord.quality, tuning, capoFret)}
            onClick={() => pickShape(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="chord-shapes__diagram">
        {resolved ? (
          <ChordDiagram chordLabel={chord.label} resolved={resolved} capoFret={capoFret} large />
        ) : (
          <p className="chord-shapes__unavailable">
            No playable {shape} shape for {chord.label} in this tuning
            {capoFret > 0 ? ` with capo on fret ${capoFret}` : ``}.
          </p>
        )}
      </div>
    </div>
  );
}
