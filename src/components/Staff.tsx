import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  clefFor,
  keySignaturePositions,
  spellMidi,
  spelledName,
  staffPosition,
  writtenStep,
  type Clef,
  type NotatedEvent,
  type StaffLayout,
} from '../music/notation';

/**
 * Standard notation drawn as SVG: clef (with the octave 8), key signature, 4/4, notes with
 * stems, beams, flags, dots and accidentals, rests, and ledger lines. Bars wrap to the width
 * of the screen like the tab does.
 */

const HALF = 5; // half a line gap: one staff position
const SLOT = 26; // width of an eighth note
const BAR_W = 8 * SLOT + 12;
const STEM = 34;
const CLEF_W = 34;
const KEY_W = 9;
const TIME_W = 22;
const MUSIC_FONT = `'Noto Music', 'Bravura Text', 'Segoe UI Symbol', 'Apple Symbols', serif`;

interface Placed {
  ev: NotatedEvent;
  clef: Clef;
  pos: number;
  accidental: string | null;
  name: string;
  x: number;
}

export interface StaffProps {
  bars: NotatedEvent[][];
  layout: StaffLayout;
  /** Key signature: sharps (+) / flats (−). */
  fifths: number;
  /** Tonic pitch class, for spelling notes outside the key. */
  tonic: number;
  /** Show each note's name under the staff. */
  names?: boolean;
  /** Slot of the note being played. */
  highlight?: number | null;
  /** Small marks above notes, by slot ("H", "P", "~"…). */
  marks?: Record<number, string>;
  onNote?: (midi: number, slot: number) => void;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === `undefined`) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Spell every note and work out which accidentals a reader needs to see, bar by bar. */
function place(bars: NotatedEvent[][], layout: StaffLayout, fifths: number, tonic: number): Omit<Placed, 'x'>[][] {
  const sig = new Map<number, number>();
  for (const [i, letter] of [3, 0, 4, 1, 5, 2, 6].entries()) if (i < fifths) sig.set(letter, 1);
  for (const [i, letter] of [6, 2, 5, 1, 4, 0, 3].entries()) if (i < -fifths) sig.set(letter, -1);
  return bars.map((bar) => {
    const inBar = new Map<number, number>(); // written step → alteration in force
    return bar.map((ev) => {
      if (ev.midi === null) return { ev, clef: layout === `bass` ? `bass` : `treble`, pos: 4, accidental: null, name: `` };
      const s = spellMidi(ev.midi, fifths, tonic);
      const step = writtenStep(s);
      const clef = clefFor(step, layout);
      const current = inBar.get(step) ?? sig.get(s.letter) ?? 0;
      inBar.set(step, s.alter);
      const accidental = current === s.alter ? null : s.alter > 0 ? `♯` : s.alter < 0 ? `♭` : `♮`;
      return { ev, clef, pos: staffPosition(step, clef), accidental, name: spelledName(s) };
    });
  });
}

