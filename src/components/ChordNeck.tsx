import type { ResolvedShape } from '../music/chordShapes';
import { Neck, NeckMarker } from './Neck';

/** A chord shape on an upright neck (nut at the top, low string on the left), like a chord chart. */
export function ChordNeck({ resolved, stringCount, capo = 0, ringing = false }: { resolved: ResolvedShape; stringCount: number; capo?: number; ringing?: boolean }) {
  const base = resolved.baseFret;
  const from = capo > 0 ? capo : base <= 2 ? 0 : base - 1;
  const top = Math.max(base, ...resolved.fingers.map((f) => f.fret ?? 0));
  const to = Math.max(from + 4, top + 1);
  const strings = resolved.strings.filter((s) => s.stringIndex < stringCount);
  return (
    <Neck
      stringCount={stringCount}
      fromFret={from}
      toFret={to}
      capo={capo}
      vertical
      vibrating={ringing ? new Set(strings.filter((s) => s.fret !== null).map((s) => s.stringIndex)) : undefined}
      className="chord-neck"
      label="Chord shape on the neck"
    >
      {strings.map((s) =>
        s.fret === null ? (
          <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={stringCount} fret={from} variant="mute" />
        ) : s.fret === 0 || s.fret === capo ? (
          <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={stringCount} fret={s.fret} variant="open" root={s.isRoot} capo={capo} />
        ) : (
          <NeckMarker key={s.stringIndex} string={s.stringIndex} stringCount={stringCount} fret={s.fret} label={String(s.fret)} variant="press" root={s.isRoot} />
        ),
      )}
    </Neck>
  );
}
