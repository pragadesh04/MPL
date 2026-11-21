import type { BidIncrements } from '../schemas/settings';

/** Owner: Lane B (B1). PLAN §3.1 (bidIncrements), §3.2 item 3. */

export interface LotPrice {
  /** Effective opening price this round (re-auction price in re-auction rounds). */
  basePrice: number;
  /** Highest bid so far, null before the first bid. */
  currentBid: number | null;
}

/** Quick-raise chip multipliers (`+1 +2 +5`, scaled by the raise), §3.2 / §7.8. */
const QUICK_RAISE_MULTIPLIERS = [1, 2, 5] as const;
/** A bid more than this many minimum raises above the next valid bid asks for confirmation. */
const JUMP_BID_FACTOR = 5;

/** Minimum raise above `currentBid` (flat step, or the step of the band `currentBid` falls in). */
export function minRaise(currentBid: number, increments: BidIncrements): number {
  if (increments.type === 'flat') return increments.step;
  // Bands are validated ascending with the first starting at 0, so the last band whose `from`
  // is <= currentBid is the one it falls in.
  let step = increments.bands[0]?.step ?? 1;
  for (const band of increments.bands) {
    if (band.from <= currentBid) step = band.step;
  }
  return step;
}

/**
 * First bid = base price (at least 1 MP: bids are always positive); afterwards
 * current bid + minRaise(current bid).
 */
export function nextValidBid(lot: LotPrice, increments: BidIncrements): number {
  if (lot.currentBid === null) return Math.max(lot.basePrice, 1);
  return lot.currentBid + minRaise(lot.currentBid, increments);
}

/** The raise that scales the quick chips and the jump-bid threshold for this lot. */
function lotRaise(lot: LotPrice, increments: BidIncrements): number {
  return minRaise(lot.currentBid ?? lot.basePrice, increments);
}

/**
 * Quick-raise chip amounts for the phone (`+1 +2 +5`, scaled by the raise), §3.2 / §7.8.
 * `+1` is always the next valid bid; `+n` adds (n − 1) more raises on top of it.
 */
export function quickRaiseOptions(lot: LotPrice, increments: BidIncrements): number[] {
  const next = nextValidBid(lot, increments);
  const raise = lotRaise(lot, increments);
  return QUICK_RAISE_MULTIPLIERS.map((m) => next + (m - 1) * raise);
}

/** A jump bid of more than 5x the minimum raise above the next valid bid asks for confirmation. */
export function isJumpBid(amount: number, lot: LotPrice, increments: BidIncrements): boolean {
  return amount - nextValidBid(lot, increments) > JUMP_BID_FACTOR * lotRaise(lot, increments);
}
