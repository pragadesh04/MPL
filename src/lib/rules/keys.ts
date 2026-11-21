import { KEY_ALPHABET, KEY_LENGTH } from '../schemas/domain';

/** Owner: Lane A (A1). PLAN §2.3 B/C, §9 item 15. */

export { KEY_ALPHABET, KEY_LENGTH };

export type KeyKind = 'ORGANISER_KEY' | 'PLAYER_CODE';

const STORED_RE = new RegExp(`^[${KEY_ALPHABET}]{${KEY_LENGTH}}$`);

/**
 * Random 6-character key from KEY_ALPHABET. `random` returns [0, 1) and is injectable for tests;
 * services pass a crypto-backed source.
 */
export function generateKey(random: () => number): string {
  let key = '';
  for (let i = 0; i < KEY_LENGTH; i++) {
    // Clamp so a (buggy) random() of exactly 1 can never index past the alphabet.
    const index = Math.min(KEY_ALPHABET.length - 1, Math.floor(random() * KEY_ALPHABET.length));
    key += KEY_ALPHABET[index];
  }
  return key;
}

/**
 * User input → stored form, or null if invalid. Case-insensitive; ignores the dash, spaces and a
 * leading '#'. `"rv7-k2p"` → `"RV7K2P"`, `"#4k9qx7"` → `"4K9QX7"`.
 */
export function normalizeKey(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, '').replace(/[\s-]/g, '').toUpperCase();
  return STORED_RE.test(cleaned) ? cleaned : null;
}

/** Stored form → display form: organiser key `RV7-K2P`, Player ID `#4K9QX7`. */
export function formatKey(stored: string, kind: KeyKind): string {
  if (kind === 'PLAYER_CODE') return `#${stored}`;
  const half = Math.ceil(stored.length / 2);
  return `${stored.slice(0, half)}-${stored.slice(half)}`;
}
