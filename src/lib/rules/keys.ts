import { KEY_ALPHABET, KEY_LENGTH } from '../schemas/domain';
import { NotImplementedError } from './not-implemented';

/** Owner: Lane A (A1). PLAN §2.3 B/C, §9 item 15. */

export { KEY_ALPHABET, KEY_LENGTH };

export type KeyKind = 'ORGANISER_KEY' | 'PLAYER_CODE';

/**
 * Random 6-character key from KEY_ALPHABET. `random` returns [0, 1) and is injectable for tests;
 * services pass a crypto-backed source.
 */
export function generateKey(random: () => number): string {
  void random;
  throw new NotImplementedError('generateKey', 'Lane A');
}

/**
 * User input → stored form, or null if invalid. Case-insensitive; ignores the dash, spaces and a
 * leading '#'. `"rv7-k2p"` → `"RV7K2P"`, `"#4k9qx7"` → `"4K9QX7"`.
 */
export function normalizeKey(input: string): string | null {
  void input;
  throw new NotImplementedError('normalizeKey', 'Lane A');
}

/** Stored form → display form: organiser key `RV7-K2P`, Player ID `#4K9QX7`. */
export function formatKey(stored: string, kind: KeyKind): string {
  void stored;
  void kind;
  throw new NotImplementedError('formatKey', 'Lane A');
}
