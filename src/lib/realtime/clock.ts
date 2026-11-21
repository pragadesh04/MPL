/**
 * Server clock offset (PLAN §6.1): Postgres now() is the only clock. Clients keep a smoothed
 * offset from every `serverNow` they receive and draw countdowns from `serverTime()`.
 * Pure helpers; Lane B's auction store owns the live instance.
 */

/** Offset (ms) to add to Date.now() to get server time, from one sample. */
export function offsetFromSample(serverNowIso: string, receivedAtMs: number = Date.now()): number {
  return new Date(serverNowIso).getTime() - receivedAtMs;
}

/** Exponential smoothing so one slow response doesn't make the countdown jump. */
export function smoothOffset(previous: number | null, sample: number, weight = 0.3): number {
  return previous === null ? sample : Math.round(previous * (1 - weight) + sample * weight);
}

export function serverTime(offsetMs: number, nowMs: number = Date.now()): number {
  return nowMs + offsetMs;
}

/** Milliseconds left until an ISO deadline, by the server clock. Never negative. */
export function msUntil(
  deadlineIso: string | null,
  offsetMs: number,
  nowMs: number = Date.now(),
): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - serverTime(offsetMs, nowMs));
}
