import type { TabCell, TabColumn, TabStep } from './types';

export function cellText(c: TabCell | null | undefined): string {
  if (!c) return ``;
  return `${c.f === `x` ? `x` : c.f}${c.t ?? ``}`;
}

function splitMeasures(steps: TabStep[]): TabColumn[][] {
  const out: TabColumn[][] = [[]];
  for (const s of steps) {
    if (s === `|`) out.push([]);
    else out[out.length - 1].push(s);
  }
  return out.filter((m) => m.length > 0);
}

/** Trim trailing empty columns so an unfinished tab doesn't render a long blank run. */
function trimEmptyTail(steps: TabStep[]): TabStep[] {
  let end = steps.length;
  while (end > 0) {
    const s = steps[end - 1];
    if (s !== `|` && s.some(Boolean)) break;
    end--;
  }
  return steps.slice(0, end);
}

interface Piece {
  text: string;
  /** Column index across the whole tab (bars excluded), or null for filler. */
  col: number | null;
}

function measurePieces(cols: TabColumn[], firstCol: number, stringCount: number): Piece[][] {
  const widths = cols.map((col) => Math.max(1, ...col.map((c) => cellText(c).length)));
  return Array.from({ length: stringCount }, (_, s) => {
    const pieces: Piece[] = [{ text: `-`, col: null }];
    cols.forEach((col, i) => {
      if (i > 0) pieces.push({ text: `-`, col: null });
      pieces.push({ text: cellText(col[s]).padEnd(widths[i], `-`), col: firstCol + i });
    });
    pieces.push({ text: `-|`, col: null });
    return pieces;
  });
}

export function hasTabContent(steps: TabStep[]): boolean {
  return steps.some((s) => s !== `|` && s.some(Boolean));
}

/**
 * Tab rendered as measures that wrap to the screen width, so it reads on a phone without
 * side-scrolling. `highlight` marks one column (counting columns only, not bar lines).
 */
export function TabDisplay({ steps, stringLabels, highlight }: { steps: TabStep[]; stringLabels: string[]; highlight?: number }) {
  const measures = splitMeasures(trimEmptyTail(steps));
  if (!measures.length) return null;
  const labelWidth = Math.max(...stringLabels.map((l) => l.length));
  const labels = stringLabels.map((l) => `${l.padEnd(labelWidth)}|`).join(`\n`);
  let firstCol = 0;
  return (
    <div className="tab-display">
      {measures.map((cols, i) => {
        const lines = measurePieces(cols, firstCol, stringLabels.length);
        firstCol += cols.length;
        return (
          <pre key={i} className="tab-display__measure">
            {i === 0 && <span className="tab-display__labels">{labels}</span>}
            <span>
              {lines.map((pieces, li) => (
                <span key={li}>
                  {pieces.map((p, pi) =>
                    p.col !== null && p.col === highlight ? (
                      <mark key={pi} className="tab-display__now">
                        {p.text}
                      </mark>
                    ) : (
                      p.text
                    ),
                  )}
                  {li < lines.length - 1 ? `\n` : ``}
                </span>
              ))}
            </span>
          </pre>
        );
      })}
    </div>
  );
}
