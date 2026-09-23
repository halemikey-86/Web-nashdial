import { KEYS, mod12 } from '../music/notes';
import { getScale } from '../music/scales';
import { capoChordMap, easyCapoOptions } from '../music/theory';

/**
 * Under the capo picker: which chord shapes to finger for the chosen capo, and which capo
 * positions turn this key into an easy open-chord key.
 */
export function CapoGuide({ keyIndex, scaleId, capo, onPickCapo }: { keyIndex: number; scaleId: string; capo: number; onPickCapo: (c: number) => void }) {
  const options = easyCapoOptions(keyIndex, scaleId);
  const scale = getScale(scaleId);
  const map = capo > 0 ? capoChordMap(keyIndex, scaleId, capo) : [];
  const shapeKey = KEYS[mod12(keyIndex - capo)].label;

  return (
    <div className="capo-guide">
      {capo > 0 && (
        <>
          <p className="capo-guide__title">
            Capo {capo}: play <strong>{shapeKey} {scale.shortName}</strong> shapes to sound in {KEYS[keyIndex].label}
          </p>
          <div className="capo-guide__chords">
            {map.map(({ shape, sounds }) => (
              <span key={shape.degree} className={`capo-guide__chord capo-guide__chord--${shape.quality}`}>
                <span className="capo-guide__shape">{shape.label}</span>
                <span className="capo-guide__sounds">{sounds.label}</span>
              </span>
            ))}
          </div>
          <p className="capo-guide__legend">Top: shape you finger · Bottom: what it sounds like</p>
        </>
      )}
      {options.length > 0 && (
        <div className="capo-guide__easy">
          <span className="capo-guide__easy-label">Easy capo spots for {KEYS[keyIndex].label}:</span>
          {options.map((o) => (
            <button key={o.capo} type="button" className={`chip-btn capo-guide__option${o.capo === capo ? ` capo-guide__option--on` : ``}`} onClick={() => onPickCapo(o.capo)}>
              Capo {o.capo} → {o.shapeLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
