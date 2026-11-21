import type { TournamentSettings } from '../schemas/settings';
import { minRaise } from './nextValidBid';

/** Owner: Lane B (B1). PLAN §3.1 reauctionPricePercent, §3.3. */

/**
 * Base price in re-auction rounds: `reauctionPricePercent` of the original, rounded down to the
 * bid step, never below `minBasePrice`.
 *
 * "Rounded down to the bid step" uses the step of the band the reduced price falls in, so with
 * the §3.1 band table 150 MP at 50% → 75 → step 5 → 75; 130 at 50% → 65 → 65; 47 at 50% → 23 → 20.
 */
export function reauctionPrice(
  originalBasePrice: number,
  settings: Pick<TournamentSettings, 'reauctionPricePercent' | 'minBasePrice' | 'bidIncrements'>,
): number {
  const raw = Math.floor((originalBasePrice * settings.reauctionPricePercent) / 100);
  const step = minRaise(raw, settings.bidIncrements);
  const rounded = Math.floor(raw / step) * step;
  return Math.max(rounded, settings.minBasePrice);
}
