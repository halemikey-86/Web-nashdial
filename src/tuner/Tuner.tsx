import { useEffect, useMemo, useRef, useState } from 'react';
import { pluckHz, unlockAudio } from '../audio';
import { PageHeader } from '../components/ui';
import { INSTRUMENTS, TUNINGS, getTuning, openStringMidi } from '../music/tunings';
import { loadPref, savePref } from '../songs/storage';
import { NOTE_NAMES, centsOff, detectPitch, hzToMidi, midiLabel, midiToHz } from './pitch';

/** A tuning fork. */
export function TuningForkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M8 3v7a4 4 0 0 0 8 0V3" />
      <line x1="12" y1="14" x2="12" y2="21" />
    </svg>
  );
}

const IN_TUNE_CENTS = 5;
const CUSTOM = `custom`;

function loadTargets(presetId: string): number[] {
  if (presetId === CUSTOM) {
    try {
      const saved = JSON.parse(localStorage.getItem(`nashdial-tuner-custom`) ?? `null`);
      if (Array.isArray(saved) && saved.every((n) => typeof n === `number`)) return saved;
    } catch {
      // fall through
    }
  }
  return openStringMidi(getTuning(presetId === CUSTOM ? `standard` : presetId));
}

interface Reading {
  hz: number;
  /** Index into targets of the string being tuned. */
  string: number;
  cents: number;
}

