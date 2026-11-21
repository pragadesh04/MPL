import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/** PLAN §2.5: argon2 hashes, minimum 8 characters. */
export const MIN_PASSWORD_LENGTH = 8;

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new RangeError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return hash(password, OPTIONS);
}

/** False for a wrong password or a malformed hash (never throws on bad input). */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
