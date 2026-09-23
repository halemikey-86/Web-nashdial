import { getScale } from '../music/scales';
import { getTuning, instrumentLabel } from '../music/tunings';
import { spellNote, prefersFlats, transposeChordText, transposeNoteText, transposeTabBlock, type TransposeContext } from './songTranspose';
import { TabDisplay, hasTabContent } from './TabDisplay';
import type { Song } from './types';
import { stringLabels } from './tabStrings';

interface SongSheetProps {
  song: Song;
  ctx: TransposeContext;
  /** Show the sheet header (title, artist, key). */
  header?: boolean;
}

/** Read-only, performance-friendly rendering of a song in the chosen key. */
export function SongSheet({ song, ctx, header = true }: SongSheetProps) {
  const tuning = getTuning(song.tuningId);
  const labels = stringLabels(tuning);
  const scaleName = getScale(song.scaleId).shortName;
  const keyName = spellNote(ctx.playKey, prefersFlats(ctx.playKey, song.scaleId));
  const writtenName = spellNote(ctx.songKey, prefersFlats(ctx.songKey, song.scaleId));
  const sections = song.sections.filter(
    (s) => s.chords.trim() || s.singleNotes.trim() || s.notes.trim() || s.tabs.some((t) => hasTabContent(t.steps)),
  );

  return (
    <article className="sheet">
      {header && (
        <header className="sheet__header">
          <h2 className="sheet__title">{song.title || `Untitled song`}</h2>
          {song.artist && <p className="sheet__artist">{song.artist}</p>}
          <p className="sheet__meta">
            <span className="sheet__chip sheet__chip--key">
              {keyName} {scaleName}
            </span>
            {ctx.playKey !== ctx.songKey && <span className="sheet__chip">written in {writtenName}</span>}
            {ctx.capo > 0 && <span className="sheet__chip">Capo {ctx.capo}</span>}
            {song.bpm && <span className="sheet__chip">{song.bpm} BPM</span>}
            {song.tuningId !== `standard` && (
              <span className="sheet__chip">
                {instrumentLabel(tuning.instrument)} · {tuning.name}
              </span>
            )}
            {ctx.display === `shapes` && ctx.capo > 0 && (
              <span className="sheet__chip sheet__chip--shapes">
                Chord shapes in {spellNote(ctx.playKey - ctx.capo, prefersFlats(ctx.playKey - ctx.capo, song.scaleId))}
              </span>
            )}
          </p>
          {song.notes.trim() && <p className="sheet__notes">{song.notes}</p>}
        </header>
      )}
      {sections.length === 0 && <p className="sheet__empty">Nothing tabbed yet — edit the song to add chords, tabs and notes.</p>}
      <div className="sheet__sections">
        {sections.map((section) => (
          <section key={section.id} className={`sheet-section sheet-section--${section.type}`}>
            <h3 className="sheet-section__label">{section.label}</h3>
            {section.chords.trim() && (
              <pre className="sheet-section__chords">{transposeChordText(section.chords.replace(/\s+$/, ``), ctx)}</pre>
            )}
            {section.tabs
              .filter((t) => hasTabContent(t.steps))
              .map((tab) => (
                <div key={tab.id} className="sheet-section__tab">
                  {tab.label && <p className="sheet-section__sublabel">{tab.label}</p>}
                  <TabDisplay steps={transposeTabBlock(tab, ctx).steps} stringLabels={labels} />
                </div>
              ))}
            {section.singleNotes.trim() && (
              <div className="sheet-section__single">
                <p className="sheet-section__sublabel">Single notes</p>
                <pre className="sheet-section__notes-line">{transposeNoteText(section.singleNotes.trim(), ctx)}</pre>
              </div>
            )}
            {section.notes.trim() && <p className="sheet-section__notes">{section.notes}</p>}
          </section>
        ))}
      </div>
    </article>
  );
}
