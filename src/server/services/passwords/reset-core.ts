/**
 * Password-reset token core, shared by the app service and the operator script
 * (`npm run user:reset-password`). No `server-only` here because the script runs under tsx;
 * it is still server code (never import it from a Client Component).
 *
 * Tokens: 32 random bytes in the link, only the SHA-256 stored, single use, 30 minutes (§2.5).
 */
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/connect';
import { passwordResets } from '../../db/schema';

export const RESET_TTL_MINUTES = 30;

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function resetLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/reset/${token}`;
}

/** Insert a one-time reset for `userId`; returns the raw token (only ever shown once). */
export async function createResetToken(
  db: Db,
  userId: string,
  createdBy: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const [row] = await db
    .insert(passwordResets)
    .values({
      userId,
      tokenHash: hashResetToken(token),
      createdBy,
      expiresAt: sql`now() + ${sql.raw(`interval '${RESET_TTL_MINUTES} minutes'`)}`,
    })
    .returning({ expiresAt: passwordResets.expiresAt });
  return { token, expiresAt: row!.expiresAt };
}
