import { useState } from 'react';
import { strum, unlockAudio } from '../audio';
import { KEYS, keyLabel, mod12, noteIndex, spellInKey } from '../music/notes';
import { diatonicChords, getScale, nashvilleLabels, relativeKeyIndex, scaleNotes, type DiatonicChord } from '../music/scales';
import { INTERVAL_NAMES, keySignature, progressionChords, progressionsFor, seventhChords, stepPattern } from '../music/theory';
import { CapoGuide } from './CapoGuide';

/** A close-voiced triad around middle C for hearing a chord. */
function chordMidi(chord: DiatonicChord): number[] {
  const root = 48 + noteIndex(chord.root);
  const third = chord.quality === `minor` || chord.quality === `dim` ? 3 : 4;
  const fifth = chord.quality === `dim` ? 6 : chord.quality === `aug` ? 8 : 7;
  return [root, root + third, root + fifth, root + 12];
}

function playChords(chords: DiatonicChord[], bpm = 90) {
  unlockAudio();
  const beat = 60 / bpm;
  chords.forEach((c, i) => setTimeout(() => strum(chordMidi(c)), i * beat * 2 * 1000));
}

interface TheoryPanelProps {
  keyIndex: number;
  scaleId: string;
  capo: number;
  onPickCapo: (c: number) => void;
}

/** Quick reference for the selected key: formula, key signature, chords, progressions, intervals, capo. */
export function TheoryPanel({ keyIndex, scaleId, capo, onPickCapo }: TheoryPanelProps) {
  const [playing, setPlaying] = useState<string | null>(null);
  const root = KEYS[keyIndex].root;
  const scale = getScale(scaleId);
  const notes = scaleNotes(root, scaleId);
  const degrees = nashvilleLabels(scaleId);
  const steps = stepPattern(scaleId);
  const sig = keySignature(keyIndex, scaleId);
  const sevenths = seventhChords(root, scaleId);
  const triads = diatonicChords(root, scaleId);
  const progressions = progressionsFor(scaleId);
  const relative = relativeKeyIndex(keyIndex, scaleId);
  const inScale = new Set(notes);

  const play = (name: string, chords: DiatonicChord[]) => {
    setPlaying(name);
    playChords(chords);
    setTimeout(() => setPlaying((p) => (p === name ? null : p)), chords.length * 1333 + 400);
  };

  return (
    <div className="theory">
      <section className="theory__card">
        <h3 className="theory__title">
          {keyLabel(keyIndex, scaleId)} {scale.name}
        </h3>
        <div className="theory__formula">
          {notes.map((n, i) => (
            <span key={n} className="theory__step">
              <span className={`theory__note${i === 0 ? ` theory__note--root` : ``}`}>
                <span className="theory__note-name">{spellInKey(n, root, scaleId)}</span>
                <span className="theory__note-degree">{degrees[i]}</span>
              </span>
              <span className="theory__gap">{steps[i]}</span>
            </span>
          ))}
          <span className="theory__note theory__note--root">
            <span className="theory__note-name">{spellInKey(root, root, scaleId)}</span>
            <span className="theory__note-degree">8</span>
          </span>
        </div>
        <p className="theory__hint">W = whole step (2 frets) · H = half step (1 fret). The pattern is the same in every key.</p>
        <ul className="theory__facts">
          {sig && <li>Key signature: {sig.label}</li>}
          {relative !== null && (
            <li>
              Relative {scaleId === `major` ? `minor` : `major`}: {keyLabel(relative, scaleId === `major` ? `natural-minor` : `major`)}
              {scaleId === `major` ? `m` : ``} — same notes, different home note
            </li>
          )}
          <li>
            Parallel {scaleId === `major` ? `minor` : `major`}: {keyLabel(keyIndex, scaleId === `major` ? `natural-minor` : `major`)}
            {scaleId === `major` ? `m` : ``} — same home note, different notes
          </li>
        </ul>
      </section>

      <section className="theory__card">
        <h3 className="theory__title">Chords in this key</h3>
        {sevenths.length ? (
          <table className="theory__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Triad</th>
                <th>7th chord</th>
                <th>Notes</th>
                <th aria-label="Play" />
              </tr>
            </thead>
            <tbody>
              {sevenths.map((c, i) => (
                <tr key={c.degree}>
                  <td className="theory__degree">{degrees[i]}</td>
                  <td>
                    <strong>{triads[i].label}</strong>
                  </td>
                  <td>
                    {c.label} <span className="theory__muted">{c.quality}</span>
                  </td>
                  <td className="theory__tones">{c.tones.join(` `)}</td>
                  <td>
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => play(`c${i}`, [triads[i]])} aria-label={`Play ${triads[i].label}`}>
                      ▶
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="theory__chips">
            {triads.map((c, i) => (
              <button key={c.degree} type="button" className="chip-btn" onClick={() => play(`c${i}`, [c])}>
                {degrees[i]} · {c.label}
              </button>
            ))}
          </div>
        )}
        <p className="theory__hint">Uppercase numbers are major chords, lowercase minor, ° diminished.</p>
      </section>

      {progressions.length > 0 && (
        <section className="theory__card">
          <h3 className="theory__title">Common progressions</h3>
          <ul className="theory__progressions">
            {progressions.map((p) => {
              const chords = progressionChords(root, scaleId, p);
              return (
                <li key={p.name} className="theory__progression">
                  <button
                    type="button"
                    className={`btn btn--small${playing === p.name ? ` btn--primary` : ``}`}
                    onClick={() => play(p.name, chords)}
                    aria-label={`Play ${p.name}`}
                  >
                    ▶
                  </button>
                  <div>
                    <span className="theory__prog-name">{p.name}</span>
                    <span className="theory__prog-chords">{chords.map((c) => c.label).join(` – `)}</span>
                    <span className="theory__muted">{p.feel}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="theory__card">
        <h3 className="theory__title">Intervals from {keyLabel(keyIndex, scaleId)}</h3>
        <table className="theory__table theory__table--intervals">
          <thead>
            <tr>
              <th>Frets</th>
              <th>Interval</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {INTERVAL_NAMES.map((name, st) => {
              const note = KEYS[mod12(keyIndex + st)];
              const on = inScale.has(note.root);
              return (
                <tr key={name} className={on ? `theory__row--in` : `theory__row--out`}>
                  <td>{st}</td>
                  <td>{name}</td>
                  <td>
                    <strong>{spellInKey(note.root, root, scaleId)}</strong>
                    {on && st > 0 && st < 12 ? <span className="theory__muted"> in scale</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="theory__hint">On one string, each fret is a half step: move up the number of frets to find the interval.</p>
      </section>

      <section className="theory__card">
        <h3 className="theory__title">Capo</h3>
        <CapoGuide keyIndex={keyIndex} scaleId={scaleId} capo={capo} onPickCapo={onPickCapo} />
      </section>
    </div>
  );
}
