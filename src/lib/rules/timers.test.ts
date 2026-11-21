import { breakEndsAt, endsAtAfterBid, lotEndsAt, remainingMs } from './timers';
import { reauctionPrice } from './reauctionPrice';
import { EXAMPLE_BAND_INCREMENTS, type BidIncrements } from '../schemas/settings';

const NOW = new Date('2026-11-21T10:00:00.000Z');
const settings = { bidTimerSeconds: 60, timerResetSeconds: 20, breakSeconds: 2 };
const at = (s: number): Date => new Date(NOW.getTime() + s * 1000);

describe('timers', () => {
  it('opens a lot for bidTimerSeconds', () => {
    expect(lotEndsAt(NOW, settings)).toEqual(at(60));
  });

  it('extends the deadline to now + timerReset when that is later', () => {
    expect(endsAtAfterBid(at(5), NOW, settings)).toEqual(at(20));
  });

  it('keeps the current deadline when it is later than now + timerReset', () => {
    expect(endsAtAfterBid(at(45), NOW, settings)).toEqual(at(45));
  });

  it('with reset = timer, every bid restarts the full clock (default)', () => {
    const restart = { ...settings, timerResetSeconds: 60 };
    expect(endsAtAfterBid(at(3), NOW, restart)).toEqual(at(60));
  });

  it('ends the break after breakSeconds', () => {
    expect(breakEndsAt(NOW, settings)).toEqual(at(2));
    expect(breakEndsAt(NOW, { ...settings, breakSeconds: 0 })).toEqual(NOW);
  });

  it('counts down and never goes negative', () => {
    expect(remainingMs(at(10), NOW)).toBe(10_000);
    expect(remainingMs(NOW, at(10))).toBe(0);
  });
});

describe('reauctionPrice', () => {
  const flat1: BidIncrements = { type: 'flat', step: 1 };
  const base = { reauctionPricePercent: 50, minBasePrice: 1, bidIncrements: flat1 };

  it('takes the percentage, rounded down (§3.3: ~~10~~ 5 MP)', () => {
    expect(reauctionPrice(10, base)).toBe(5);
    expect(reauctionPrice(7, base)).toBe(3);
  });

  it('never goes below minBasePrice', () => {
    expect(reauctionPrice(1, base)).toBe(1);
    expect(reauctionPrice(3, { ...base, minBasePrice: 2 })).toBe(2);
  });

  it('rounds down to the step of the band the reduced price falls in', () => {
    const banded = { ...base, bidIncrements: EXAMPLE_BAND_INCREMENTS };
    expect(reauctionPrice(150, banded)).toBe(75);
    expect(reauctionPrice(47, banded)).toBe(20);
    expect(reauctionPrice(450, banded)).toBe(220);
  });

  it('rounds down to a flat step', () => {
    expect(reauctionPrice(18, { ...base, bidIncrements: { type: 'flat', step: 5 } })).toBe(5);
  });

  it('is the original price at 100%', () => {
    expect(reauctionPrice(9, { ...base, reauctionPricePercent: 100 })).toBe(9);
  });
});
