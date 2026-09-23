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

function measureLines(cols: TabColumn[], stringCount: number): string[] {
  const widths = cols.map((col) => Math.max(1, ...col.map((c) => cellText(c).length)));
  return Array.from({ length: stringCount }, (_, s) => {
    const body = cols.map((col, i) => cellText(col[s]).padEnd(widths[i], `-`)).join(`-`);
    return `-${body}-|`;
  });
}

export function hasTabContent(steps: TabStep[]): boolean {
  return steps.some((s) => s !== `|` && s.some(Boolean));
}

/** Tab rendered as measures that wrap to the screen width, so it reads on a phone without side-scrolling. */
export function TabDisplay({ steps, stringLabels }: { steps: TabStep[]; stringLabels: string[] }) {
  const measures = splitMeasures(trimEmptyTail(steps));
  if (!measures.length) return null;
  const labelWidth = Math.max(...stringLabels.map((l) => l.length));
  const labels = stringLabels.map((l) => `${l.padEnd(labelWidth)}|`).join(`\n`);
  return (
    <div className="tab-display">
      {measures.map((cols, i) => (
        <pre key={i} className="tab-display__measure">
          {i === 0 && <span className="tab-display__labels">{labels}</span>}
          <span>{measureLines(cols, stringLabels.length).join(`\n`)}</span>
        </pre>
      ))}
    </div>
  );
}
