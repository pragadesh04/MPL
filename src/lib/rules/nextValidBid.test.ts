import { EXAMPLE_BAND_INCREMENTS, type BidIncrements } from '../schemas/settings';
import { isJumpBid, minRaise, nextValidBid, quickRaiseOptions } from './nextValidBid';

const flat1: BidIncrements = { type: 'flat', step: 1 };
const flat5: BidIncrements = { type: 'flat', step: 5 };
const bands = EXAMPLE_BAND_INCREMENTS;

describe('minRaise', () => {
  it('returns the flat step whatever the bid', () => {
    expect(minRaise(0, flat1)).toBe(1);
    expect(minRaise(999, flat5)).toBe(5);
  });

  it.each([
    [0, 5],
    [99, 5],
    [100, 10],
    [299, 10],
    [300, 20],
    [599, 20],
    [600, 50],
    [10_000, 50],
  ])('band table: bid %i → step %i (§3.1 example)', (bid, step) => {
    expect(minRaise(bid, bands)).toBe(step);
  });

  it('falls back to 1 for an empty band list (never produced by the schema)', () => {
    expect(minRaise(10, { type: 'bands', bands: [] })).toBe(1);
  });
});

describe('nextValidBid', () => {
  it('is the base price before the first bid', () => {
    expect(nextValidBid({ basePrice: 7, currentBid: null }, flat1)).toBe(7);
  });

  it('never opens below 1 MP (bids are always positive)', () => {
    expect(nextValidBid({ basePrice: 0, currentBid: null }, flat1)).toBe(1);
  });

  it('is current + flat raise after a bid', () => {
    expect(nextValidBid({ basePrice: 1, currentBid: 12 }, flat1)).toBe(13);
    expect(nextValidBid({ basePrice: 1, currentBid: 12 }, flat5)).toBe(17);
  });

  it('uses the band of the current bid', () => {
    expect(nextValidBid({ basePrice: 50, currentBid: 95 }, bands)).toBe(100);
    expect(nextValidBid({ basePrice: 50, currentBid: 100 }, bands)).toBe(110);
    expect(nextValidBid({ basePrice: 50, currentBid: 600 }, bands)).toBe(650);
  });
});

describe('quickRaiseOptions', () => {
  it('gives +1 +2 +5 raises above the current bid', () => {
    expect(quickRaiseOptions({ basePrice: 1, currentBid: 10 }, flat1)).toEqual([11, 12, 15]);
  });

  it('scales the chips by the raise', () => {
    expect(quickRaiseOptions({ basePrice: 1, currentBid: 100 }, bands)).toEqual([110, 120, 150]);
  });

  it('starts at the base price before the first bid', () => {
    expect(quickRaiseOptions({ basePrice: 3, currentBid: null }, flat1)).toEqual([3, 4, 7]);
  });
});

describe('isJumpBid', () => {
  const lot = { basePrice: 1, currentBid: 10 };

  it('is false up to 5 raises above the next valid bid', () => {
    expect(isJumpBid(11, lot, flat1)).toBe(false);
    expect(isJumpBid(16, lot, flat1)).toBe(false);
  });

  it('is true beyond 5 raises above the next valid bid', () => {
    expect(isJumpBid(17, lot, flat1)).toBe(true);
    expect(isJumpBid(110, lot, flat1)).toBe(true);
  });

  it('measures the threshold in the lot raise before the first bid', () => {
    const fresh = { basePrice: 100, currentBid: null };
    expect(isJumpBid(150, fresh, bands)).toBe(false);
    expect(isJumpBid(151, fresh, bands)).toBe(true);
  });
});
