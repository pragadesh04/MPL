import type { TournamentSettings } from '../schemas/settings';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane B (B1). PLAN §3.1 reauctionPricePercent, §3.3. */

/**
 * Base price in re-auction rounds: `reauctionPricePercent` of the original, rounded down to the
 * bid step, never below `minBasePrice`.
 */
export function reauctionPrice(
  originalBasePrice: number,
  settings: Pick<TournamentSettings, 'reauctionPricePercent' | 'minBasePrice' | 'bidIncrements'>,
): number {
  void originalBasePrice;
  void settings;
  throw new NotImplementedError('reauctionPrice', 'Lane B');
}
