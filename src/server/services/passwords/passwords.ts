import 'server-only';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { consumeResetSchema } from '@/features/identity/schemas';
import { hashPassword } from '../../auth/password';
import { getDb, withTransaction, type Db } from '../../db/client';
import { leaders, memberships, passwordResets, players, users } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../errors';
import { env } from '../../env';
import { enforceRateLimit } from '../../rate-limit';
import { writeAudit } from '../audit';
import { requireRole } from '../roles';
import { createResetToken, hashResetToken, resetLink } from './reset-core';

/**
 * Password resets without email (PLAN §2.5, §9 item 18). Organisers issue one-time links only for
 * participants (captains / soldiers) of their own tournament. Organiser accounts are never reset
 * this way — not even an organiser who also plays — so a co-admin can never take over an owner
 * (they use "change password" or the operator script).
 */

export interface IssuedReset {
  link: string;
  expiresAt: Date;
}

export async function issueParticipantReset(
  actorId: string,
  tournamentId: string,
  targetUserId: string,
  db: Db = getDb(),
): Promise<IssuedReset> {
  await requireRole(actorId, tournamentId, 'participants:reset-password', db);
  if (actorId === targetUserId) throw badRequest('Use “Change password” for your own account');
  await enforceRateLimit(`password-reset-issue:user:${actorId}`, 30, 3600, db);

  // Target must be a captain / soldier of THIS tournament (any approval) — else 404.
  const [inLeaders] = await db
    .select({ id: leaders.id })
    .from(leaders)
    .where(and(eq(leaders.tournamentId, tournamentId), eq(leaders.userId, targetUserId)))
    .limit(1);
  const [inPlayers] = inLeaders
    ? [inLeaders]
    : await db
        .select({ id: players.id })
        .from(players)
        .where(and(eq(players.tournamentId, tournamentId), eq(players.userId, targetUserId)))
        .limit(1);
  if (!inPlayers) throw notFound();

  const [target] = await db
    .select({ isOrganiser: users.isOrganiser })
    .from(users)
    .where(eq(users.id, targetUserId));
  const [anyMembership] = await db
    .select({ t: memberships.tournamentId })
    .from(memberships)
    .where(eq(memberships.userId, targetUserId))
    .limit(1);
  if (!target || target.isOrganiser || anyMembership) {
    throw forbidden('Organisers reset their own password, or ask the site admin');
  }

  return withTransaction(async (tx) => {
    const { token, expiresAt } = await createResetToken(tx, targetUserId, actorId);
    await writeAudit(tx, {
      tournamentId,
      actorUserId: actorId,
      action: 'password.reset_issued',
      after: { userId: targetUserId },
    });
    return { link: resetLink(env().PUBLIC_APP_URL, token), expiresAt };
  }, db);
}

const live = (token: string) =>
  and(
    eq(passwordResets.tokenHash, hashResetToken(token)),
    isNull(passwordResets.usedAt),
    gt(passwordResets.expiresAt, sql`now()`),
  );

/** GET /api/password-resets/:token — who the link is for (same 404 for any bad link). */
export async function getResetPreview(
  token: string,
  ip: string,
  db: Db = getDb(),
): Promise<{ username: string; displayName: string }> {
  await enforceRateLimit(`password-reset-view:ip:${ip}`, 60, 600, db);
  const [row] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(live(token))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

/** POST /api/password-resets/:token — set a new password; the link (and any older one) dies. */
export async function consumeReset(
  token: string,
  input: z.input<typeof consumeResetSchema>,
  ip: string,
  db: Db = getDb(),
): Promise<{ username: string }> {
  const { password } = consumeResetSchema.parse(input);
  await enforceRateLimit(`password-reset-use:ip:${ip}`, 20, 600, db);
  const passwordHash = await hashPassword(password);
  return withTransaction(async (tx) => {
    const [reset] = await tx.select().from(passwordResets).where(live(token)).for('update');
    if (!reset) throw notFound();
    const [user] = await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, reset.userId))
      .returning({ username: users.username });
    if (!user) throw notFound();
    await tx
      .update(passwordResets)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(passwordResets.userId, reset.userId),
          or(isNull(passwordResets.usedAt), eq(passwordResets.id, reset.id)),
        ),
      );
    return user;
  }, db);
}
