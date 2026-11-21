import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { tournaments } from '../db/schema';
import { notFound } from '../errors';

/**
 * `tournaments.roster_version` is the sequence for `t:<id>:updates` events (PLAN §6.3). Bump it
 * inside the transaction that changes people / teams / groups / matches / status, then publish
 * the event with the returned version from `onCommit`:
 *
 *   const version = await bumpRosterVersion(tx, tournamentId);
 *   onCommit(() => publishUpdate(tournamentId, version, 'people.updated', { kind: 'PLAYER' }));
 */
export async function bumpRosterVersion(tx: Db, tournamentId: string): Promise<number> {
  const [row] = await tx
    .update(tournaments)
    .set({ rosterVersion: sql`${tournaments.rosterVersion} + 1` })
    .where(eq(tournaments.id, tournamentId))
    .returning({ version: tournaments.rosterVersion });
  if (!row) throw notFound();
  return row.version;
}

/**
 * Lock the tournament row (`SELECT … FOR UPDATE`) so joins / claims / starts for one tournament
 * happen one at a time (PLAN §5 "Captain-and-soldier exclusion"). Returns the locked row.
 */
export async function lockTournament(tx: Db, tournamentId: string) {
  const [row] = await tx
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .for('update');
  if (!row) throw notFound();
  return row;
}
