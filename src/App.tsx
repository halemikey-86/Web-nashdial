import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChordShapes } from './components/ChordShapes';
import { CapoGuide } from './components/CapoGuide';
import { Fretboard, type FretboardBoard, type FretboardLabels, type FretboardView } from './components/Fretboard';
import { TheoryPanel } from './components/TheoryPanel';
import { PIECE_ORDER, type PieceType } from './music/tetrisShapes';
import { loadPref, savePref } from './songs/storage';
import { WarmUp } from './warmup/WarmUp';
import { DrumsHome, DrumsticksIcon } from './songs/DrumView';
import { Tuner, TuningForkIcon } from './tuner/Tuner';
import { KeyDial } from './components/KeyDial';
import { CapoSelector, InstrumentSelector, NashvilleNumbers, ScaleSelector, TuningSelector, ViewTabs } from './components/Selectors';
import { ThemeJack } from './components/ThemeJack';
import { useMediaQuery } from './hooks/useMediaQuery';
import { KEYS } from './music/notes';
import { DEFAULT_SCALE_ID, getScale, shapeKeyLabel } from './music/scales';
import { DEFAULT_INSTRUMENT, DEFAULT_TUNING, defaultTuningFor, getTuning, tuningsFor, type InstrumentId } from './music/tunings';
import { navigate, useRoute, type Route } from './router';
import { SetlistEditor, SetlistList } from './songs/Setlists';
import { SongEditor } from './songs/SongEditor';
import { SongLibrary } from './songs/SongLibrary';
import { SetPlay, SongView, type OpenInDial } from './songs/StageRoutes';
import { getTheme, loadTheme, saveTheme } from './themes';

type MainView = 'fretboard' | 'chords' | 'theory';
type Mode = 'dial' | 'songs' | 'sets' | 'drums' | 'warmup' | 'tuner';

const VIEW_OPTIONS: { id: MainView; label: string }[] = [
  { id: `fretboard`, label: `Fretboard` },
  { id: `chords`, label: `Chords` },
  { id: `theory`, label: `Theory` },
];

const MODES: { id: Mode; label: string; icon: ReactNode; route: Route }[] = [
  { id: `dial`, label: `Dial`, icon: `◎`, route: { name: `dial` } },
  { id: `songs`, label: `Songs`, icon: `♫`, route: { name: `songs` } },
  { id: `sets`, label: `Setlists`, icon: `☰`, route: { name: `sets` } },
  { id: `drums`, label: `Drums`, icon: <DrumsticksIcon size={18} />, route: { name: `drums` } },
  { id: `warmup`, label: `Warm-up`, icon: `✋︎`, route: { name: `warmup`, id: null } },
  { id: `tuner`, label: `Tuner`, icon: <TuningForkIcon size={18} />, route: { name: `tuner` } },
];

function modeOf(route: Route): Mode {
  if (route.name === `dial`) return `dial`;
  if (route.name === `warmup`) return `warmup`;
  if (route.name === `drums`) return `drums`;
  if (route.name === `tuner`) return `tuner`;
  if (route.name.startsWith(`song`)) return `songs`;
  return `sets`;
}

function ModeNav({ mode }: { mode: Mode }) {
  return (
    <nav className="mode-nav" aria-label="Sections">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`mode-nav__btn${mode === m.id ? ` mode-nav__btn--active` : ``}`}
          aria-current={mode === m.id ? `page` : undefined}
          onClick={() => navigate(m.route)}
        >
          <span className="mode-nav__icon" aria-hidden>
            {m.icon}
          </span>
          {m.label}
        </button>
      ))}
    </nav>
  );
}

