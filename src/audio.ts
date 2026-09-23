import { useCallback, useEffect, useRef, useState } from 'react';

let ctx: AudioContext | null = null;

/** Create (or resume) the audio context. Call from a click/tap so browsers allow sound. */
export function unlockAudio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === `suspended`) void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function running(): AudioContext | null {
  return ctx && ctx.state === `running` ? ctx : null;
}

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A short plucked-string sound. */
export function pluck(midi: number, delay = 0, gain = 0.22): void {
  pluckHz(midiHz(midi), delay, gain);
}

/** A plucked-string sound at an exact frequency (e.g. a tuner reference tone). */
export function pluckHz(hz: number, delay = 0, gain = 0.22, length = 1.4): void {
  const ac = running();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, t + length);
  const filter = ac.createBiquadFilter();
  filter.type = `lowpass`;
  filter.frequency.setValueAtTime(Math.min(9000, hz * 8), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(300, hz * 1.5), t + 0.5);
  filter.connect(out).connect(ac.destination);
  for (const [type, level, detune] of [[`triangle`, 1, 0], [`sawtooth`, 0.25, 4]] as const) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    osc.detune.value = detune;
    g.gain.value = level;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + length + 0.1);
  }
}

/** Strum a set of notes low to high. */
export function strum(midis: number[], gain = 0.14): void {
  [...midis].sort((a, b) => a - b).forEach((m, i) => pluck(m, i * 0.022, gain));
}

/**
 * A clock to keep for a whole run: the audio clock when sound is running (so clicks can be
 * scheduled ahead precisely), otherwise the page clock.
 */
export function pickClock(): { now: () => number; audio: boolean } {
  const ac = running();
  return ac ? { now: () => ac.currentTime, audio: true } : { now: () => performance.now() / 1000, audio: false };
}

/** Seconds on the audio clock (or the page clock when there is no audio). */
export function audioNow(): number {
  const ac = running();
  return ac ? ac.currentTime : performance.now() / 1000;
}

/** Metronome tick; accented on the first beat of a bar. `when` is an audioNow() time. */
export function click(accent = false, when?: number): void {
  const ac = running();
  if (!ac) return;
  const t = Math.max(ac.currentTime, when ?? ac.currentTime);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = `square`;
  osc.frequency.value = accent ? 1760 : 1100;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.12 : 0.07, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

/**
 * Steps through `count` items at `intervalMs`, looping or stopping (calling `onEnd`) at the end.
 * Returns the current index and transport controls.
 */
export function usePlayback(count: number, intervalMs: number, { loop = true, onEnd }: { loop?: boolean; onEnd?: () => void } = {}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (index >= count && count > 0) setIndex(count - 1);
  }, [count, index]);

  useEffect(() => {
    if (!playing || count === 0) return;
    const id = window.setTimeout(() => {
      if (index + 1 < count) setIndex(index + 1);
      else if (loop) setIndex(0);
      else {
        setPlaying(false);
        onEndRef.current?.();
      }
    }, intervalMs);
    return () => window.clearTimeout(id);
  }, [playing, index, count, intervalMs, loop]);

  const toggle = useCallback(() => {
    unlockAudio();
    setPlaying((p) => !p);
  }, []);
  const step = useCallback(
    (delta: number) => {
      unlockAudio();
      setIndex((i) => Math.min(count - 1, Math.max(0, i + delta)));
    },
    [count],
  );
  const jump = useCallback((i: number) => {
    unlockAudio();
    setIndex(i);
  }, []);

  return { index: Math.min(index, Math.max(0, count - 1)), playing, setPlaying, toggle, step, jump, setIndex };
}
