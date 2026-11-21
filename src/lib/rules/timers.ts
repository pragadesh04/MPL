import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane B (B1). PLAN §3.1 timers, §6.2. Every `now` comes from Postgres now(). */

export type TimerSettings = Pick<
  TournamentSettings,
  'bidTimerSeconds' | 'timerResetSeconds' | 'breakSeconds'
>;

/** Deadline of a lot opened at `now`. */
export function lotEndsAt(now: Date, settings: TimerSettings): Date {
  void now;
  void settings;
  throw new NotImplementedError('lotEndsAt', 'Lane B');
}

/** After a bid: greatest(current deadline, now + timerResetSeconds). */
export function endsAtAfterBid(currentEndsAt: Date, now: Date, settings: TimerSettings): Date {
  void currentEndsAt;
  void now;
  void settings;
  throw new NotImplementedError('endsAtAfterBid', 'Lane B');
}

/** End of the break that starts at `now` (the next soldier opens then). */
export function breakEndsAt(now: Date, settings: TimerSettings): Date {
  void now;
  void settings;
  throw new NotImplementedError('breakEndsAt', 'Lane B');
}

/** Milliseconds left until `deadline`, never negative. */
export function remainingMs(deadline: Date, now: Date): number {
  void deadline;
  void now;
  throw new NotImplementedError('remainingMs', 'Lane B');
}
