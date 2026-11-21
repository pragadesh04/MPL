'use client';

import confetti from 'canvas-confetti';

/**
 * Auction sounds and celebrations (§7.6–7.8). Sounds are synthesised with the Web Audio API, so
 * there are no audio assets to ship; callers check `useSoundEnabled()` first. Every function is a
 * safe no-op on the server, without audio support, or when the browser blocks autoplay.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  durationMs: number,
  opts: { type?: OscillatorType; gain?: number; delayMs?: number } = {},
): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + (opts.delayMs ?? 0) / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(opts.gain ?? 0.15, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
}

export type AuctionSound = 'tick' | 'bid' | 'outbid' | 'gavel' | 'unsold' | 'open';

export function playSound(sound: AuctionSound): void {
  switch (sound) {
    case 'tick':
      return tone(1200, 60, { type: 'square', gain: 0.05 });
    case 'bid':
      return tone(660, 90, { type: 'triangle' });
    case 'outbid':
      tone(440, 120, { type: 'sawtooth', gain: 0.08 });
      return tone(330, 160, { type: 'sawtooth', gain: 0.08, delayMs: 120 });
    case 'gavel':
      tone(140, 220, { type: 'square', gain: 0.25 });
      return tone(90, 300, { type: 'sine', gain: 0.3, delayMs: 30 });
    case 'unsold':
      return tone(220, 260, { type: 'triangle', gain: 0.1 });
    case 'open':
      tone(523, 90, { type: 'triangle' });
      return tone(784, 140, { type: 'triangle', delayMs: 90 });
  }
}

/** Vibrate the phone (captain outbid), where supported. */
export function haptic(pattern: number | number[] = [80, 40, 80]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** SOLD: confetti in the buying team's colour (a team colour is data, hence the hex here). */
export function celebrateSale(teamColor: string, opts: { big?: boolean } = {}): void {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  const colors = [teamColor, '#ffffff'];
  const count = opts.big ? 220 : 90;
  void confetti({
    particleCount: count,
    spread: 80,
    origin: { y: 0.6 },
    colors,
    disableForReducedMotion: true,
  });
  if (opts.big) {
    void confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors });
    void confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors });
  }
}