function RestGlyph({ x, y4, dur }: { x: number; y4: number; dur: NotatedEvent['dur'] }) {
  // y4 is the middle line.
  if (dur >= 8) return <rect x={x - 6} y={y4 - 2 * HALF} width={12} height={5} />;
  if (dur >= 4) return <rect x={x - 6} y={y4 - 5} width={12} height={5} />;
  if (dur >= 2)
    return (
      <path
        d={`M${x - 2},${y4 - 12} L${x + 3},${y4 - 5} L${x - 2},${y4 + 1} L${x + 3},${y4 + 7} Q${x - 4},${y4 + 4} ${x},${y4 + 13}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  return (
    <g>
      <circle cx={x - 2} cy={y4 - 4} r={2.4} />
      <path d={`M${x - 3},${y4 - 3} Q${x + 1},${y4 - 1} ${x + 4},${y4 - 6} L${x},${y4 + 9}`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

function flag(x: number, y: number, up: boolean) {
  const d = up ? 1 : -1;
  return `M${x},${y} C${x + 1},${y + 7 * d} ${x + 9},${y + 10 * d} ${x + 7},${y + 20 * d} C${x + 6},${y + 13 * d} ${x + 3},${y + 11 * d} ${x},${y + 9 * d} Z`;
}

function System({
  bars,
  layout,
  fifths,
  first,
  last,
  names,
  highlight,
  marks,
  onNote,
}: {
  bars: Omit<Placed, 'x'>[][];
  layout: StaffLayout;
  fifths: number;
  first: boolean;
  last: boolean;
  names: boolean;
  highlight?: number | null;
  marks?: Record<number, string>;
  onNote?: (midi: number, slot: number) => void;
}) {
  const clefs: Clef[] = layout === `grand` ? [`treble`, `bass`] : [layout];
  const header = CLEF_W + Math.abs(fifths) * KEY_W + (first ? TIME_W : 0) + 8;
  const width = header + bars.length * BAR_W + 4;

  // Vertical room for ledger lines, stems and marks on each staff.
  const notes = bars.flat().filter((p) => p.ev.midi !== null);
  const range = (c: Clef) => {
    const ps = notes.filter((p) => p.clef === c).map((p) => p.pos);
    return { hi: Math.max(8, ...ps), lo: Math.min(0, ...ps) };
  };
  const hasMarks = !!marks && notes.some((p) => p.ev.slot !== null && marks[p.ev.slot]);
  const tops: number[] = [];
  let y = 0;
  clefs.forEach((c, i) => {
    const { hi, lo } = range(c);
    const above = Math.max(18, (hi - 8) * HALF + 14) + (i === 0 && hasMarks ? 14 : 0);
    const below = Math.max(18, -lo * HALF + 14);
    tops.push(y + above);
    y += above + 8 * HALF + below;
  });
  const height = y + (names ? 18 : 0);
  const bottomOf = (c: Clef) => tops[clefs.indexOf(c)] + 8 * HALF;
  const yOf = (c: Clef, pos: number) => bottomOf(c) - pos * HALF;

  // x of every event.
  const placed: Placed[][] = bars.map((bar, b) => bar.map((p) => ({ ...p, x: header + b * BAR_W + 14 + p.ev.start * SLOT })));

  const out: ReactNode[] = [];

  // Staff lines, clefs, key signatures, time signature.
  clefs.forEach((c) => {
    const bottom = bottomOf(c);
    for (let l = 0; l < 5; l++) out.push(<line key={`l${c}${l}`} className="staff__line" x1={0} x2={width - 2} y1={bottom - l * 2 * HALF} y2={bottom - l * 2 * HALF} />);
    out.push(
      c === `treble` ? (
        <g key={`clef${c}`}>
          <text x={2} y={yOf(c, 3)} fontSize={46} fontFamily={MUSIC_FONT} className="staff__glyph" dominantBaseline="central">
            𝄞
          </text>
          <text x={11} y={yOf(c, -7)} fontSize={9} className="staff__eight">
            8
          </text>
        </g>
      ) : (
        <g key={`clef${c}`}>
          <text x={2} y={yOf(c, 5)} fontSize={32} fontFamily={MUSIC_FONT} className="staff__glyph" dominantBaseline="central">
            𝄢
          </text>
          <text x={11} y={yOf(c, -3)} fontSize={9} className="staff__eight">
            8
          </text>
        </g>
      ),
    );
    keySignaturePositions(fifths, c).forEach((pos, i) =>
      out.push(
        <text key={`k${c}${i}`} x={CLEF_W + i * KEY_W} y={yOf(c, pos) + (fifths < 0 ? -5 : 0)} fontSize={17} fontFamily={MUSIC_FONT} className="staff__glyph" dominantBaseline="central">
          {fifths > 0 ? `♯︎` : `♭︎`}
        </text>,
      ),
    );
    if (first) {
      const tx = CLEF_W + Math.abs(fifths) * KEY_W + TIME_W / 2 + 2;
      for (const pos of [6, 2])
        out.push(
          <text key={`t${c}${pos}`} x={tx} y={yOf(c, pos)} className="staff__time" textAnchor="middle" dominantBaseline="central">
            4
          </text>,
        );
    }
  });
  if (clefs.length > 1) out.push(<line key="brace" className="staff__bar" x1={0.5} x2={0.5} y1={tops[0]} y2={bottomOf(`bass`)} strokeWidth={2} />);

  // Bar lines (through both staves on a grand staff).
  placed.forEach((_, b) => {
    const x = header + (b + 1) * BAR_W;
    const end = last && b === placed.length - 1;
    out.push(<line key={`bar${b}`} className="staff__bar" x1={end ? x - 5 : x} x2={end ? x - 5 : x} y1={tops[0]} y2={bottomOf(clefs[clefs.length - 1])} />);
    if (end) out.push(<rect key="final" x={x - 3} y={tops[0]} width={3} height={bottomOf(clefs[clefs.length - 1]) - tops[0]} className="staff__ink" />);
  });

  // Beamed pairs: two eighths on one beat on the same staff.
  const beamed = new Set<Placed>();
  const beams: [Placed, Placed][] = [];
  for (const bar of placed) {
    for (let i = 0; i + 1 < bar.length; i++) {
      const a = bar[i];
      const b = bar[i + 1];
      if (a.ev.midi !== null && b.ev.midi !== null && a.ev.dur === 1 && b.ev.dur === 1 && a.ev.start % 2 === 0 && b.ev.start === a.ev.start + 1 && a.clef === b.clef) {
        beams.push([a, b]);
        beamed.add(a).add(b);
        i++;
      }
    }
  }
  const stemUp = (ps: Placed[]) => ps.reduce((s, p) => s + p.pos, 0) / ps.length < 4;
  const direction = new Map<Placed, boolean>();
  const stemEnd = new Map<Placed, number>();
  for (const [a, b] of beams) {
    const up = stemUp([a, b]);
    const ends = [a, b].map((p) => yOf(p.clef, p.pos) + (up ? -STEM : STEM));
    const flat = up ? Math.min(...ends) : Math.max(...ends);
    for (const p of [a, b]) {
      direction.set(p, up);
      stemEnd.set(p, flat);
    }
    const x1 = a.x + (up ? 5 : -5);
    const x2 = b.x + (up ? 5 : -5);
    const t = up ? 0 : -5;
    out.push(<polygon key={`beam${a.ev.slot}`} className="staff__ink" points={`${x1},${flat + t} ${x2},${flat + t} ${x2},${flat + t + 5} ${x1},${flat + t + 5}`} />);
  }

  // Notes and rests.
  placed.flat().forEach((p, i) => {
    const { ev, clef, pos, x } = p;
    if (ev.midi === null) {
      out.push(
        <g key={`r${i}`} className="staff__ink">
          <RestGlyph x={x} y4={yOf(clefs[0], 4)} dur={ev.dur} />
        </g>,
      );
      if (clefs.length > 1)
        out.push(
          <g key={`r2${i}`} className="staff__ink">
            <RestGlyph x={x} y4={yOf(clefs[1], 4)} dur={ev.dur} />
          </g>,
        );
      return;
    }
    const y0 = yOf(clef, pos);
    const on = highlight !== undefined && highlight !== null && ev.slot === highlight;
    const hollow = ev.dur >= 4;
    const up = direction.get(p) ?? stemUp([p]);
    const g: ReactNode[] = [];
    // Ledger lines.
    for (let l = -2; l >= pos; l -= 2) g.push(<line key={`lg${l}`} className="staff__line" x1={x - 9} x2={x + 9} y1={yOf(clef, l)} y2={yOf(clef, l)} />);
    for (let l = 10; l <= pos; l += 2) g.push(<line key={`lg${l}`} className="staff__line" x1={x - 9} x2={x + 9} y1={yOf(clef, l)} y2={yOf(clef, l)} />);
    g.push(
      <ellipse
        key="head"
        cx={x}
        cy={y0}
        rx={5.6}
        ry={4}
        transform={`rotate(-20 ${x} ${y0})`}
        className={hollow ? `staff__hollow` : `staff__ink`}
      />,
    );
    if (p.accidental)
      g.push(
        <text key="acc" x={x - 9} y={y0 + (p.accidental === `♭` ? -5 : 0)} fontSize={17} fontFamily={MUSIC_FONT} textAnchor="end" dominantBaseline="central" className="staff__glyph">
          {`${p.accidental}︎`}
        </text>,
      );
    if (ev.dur === 3 || ev.dur === 6) g.push(<circle key="dot" cx={x + 10} cy={pos % 2 === 0 ? y0 - HALF : y0} r={1.8} className="staff__ink" />);
    if (ev.dur < 8) {
      const sx = up ? x + 5 : x - 5;
      const end = stemEnd.get(p) ?? y0 + (up ? -STEM : STEM);
      g.push(<line key="stem" className="staff__stem" x1={sx} x2={sx} y1={y0} y2={end} />);
      if (ev.dur === 1 && !beamed.has(p)) g.push(<path key="flag" d={flag(sx, end, up)} className="staff__ink" />);
    }
    const mark = ev.slot !== null ? marks?.[ev.slot] : undefined;
    if (mark)
      g.push(
        <text key="mark" x={x} y={tops[0] - 16} textAnchor="middle" className="staff__mark">
          {mark}
        </text>,
      );
    if (names)
      g.push(
        <text key="name" x={x} y={height - 4} textAnchor="middle" className="staff__name">
          {p.name}
        </text>,
      );
    out.push(
      <g
        key={`n${i}`}
        className={`staff__note${on ? ` staff__note--on` : ``}${onNote ? ` staff__note--tap` : ``}`}
        onClick={onNote && ev.slot !== null ? () => onNote(ev.midi as number, ev.slot as number) : undefined}
      >
        {/* A wider invisible target so a finger can hit the note. */}
        {onNote && <rect x={x - 11} y={y0 - 14} width={22} height={28} fill="transparent" />}
        {g}
      </g>,
    );
  });

  return (
    <svg className="staff__system" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
      {out}
    </svg>
  );
}

/** Standard notation for a run of bars, wrapped to the available width. */
export function Staff({ bars, layout, fifths, tonic, names = false, highlight, marks, onNote }: StaffProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const spelled = place(bars, layout, fifths, tonic);
  const header = CLEF_W + Math.abs(fifths) * KEY_W + TIME_W + 12;
  const perLine = Math.max(1, Math.floor((width - header) / BAR_W));
  const systems: Omit<Placed, 'x'>[][][] = [];
  for (let i = 0; i < spelled.length; i += perLine) systems.push(spelled.slice(i, i + perLine));
  return (
    <div className="staff" ref={ref}>
      {systems.map((s, i) => (
        <System
          key={i}
          bars={s}
          layout={layout}
          fifths={fifths}
          first={i === 0}
          last={i === systems.length - 1}
          names={names}
          highlight={highlight}
          marks={marks}
          onNote={onNote}
        />
      ))}
    </div>
  );
}
