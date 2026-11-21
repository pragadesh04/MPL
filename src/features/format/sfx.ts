'use client';

/**
 * Tiny synthesized sound effects for the draw ceremony and results (no audio files needed).
 * Callers check `useSoundEnabled()` first; everything here fails silently (autoplay rules,
 * no AudioContext).
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  // Browsers refuse audio before the first tap / key press; don't even try (no console noise).
  if (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === false) {
    return null;
  }
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  startIn: number,
  duration: number,
  type: OscillatorType,
  gain = 0.08,
): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startIn;
  vol.gain.setValueAtTime(gain, t0);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

/** A short drum hit (one team drawn). */
export function playDrumHit(): void {
  tone(90, 0, 0.18, 'triangle', 0.2);
  tone(180, 0, 0.06, 'square', 0.03);
}

/** A rising three-note fanfare (draw finished, result saved, champion). */
export function playFanfare(): void {
  [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.25, 'sawtooth', 0.05));
}
