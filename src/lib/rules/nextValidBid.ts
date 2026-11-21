import type { BidIncrements } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane B (B1). PLAN §3.1 (bidIncrements), §3.2 item 3. */

export interface LotPrice {
  /** Effective opening price this round (re-auction price in re-auction rounds). */
  basePrice: number;
  /** Highest bid so far, null before the first bid. */
  currentBid: number | null;
}

/** Minimum raise above `currentBid` (flat step, or the step of the band `currentBid` falls in). */
export function minRaise(currentBid: number, increments: BidIncrements): number {
  void currentBid;
  void increments;
  throw new NotImplementedError('minRaise', 'Lane B');
}

/** First bid = base price; afterwards current bid + minRaise(current bid). */
export function nextValidBid(lot: LotPrice, increments: BidIncrements): number {
  void lot;
  void increments;
  throw new NotImplementedError('nextValidBid', 'Lane B');
}

/** Quick-raise chip amounts for the phone (`+1 +2 +5`, scaled by the raise), §3.2 / §7.8. */
export function quickRaiseOptions(lot: LotPrice, increments: BidIncrements): number[] {
  void lot;
  void increments;
  throw new NotImplementedError('quickRaiseOptions', 'Lane B');
}

/** A jump bid of more than 5x the minimum raise above the next valid bid asks for confirmation. */
export function isJumpBid(amount: number, lot: LotPrice, increments: BidIncrements): boolean {
  void amount;
  void lot;
  void increments;
  throw new NotImplementedError('isJumpBid', 'Lane B');
}