export function App() {
  const route = useRoute();
  const mode = modeOf(route);
  const onStage = route.name === `song` || route.name === `set-play`;

  const [keyIndex, setKeyIndex] = useState(0);
  const [scaleId, setScaleId] = useState(DEFAULT_SCALE_ID);
  const [instrument, setInstrument] = useState<InstrumentId>(DEFAULT_INSTRUMENT);
  const [tuningId, setTuningId] = useState(DEFAULT_TUNING.id);
  const [capo, setCapo] = useState(0);
  const [view, setView] = useState<MainView>(`fretboard`);
  const [fretView, setFretViewState] = useState<FretboardView>(() => loadPref<string>(`fret-view`, `blocks`) as FretboardView);
  const [board, setBoardState] = useState<FretboardBoard>(() => (loadPref<string>(`fret-board`, `grid`) === `neck` ? `neck` : `grid`));
  const [visiblePieces, setVisiblePieces] = useState<Set<PieceType>>(() => new Set(PIECE_ORDER));
  const [labels, setLabelsState] = useState<FretboardLabels>(() => (loadPref<string>(`fret-labels`, `notes`) === `intervals` ? `intervals` : `notes`));
  const setLabels = (l: FretboardLabels) => {
    setLabelsState(l);
    savePref(`fret-labels`, l);
  };
  const setFretView = (v: FretboardView) => {
    setFretViewState(v);
    savePref(`fret-view`, v);
  };
  const setBoard = (b: FretboardBoard) => {
    setBoardState(b);
    savePref(`fret-board`, b);
  };
  const [themeId, setThemeId] = useState(loadTheme);
  const desktop = useMediaQuery(`(min-width: 960px)`);

  const theme = getTheme(themeId);
  const root = KEYS[keyIndex].root;
  const tunings = useMemo(() => tuningsFor(instrument), [instrument]);
  const tuning = useMemo(() => tunings.find((t) => t.id === tuningId) ?? defaultTuningFor(instrument), [tunings, tuningId, instrument]);
  const scale = getScale(scaleId);
  const shapeKey = capo > 0 ? shapeKeyLabel(keyIndex, scaleId, capo) : null;

  const pickInstrument = (id: InstrumentId) => {
    setInstrument(id);
    setTuningId(defaultTuningFor(id).id);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
    saveTheme(themeId);
  }, [themeId]);

  // Load a song's key, scale, tuning and capo onto the dials/fretboard.
  const openInDial: OpenInDial = (song, playKey, songCapo) => {
    const t = getTuning(song.tuningId);
    setKeyIndex(playKey);
    setScaleId(song.scaleId);
    setInstrument(t.instrument);
    setTuningId(t.id);
    setCapo(songCapo);
    navigate({ name: `dial` });
  };

  const dialScreen = (
    <>
      <div className="amp__brand">
        <span className="amp__brand-detail">
          {KEYS[keyIndex].label} {scale.shortName}
          {capo > 0 && ` · Capo ${capo}`}
        </span>
        {shapeKey && <span className="amp__brand-shape-key">Think in {shapeKey} shapes</span>}
      </div>
      <main className={`app__main${desktop ? ` app__main--desktop` : ``}`}>
        <section className="app__col-dial">
          <div className="app__dial-primary">
            <p className="app__dial-label">Key</p>
            <KeyDial selectedIndex={keyIndex} scaleId={scaleId} onChange={setKeyIndex} variant="primary" />
          </div>
        </section>
        <section className="app__col-controls">
          <InstrumentSelector instrumentId={instrument} onChange={pickInstrument} />
          <NashvilleNumbers root={root} scaleId={scaleId} />
          <div className="app__controls-row">
            <ScaleSelector scaleId={scaleId} onChange={setScaleId} />
            <TuningSelector selectedId={tuning.id} tunings={tunings} onChange={setTuningId} />
          </div>
          <CapoSelector capoFret={capo} onChange={setCapo} />
          <CapoGuide keyIndex={keyIndex} scaleId={scaleId} capo={capo} onPickCapo={setCapo} />
        </section>
        <section className="app__col-view">
          <ViewTabs view={view} onChange={setView} options={VIEW_OPTIONS} label="Main view" />
          <div className="app__tab-panel" role="tabpanel">
            {view === `fretboard` ? (
              <Fretboard
                tuning={tuning}
                root={root}
                scaleId={scaleId}
                capoFret={capo}
                view={fretView}
                onViewChange={setFretView}
                board={board}
                onBoardChange={setBoard}
                labels={labels}
                onLabelsChange={setLabels}
                visiblePieces={visiblePieces}
                onVisiblePiecesChange={setVisiblePieces}
                fretCount={24}
                compact={desktop}
              />
            ) : view === `chords` ? (
              <ChordShapes root={root} scaleId={scaleId} tuning={tuning} capoFret={capo} />
            ) : (
              <TheoryPanel keyIndex={keyIndex} scaleId={scaleId} capo={capo} onPickCapo={setCapo} />
            )}
          </div>
        </section>
      </main>
    </>
  );

  let content;
  switch (route.name) {
    case `dial`:
      content = dialScreen;
      break;
    case `songs`:
      content = <SongLibrary />;
      break;
    case `song`:
      content = <SongView key={route.id} songId={route.id} onOpenInDial={openInDial} />;
      break;
    case `song-edit`:
      content = <SongEditor key={route.id ?? `new`} songId={route.id} />;
      break;
    case `sets`:
      content = <SetlistList />;
      break;
    case `set`:
      content = <SetlistEditor setlistId={route.id} />;
      break;
    case `set-play`:
      content = <SetPlay setlistId={route.id} index={route.index} onOpenInDial={openInDial} />;
      break;
    case `warmup`:
      content = <WarmUp exerciseId={route.id} />;
      break;
    case `drums`:
      content = <DrumsHome />;
      break;
    case `tuner`:
      content = <Tuner />;
      break;
  }

  return (
    <div className="app">
      <div className={`amp amp--${themeId} amp--mode-${mode}${onStage ? ` amp--stage` : ``}`}>
        <header className="amp__grille">
          <ThemeJack themeId={themeId} onChange={setThemeId} />
          <div className="amp__header">
            <h1 className="amp__logo" style={{ fontFamily: theme.logoFont }}>
              NashDial
            </h1>
            <p className="amp__subtitle" style={{ fontFamily: theme.logoFont }}>
              {theme.subtitle}
            </p>
          </div>
          <ModeNav mode={mode} />
        </header>
        <div className="amp__panel">{content}</div>
        <div className="amp__tolex" aria-hidden="true" />
      </div>
    </div>
  );
}
