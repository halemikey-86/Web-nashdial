import type { CSSProperties } from 'react';
import { CAPO_FRETS, capoLabel } from '../music/notes';
import { SCALES, diatonicChords, nashvilleLabels } from '../music/scales';
import { INSTRUMENTS, type InstrumentId, type Tuning } from '../music/tunings';

export function CapoSelector({ capoFret, onChange, id = `capo-select` }: { capoFret: number; onChange: (fret: number) => void; id?: string }) {
  return (
    <div className="capo-selector">
      <label className="capo-selector__label" htmlFor={id}>
        Capo
      </label>
      <div className="capo-selector__wrapper">
        <select id={id} className="capo-selector__select" value={capoFret} onChange={(e) => onChange(Number(e.target.value))}>
          {CAPO_FRETS.map((f) => (
            <option key={f} value={f}>
              {capoLabel(f)}
            </option>
          ))}
        </select>
      </div>
      {capoFret > 0 && <p className="capo-selector__hint">Fret {capoFret} acts as the nut — diagrams show actual finger positions.</p>}
    </div>
  );
}

const SCALE_GROUPS = [
  { label: `Key`, scales: SCALES.filter((s) => s.category === `key`) },
  { label: `Modes`, scales: SCALES.filter((s) => s.category === `modes`) },
  { label: `Scales`, scales: SCALES.filter((s) => s.category === `scales`) },
];

export function ScaleSelector({ scaleId, onChange, id = `scale-select` }: { scaleId: string; onChange: (id: string) => void; id?: string }) {
  return (
    <div className="scale-selector">
      <label className="scale-selector__label" htmlFor={id}>
        Scale / Mode
      </label>
      <div className="scale-selector__wrapper">
        <select id={id} className="scale-selector__select" value={scaleId} onChange={(e) => onChange(e.target.value)}>
          {SCALE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.scales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export function InstrumentSelector({ instrumentId, onChange }: { instrumentId: InstrumentId; onChange: (id: InstrumentId) => void }) {
  return (
    <div className="instrument-selector" role="group" aria-label="Instrument type">
      <span className="instrument-selector__label">Instrument</span>
      <div className="instrument-selector__tabs">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.id}
            type="button"
            className={`instrument-selector__btn${instrumentId === inst.id ? ` instrument-selector__btn--active` : ``}`}
            aria-pressed={instrumentId === inst.id}
            onClick={() => onChange(inst.id)}
          >
            {inst.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TuningSelector({ selectedId, tunings, onChange }: { selectedId: string; tunings: Tuning[]; onChange: (id: string) => void }) {
  return (
    <div className="tuning-selector">
      <label className="tuning-selector__label" htmlFor="tuning-select">
        Tuning
      </label>
      <div className="tuning-selector__wrapper">
        <select id="tuning-select" className="tuning-selector__select" value={selectedId} onChange={(e) => onChange(e.target.value)}>
          {tunings.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function NashvilleNumbers({ root, scaleId }: { root: string; scaleId: string }) {
  const chords = diatonicChords(root, scaleId);
  const degrees = nashvilleLabels(scaleId);
  return (
    <div className="nashville">
      <h2 className="nashville__title">Nashville Numbers</h2>
      <div className="nashville__grid" style={{ '--scale-count': chords.length } as CSSProperties}>
        {chords.map((c, i) => (
          <div key={`${c.root}-${i}`} className={`nashville__cell nashville__cell--${c.quality}`}>
            <span className="nashville__number">{degrees[i]}</span>
            <span className="nashville__chord">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TabOption<T extends string> {
  id: T;
  label: string;
}

export function ViewTabs<T extends string>({
  view,
  onChange,
  options,
  label,
}: {
  view: T;
  onChange: (v: T) => void;
  options: TabOption<T>[];
  label: string;
}) {
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={view === o.id}
          className={`view-tabs__btn${view === o.id ? ` view-tabs__btn--active` : ``}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
