import type { TournamentSettings } from '../schemas/settings';

/** Owner: Lane B (B1). PLAN §3.1 timers, §6.2. Every `now` comes from Postgres now(). */

export type TimerSettings = Pick<
  TournamentSettings,
  'bidTimerSeconds' | 'timerResetSeconds' | 'breakSeconds'
>;

const addSeconds = (date: Date, seconds: number): Date => new Date(date.getTime() + seconds * 1000);

/** Deadline of a lot opened at `now`. */
export function lotEndsAt(now: Date, settings: TimerSettings): Date {
  return addSeconds(now, settings.bidTimerSeconds);
}

/** After a bid: greatest(current deadline, now + timerResetSeconds). */
export function endsAtAfterBid(currentEndsAt: Date, now: Date, settings: TimerSettings): Date {
  const reset = addSeconds(now, settings.timerResetSeconds);
  return reset.getTime() > currentEndsAt.getTime() ? reset : currentEndsAt;
}

/** End of the break that starts at `now` (the next soldier opens then). */
export function breakEndsAt(now: Date, settings: TimerSettings): Date {
  return addSeconds(now, settings.breakSeconds);
}

/** Milliseconds left until `deadline`, never negative. */
export function remainingMs(deadline: Date, now: Date): number {
  return Math.max(0, deadline.getTime() - now.getTime());
}
