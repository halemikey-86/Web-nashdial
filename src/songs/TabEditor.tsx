import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Neck, NeckMarker } from '../components/Neck';
import { loadPref, savePref } from './storage';
import { emptyColumn } from './model';
import { cellText } from './TabDisplay';
import { TECHNIQUES, TECHNIQUE_NAMES, type TabBlock, type TabCell, type TabStep, type Technique } from './types';

interface TabEditorProps {
  block: TabBlock;
  stringLabels: string[];
  /** Song capo: tab frets are relative to it, the neck shows actual frets. */
  capo?: number;
  onChange: (block: TabBlock) => void;
}

interface Cursor {
  step: number;
  string: number;
}

const MAX_FRET = 24;
const TWO_DIGIT_WINDOW_MS = 1200;

/**
 * Grid editor for one tab. Tap a cell (or use the arrow keys) and enter frets with the keypad
 * or keyboard. Typing two digits quickly makes a two-digit fret (1 then 2 → 12).
 */
export function TabEditor({ block, stringLabels, capo = 0, onChange }: TabEditorProps) {
  const stringCount = stringLabels.length;
  const [cursor, setCursor] = useState<Cursor>({ step: 0, string: 0 });
  const [showNeck, setShowNeck] = useState(() => loadPref<string>(`tab-neck`, `on`) === `on`);
  const [advance, setAdvance] = useState(() => loadPref<string>(`tab-neck-advance`, `on`) === `on`);
  const lastDigit = useRef<{ at: number; step: number; string: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const steps = block.steps;

  // Keep the cursor inside the grid as columns are removed.
  const step = Math.min(cursor.step, Math.max(0, steps.length - 1));
  const current = steps[step];

  // Keep the current column visible by scrolling the grid sideways only (never the page).
  useEffect(() => {
    const grid = gridRef.current;
    const el = grid?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!grid || !el) return;
    const left = el.offsetLeft - grid.offsetLeft;
    if (left < grid.scrollLeft + 30) grid.scrollLeft = Math.max(0, left - 30);
    else if (left + el.offsetWidth > grid.scrollLeft + grid.clientWidth) grid.scrollLeft = left + el.offsetWidth - grid.clientWidth + 10;
  }, [step]);

  const commit = (next: TabStep[], nextCursor?: Cursor) => {
    onChange({ ...block, steps: next });
    if (nextCursor) setCursor(nextCursor);
  };

  const updateCell = (fn: (cell: TabCell | null) => TabCell | null) => {
    if (current === undefined || current === `|`) return;
    const next = steps.map((s, i) => (i === step && s !== `|` ? s.map((c, j) => (j === cursor.string ? fn(c) : c)) : s));
    commit(next);
  };

  const enterDigit = (d: number) => {
    if (current === `|`) return;
    const now = Date.now();
    const prev = lastDigit.current;
    const existing = current?.[cursor.string];
    const combine =
      prev && prev.step === step && prev.string === cursor.string && now - prev.at < TWO_DIGIT_WINDOW_MS && existing && typeof existing.f === `number`;
    const combined = combine ? (existing.f as number) * 10 + d : d;
    const f = combine && combined <= MAX_FRET ? combined : d;
    lastDigit.current = combine && combined <= MAX_FRET ? null : { at: now, step, string: cursor.string };
    updateCell((c) => (c?.t ? { f, t: c.t } : { f }));
  };

  const toggleTechnique = (t: Technique) => {
    updateCell((c) => {
      if (!c) return c;
      return c.t === t ? { f: c.f } : { f: c.f, t };
    });
  };

  const move = (dStep: number, dString: number) => {
    lastDigit.current = null;
    const nextString = Math.min(stringCount - 1, Math.max(0, cursor.string + dString));
    let nextStep = step + dStep;
    if (nextStep >= steps.length) {
      commit([...steps, emptyColumn(stringCount)], { step: steps.length, string: nextString });
      return;
    }
    nextStep = Math.max(0, nextStep);
    setCursor({ step: nextStep, string: nextString });
  };

  const insertColumn = () => {
    const next = [...steps];
    next.splice(step + 1, 0, emptyColumn(stringCount));
    commit(next, { step: step + 1, string: cursor.string });
  };

  const insertBar = () => {
    const next = [...steps];
    next.splice(step + 1, 0, `|`, emptyColumn(stringCount));
    commit(next, { step: step + 2, string: cursor.string });
  };

  const deleteColumn = () => {
    if (steps.length <= 1) {
      commit([emptyColumn(stringCount)], { step: 0, string: cursor.string });
      return;
    }
    const next = steps.filter((_, i) => i !== step);
    commit(next, { step: Math.min(step, next.length - 1), string: cursor.string });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    if (/^\d$/.test(k)) enterDigit(Number(k));
    else if (k === `ArrowLeft`) move(-1, 0);
    else if (k === `ArrowRight` || k === ` `) move(1, 0);
    else if (k === `ArrowUp`) move(0, -1);
    else if (k === `ArrowDown`) move(0, 1);
    else if (k === `Backspace` || k === `Delete`) {
      if (e.shiftKey || current === `|`) deleteColumn();
      else updateCell(() => null);
    } else if (k === `x` || k === `X`) updateCell((c) => ({ f: `x`, ...(c?.t ? { t: c.t } : {}) }));
    else if (k === `|`) insertBar();
    else if (k === `Insert` || k === `Enter`) insertColumn();
    else if ((TECHNIQUES as readonly string[]).includes(k)) toggleTechnique(k as Technique);
    else handled = false;
    if (handled) e.preventDefault();
  };

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });
  const press = (fn: () => void) => () => {
    fn();
    focusGrid();
  };

  const selectedCell = current && current !== `|` ? current[cursor.string] : null;

  // Tapping the neck: neck string 0 is the lowest string, tab row 0 is the highest.
  const pickFromNeck = (neckString: number, actualFret: number) => {
    const row = stringCount - 1 - neckString;
    const f = actualFret - capo;
    if (f < 0) return;
    let targetStep = step;
    let base = steps;
    if (current === `|` || current === undefined) {
      base = [...steps];
      base.splice(step + 1, 0, emptyColumn(stringCount));
      targetStep = step + 1;
    }
    const col = base[targetStep] as (TabCell | null)[];
    const existing = col[row];
    const nextCol = col.map((c, j) => (j === row ? (existing && existing.f === f ? null : { f }) : c));
    const next = base.map((s, i) => (i === targetStep ? nextCol : s));
    lastDigit.current = null;
    if (advance && !(existing && existing.f === f)) {
      if (targetStep + 1 >= next.length) next.push(emptyColumn(stringCount));
      commit(next, { step: targetStep + 1, string: row });
    } else {
      commit(next, { step: targetStep, string: row });
    }
  };
  const neckNotes = (s: TabStep | undefined) =>
    s && s !== `|` ? s.flatMap((c, row) => (c && typeof c.f === `number` ? [{ string: stringCount - 1 - row, fret: c.f + capo, text: cellText(c) }] : [])) : [];
  const nowNotes = neckNotes(current);
  // Every note in the tab, once per position, so the whole line shows on the neck.
  const allNotes = new Map<string, { string: number; fret: number; text: string; order: number[] }>();
  steps.forEach((s, i) => {
    if (i === step) return;
    for (const n of neckNotes(s)) {
      const key = `${n.string}-${n.fret}`;
      const hit = allNotes.get(key);
      if (hit) hit.order.push(i + 1);
      else allNotes.set(key, { ...n, order: [i + 1] });
    }
  });

  return (
    <div className="tab-editor">
      <div
        ref={gridRef}
        className="tab-editor__grid"
        tabIndex={0}
        role="grid"
        aria-label="Tab editor. Use arrow keys to move, digits to enter frets."
        onKeyDown={onKeyDown}
      >
        <div className="tab-editor__labels" aria-hidden>
          {stringLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        {steps.map((s, i) =>
          s === `|` ? (
            <div
              key={i}
              data-step={i}
              className={`tab-editor__bar${i === step ? ` tab-editor__bar--active` : ``}`}
              onClick={() => {
                setCursor({ step: i, string: cursor.string });
                focusGrid();
              }}
            />
          ) : (
            <div key={i} data-step={i} className={`tab-editor__col${i === step ? ` tab-editor__col--active` : ``}`}>
              {Array.from({ length: stringCount }, (_, j) => {
                const text = cellText(s[j]);
                const active = i === step && j === cursor.string;
                return (
                  <button
                    key={j}
                    type="button"
                    tabIndex={-1}
                    className={`tab-editor__cell${active ? ` tab-editor__cell--active` : ``}${text ? ` tab-editor__cell--filled` : ``}`}
                    onClick={() => {
                      lastDigit.current = null;
                      setCursor({ step: i, string: j });
                      focusGrid();
                    }}
                    aria-label={`${stringLabels[j]} string, column ${i + 1}${text ? `, ${text}` : ``}`}
                  >
                    {text || `–`}
                  </button>
                );
              })}
            </div>
          ),
        )}
      </div>

      <div className="tab-editor__keypad" role="group" aria-label="Tab keypad">
        <div className="tab-editor__digits">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
            <button key={d} type="button" className="tab-key" onClick={press(() => enterDigit(d))}>
              {d}
            </button>
          ))}
          <button type="button" className="tab-key" onClick={press(() => updateCell((c) => ({ f: `x`, ...(c?.t ? { t: c.t } : {}) })))} title="Muted note">
            x
          </button>
          <button type="button" className="tab-key tab-key--muted" onClick={press(() => updateCell(() => null))} title="Clear cell">
            ⌫
          </button>
        </div>
        <div className="tab-editor__techniques">
          {TECHNIQUES.map((t) => (
            <button
              key={t}
              type="button"
              className={`tab-key tab-key--tech${selectedCell?.t === t ? ` tab-key--on` : ``}`}
              onClick={press(() => toggleTechnique(t))}
              title={TECHNIQUE_NAMES[t]}
              aria-label={TECHNIQUE_NAMES[t]}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="tab-editor__moves">
          <button type="button" className="tab-key" onClick={press(() => move(-1, 0))} aria-label="Previous column">
            ←
          </button>
          <button type="button" className="tab-key" onClick={press(() => move(0, -1))} aria-label="String up">
            ↑
          </button>
          <button type="button" className="tab-key" onClick={press(() => move(0, 1))} aria-label="String down">
            ↓
          </button>
          <button type="button" className="tab-key" onClick={press(() => move(1, 0))} aria-label="Next column">
            →
          </button>
          <button type="button" className="tab-key tab-key--wide" onClick={press(insertColumn)}>
            + Col
          </button>
          <button type="button" className="tab-key tab-key--wide" onClick={press(insertBar)}>
            + Bar
          </button>
          <button type="button" className="tab-key tab-key--wide tab-key--danger" onClick={press(deleteColumn)}>
            Del col
          </button>
        </div>
        <label className="ex-check tab-editor__neck-toggle">
          <input
            type="checkbox"
            checked={showNeck}
            onChange={(e) => {
              setShowNeck(e.target.checked);
              savePref(`tab-neck`, e.target.checked ? `on` : `off`);
            }}
          />
          Fretboard
        </label>
        <p className="tab-editor__hint">
          Keyboard: digits enter frets (type 1 then 2 fast for 12) · arrows/space move · h p / \ b r ~ t techniques · x mute · | bar · Enter
          adds a column · Shift+Delete removes it
        </p>
      </div>

      {showNeck && (
        <div className="tab-editor__neck">
          <div className="tab-editor__neck-bar">
            <span className="field__label">Whole tab shown · tap the neck to enter a note in column {step + 1} (highlighted)</span>
            <label className="ex-check">
              <input
                type="checkbox"
                checked={advance}
                onChange={(e) => {
                  setAdvance(e.target.checked);
                  savePref(`tab-neck-advance`, e.target.checked ? `on` : `off`);
                }}
              />
              Move to next column after each tap
            </label>
          </div>
          <Neck stringCount={stringCount} capo={capo} onPick={pickFromNeck} label="Tap a string and fret to add it to the tab">
            {[...allNotes.values()].map((n) => (
              <NeckMarker key={`a${n.string}-${n.fret}`} string={n.string} stringCount={stringCount} fret={n.fret} label={n.text} variant="dot" capo={capo} />
            ))}
            {nowNotes.map((n) => (
              <NeckMarker key={`n${n.string}-${n.fret}`} string={n.string} stringCount={stringCount} fret={n.fret} label={n.text} variant="press" capo={capo} />
            ))}
          </Neck>
        </div>
      )}
    </div>
  );
}