/** Guitar/bass tuner using the microphone. Every string's target note can be changed. */
export function Tuner() {
  const [presetId, setPresetId] = useState(() => loadPref<string>(`tuner-preset`, `standard`));
  const [targets, setTargets] = useState<number[]>(() => loadTargets(loadPref<string>(`tuner-preset`, `standard`)));
  const [a4, setA4] = useState(() => loadPref<number>(`tuner-a4`, 440));
  const [selected, setSelected] = useState<number | `auto`>(`auto`);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [inTune, setInTune] = useState<Set<number>>(new Set());
  const mic = useRef<{ stop: () => void } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Strings shown highest first, like tab and the neck views.
  const order = useMemo(() => targets.map((_, i) => i).reverse(), [targets]);
  const targetHz = targets.map((m) => midiToHz(m, a4));
  const targetsRef = useRef(targetHz);
  targetsRef.current = targetHz;

  const choosePreset = (id: string) => {
    setPresetId(id);
    savePref(`tuner-preset`, id);
    setTargets(loadTargets(id));
    setSelected(`auto`);
    setInTune(new Set());
  };
  const setTarget = (i: number, midi: number) => {
    const next = targets.map((m, j) => (j === i ? midi : m));
    setTargets(next);
    setPresetId(CUSTOM);
    savePref(`tuner-preset`, CUSTOM);
    try {
      localStorage.setItem(`nashdial-tuner-custom`, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
    setInTune((s) => {
      const n = new Set(s);
      n.delete(i);
      return n;
    });
  };
  const addString = (delta: 1 | -1) => {
    if (delta === 1 && targets.length < 8) {
      const top = targets[targets.length - 1] ?? 64;
      setTargetList([...targets, top + 5]);
    } else if (delta === -1 && targets.length > 1) setTargetList(targets.slice(0, -1));
  };
  const setTargetList = (next: number[]) => {
    setTargets(next);
    setPresetId(CUSTOM);
    savePref(`tuner-preset`, CUSTOM);
    try {
      localStorage.setItem(`nashdial-tuner-custom`, JSON.stringify(next));
    } catch {
      // storage unavailable
    }
  };

  const stop = () => {
    mic.current?.stop();
    mic.current = null;
    setListening(false);
    setReading(null);
  };

  const start = async () => {
    setError(null);
    const ctx = unlockAudio();
    if (!ctx || !navigator.mediaDevices?.getUserMedia) {
      setError(`This browser can't use the microphone.`);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      setError(`Microphone access was blocked. Allow it in your browser settings and try again.`);
      return;
    }
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const recent: number[] = [];
    let silentFrames = 0;
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const hzTargets = targetsRef.current;
      const lowest = Math.min(...hzTargets);
      const highest = Math.max(...hzTargets);
      const hz = detectPitch(buf, ctx.sampleRate, Math.max(25, lowest * 0.55), Math.min(2000, highest * 2.2));
      if (hz === null) {
        if (++silentFrames > 12) setReading(null);
        return;
      }
      silentFrames = 0;
      recent.push(hz);
      if (recent.length > 5) recent.shift();
      const smooth = [...recent].sort((x, y) => x - y)[Math.floor(recent.length / 2)];
      const sel = selectedRef.current;
      const string =
        sel === `auto`
          ? hzTargets.reduce((best, t, i) => (Math.abs(centsOff(smooth, t)) < Math.abs(centsOff(smooth, hzTargets[best])) ? i : best), 0)
          : sel;
      const cents = centsOff(smooth, hzTargets[string]);
      setReading({ hz: smooth, string, cents });
      if (Math.abs(cents) <= IN_TUNE_CENTS) setInTune((s) => (s.has(string) ? s : new Set(s).add(string)));
    }, 70);
    mic.current = {
      stop: () => {
        window.clearInterval(timer);
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
    setListening(true);
  };
  useEffect(() => () => mic.current?.stop(), []);

  const reference = (i: number) => {
    unlockAudio();
    pluckHz(targetHz[i], 0, 0.3, 2.5);
  };

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const good = reading !== null && Math.abs(reading.cents) <= IN_TUNE_CENTS;
  const detectedNote = reading ? midiLabel(hzToMidi(reading.hz, a4)) : `—`;
  const target = reading ? targets[reading.string] : null;

  return (
    <div className="page tuner">
      <PageHeader
        title={
          <span className="drums-home__title">
            <TuningForkIcon size={22} /> Tuner
          </span>
        }
      />

      <div className="tuner__main card">
        <div className={`tuner__display${good ? ` tuner__display--good` : ``}`}>
          <div className="tuner__note">{detectedNote}</div>
          <div className="tuner__hz">{reading ? `${reading.hz.toFixed(1)} Hz` : listening ? `Pluck a string…` : `Tap Start and allow the microphone`}</div>
          <div className="tuner__gauge" aria-label={reading ? `${Math.round(reading.cents)} cents` : `No reading`}>
            <div className="tuner__scale">
              {[-50, -25, 0, 25, 50].map((c) => (
                <span key={c} style={{ left: `${50 + c}%` }}>
                  {c > 0 ? `+${c}` : c}
                </span>
              ))}
            </div>
            <div className="tuner__zone" />
            <div className="tuner__needle" style={{ left: `${50 + cents}%`, opacity: reading ? 1 : 0.25 }} />
          </div>
          <div className="tuner__verdict">
            {reading && target !== null ? (
              good ? (
                <>In tune ✓ {midiLabel(target)}</>
              ) : (
                <>
                  {reading.cents < 0 ? `Flat — tighten` : `Sharp — loosen`} toward <strong>{midiLabel(target)}</strong> ({reading.cents > 0 ? `+` : ``}
                  {Math.round(reading.cents)}¢)
                </>
              )
            ) : (
              <>&nbsp;</>
            )}
          </div>
        </div>
        <div className="tuner__controls">
          <button type="button" className="btn btn--primary" onClick={() => (listening ? stop() : start())}>
            {listening ? `■ Stop` : `🎤 Start tuner`}
          </button>
          <div className="segmented tuner__mode" role="group" aria-label="Which string">
            <button type="button" className={`segmented__btn${selected === `auto` ? ` segmented__btn--active` : ``}`} onClick={() => setSelected(`auto`)}>
              Auto-detect string
            </button>
          </div>
        </div>
        {error && <p className="tuner__error">{error}</p>}
      </div>

      <div className="tuner__setup card">
        <div className="tuner__preset">
          <label className="field">
            <span className="field__label">Tuning</span>
            <select className="input" value={presetId} onChange={(e) => choosePreset(e.target.value)}>
              {INSTRUMENTS.map((inst) => (
                <optgroup key={inst.id} label={inst.label}>
                  {TUNINGS.filter((t) => t.instrument === inst.id).map((t) => (
                    <option key={t.id} value={t.id}>
                      {inst.label} · {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM}>My own tuning</option>
            </select>
          </label>
          <label className="field tuner__a4">
            <span className="field__label">A4 =</span>
            <select
              className="input"
              value={a4}
              onChange={(e) => {
                const v = Number(e.target.value);
                setA4(v);
                savePref(`tuner-a4`, v);
              }}
            >
              {[432, 435, 438, 439, 440, 441, 442, 443, 444, 446].map((v) => (
                <option key={v} value={v}>
                  {v} Hz
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="theory__hint">Tap a string to tune only that one. Change any string's note to tune it however you like — it's saved as “My own tuning”.</p>

        <ul className="tuner__strings">
          {order.map((i) => {
            const midi = targets[i];
            const octave = Math.floor(midi / 12) - 1;
            const pc = ((midi % 12) + 12) % 12;
            const active = reading?.string === i;
            return (
              <li
                key={i}
                className={`tuner__string${selected === i ? ` tuner__string--selected` : ``}${active ? ` tuner__string--active` : ``}${inTune.has(i) ? ` tuner__string--done` : ``}`}
              >
                <button type="button" className="tuner__string-pick" onClick={() => setSelected(selected === i ? `auto` : i)} aria-pressed={selected === i}>
                  <span className="tuner__string-num">{targets.length - i}</span>
                  <span className="tuner__string-note">{midiLabel(midi)}</span>
                  <span className="tuner__string-hz">{targetHz[i].toFixed(1)} Hz</span>
                  {inTune.has(i) && <span className="tuner__check">✓</span>}
                </button>
                <select className="input input--compact" value={pc} onChange={(e) => setTarget(i, (octave + 1) * 12 + Number(e.target.value))} aria-label={`String ${targets.length - i} note`}>
                  {NOTE_NAMES.map((n, k) => (
                    <option key={n} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
                <select className="input input--compact" value={octave} onChange={(e) => setTarget(i, (Number(e.target.value) + 1) * 12 + pc)} aria-label={`String ${targets.length - i} octave`}>
                  {[0, 1, 2, 3, 4, 5].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn--small" onClick={() => reference(i)} aria-label={`Play ${midiLabel(midi)}`}>
                  ▶ Tone
                </button>
              </li>
            );
          })}
        </ul>
        <div className="tuner__string-count">
          <button type="button" className="btn btn--small" onClick={() => addString(-1)} disabled={targets.length <= 1}>
            − String
          </button>
          <button type="button" className="btn btn--small" onClick={() => addString(1)} disabled={targets.length >= 8}>
            + String
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setInTune(new Set())} disabled={!inTune.size}>
            Clear ✓ marks
          </button>
        </div>
      </div>
    </div>
  );
}
