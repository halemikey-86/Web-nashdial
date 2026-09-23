/**
 * Pitch detection with the YIN method: find the lag at which the signal best repeats itself.
 * Works well for plucked strings; returns the frequency in Hz, or null if there's no clear pitch.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 30, maxHz = 1200): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const window = n - maxLag;
  const diff = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const d = buf[i] - buf[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }

  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += diff[lag];
    cmnd[lag] = running === 0 ? 1 : (diff[lag] * lag) / running;
  }

  let lag = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < 0.15) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      lag = t;
      break;
    }
  }
  if (lag === -1) {
    // No dip under the threshold: accept the best one only if it's fairly clear.
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    lag = best;
  }

  // Parabolic interpolation for sub-sample accuracy.
  const a = cmnd[lag - 1] ?? cmnd[lag];
  const b = cmnd[lag];
  const c = cmnd[lag + 1] ?? cmnd[lag];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (a - c) / (2 * denom) : 0;
  return sampleRate / (lag + shift);
}

export const NOTE_NAMES = [`C`, `C♯`, `D`, `D♯`, `E`, `F`, `F♯`, `G`, `G♯`, `A`, `A♯`, `B`];

export function midiToHz(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function hzToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}

export function midiLabel(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Cents from `targetHz` (positive = sharp). */
export function centsOff(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}
