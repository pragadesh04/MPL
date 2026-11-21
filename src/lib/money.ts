import { z } from 'zod';

/**
 * Militia Points (MP): whole numbers only, never floats (PLAN.md §3, §9 item 4).
 */

export const MP_UNIT = 'MP';

/** A non-negative whole MP amount. */
export const mpSchema = z.number().int().nonnegative();

export function isMP(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Throws if `value` isn't a non-negative safe integer. Use at trust boundaries. */
export function assertMP(value: number, label = 'amount'): number {
  if (!isMP(value)) throw new RangeError(`${label} must be a whole, non-negative MP amount`);
  return value;
}

const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `1250` → `"1,250"` (no unit). */
export function formatAmount(value: number): string {
  return formatter.format(value);
}

/** `1250` → `"1,250 MP"`. */
export function formatMP(value: number): string {
  return `${formatAmount(value)} ${MP_UNIT}`;
}

/** Integer percentage of an amount, rounded down: `percentOf(15, 50)` → 7. */
export function percentOf(amount: number, percent: number): number {
  return Math.floor((assertMP(amount) * percent) / 100);
}
