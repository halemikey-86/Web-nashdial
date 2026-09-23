import { KEYS } from '../music/notes';
import { conversionRows, conversionSummary, describeInterval, intervalBetween } from '../music/transpose';

export function TransposeConversion({ fromKeyIndex, toKeyIndex, scaleId }: { fromKeyIndex: number; toKeyIndex: number; scaleId: string }) {
  if (fromKeyIndex === toKeyIndex) {
    return <p className="transpose-conversion transpose-conversion--idle">Dial to transpose from {KEYS[fromKeyIndex].label}.</p>;
  }
  const rows = conversionRows(fromKeyIndex, toKeyIndex, scaleId);
  return (
    <div className="transpose-conversion">
      <p className="transpose-conversion__summary">{conversionSummary(fromKeyIndex, toKeyIndex, scaleId)}</p>
      <p className="transpose-conversion__interval">{describeInterval(intervalBetween(fromKeyIndex, toKeyIndex))}</p>
      <ul className="transpose-conversion__list">
        {rows.map((r) => (
          <li key={r.degree} className="transpose-conversion__row">
            <span className="transpose-conversion__degree">{r.degree}</span>
            <span className="transpose-conversion__from">{r.from}</span>
            <span className="transpose-conversion__arrow" aria-hidden>
              →
            </span>
            <span className="transpose-conversion__to">{r.to}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
