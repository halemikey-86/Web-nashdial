import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { emptyColumn } from './model';
import { cellText } from './TabDisplay';
import { TECHNIQUES, TECHNIQUE_NAMES, type TabBlock, type TabCell, type TabStep, type Technique } from './types';

interface TabEditorProps {
  block: TabBlock;
  stringLabels: string[];
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
export function TabEditor({ block, stringLabels, onChange }: TabEditorProps) {
  const stringCount = stringLabels.length;
  const [cursor, setCursor] = useState<Cursor>({ step: 0, string: 0 });
  const lastDigit = useRef<{ at: number; step: number; string: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const steps = block.steps;

  // Keep the cursor inside the grid as columns are removed.
  const step = Math.min(cursor.step, Math.max(0, steps.length - 1));
  const current = steps[step];

  useEffect(() => {
    gridRef.current?.querySelector(`[data-step="${step}"]`)?.scrollIntoView({ block: `nearest`, inline: `nearest` });
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
        <p className="tab-editor__hint">
          Keyboard: digits enter frets (type 1 then 2 fast for 12) · arrows/space move · h p / \ b r ~ t techniques · x mute · | bar · Enter
          adds a column · Shift+Delete removes it
        </p>
      </div>
    </div>
  );
}
