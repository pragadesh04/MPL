import 'server-only';
import { eq } from 'drizzle-orm';
import type { EventDataMap } from '@/lib/schemas/realtime';
import type { OnCommit, Tx } from '../../db/client';
import { tournaments } from '../../db/schema';
import { dbNow } from '../../db/sql';
import { publishUpdate } from '../../realtime/publisher';
import { bumpRosterVersion } from '../roster';
import { syncReadyStatus } from '../start/readiness';

/**
 * Lane A's one place for "the roster changed": bump `roster_version`, keep DRAFT ⇄ READY in step
 * with the §3.5 checks, and publish `people.updated` / `team.updated` / `tournament.status` on
 * `t:<id>:updates` AFTER commit (each event gets its own sequence number).
 */
export async function afterRosterChange(
  tx: Tx,
  tournamentId: string,
  onCommit: OnCommit,
  event:
    | { type: 'people.updated'; data: EventDataMap['people.updated'] }
    | { type: 'team.updated'; data: EventDataMap['team.updated'] },
): Promise<void> {
  const now = await dbNow(tx);
  const version = await bumpRosterVersion(tx, tournamentId);
  onCommit(() =>
    event.type === 'people.updated'
      ? publishUpdate(tournamentId, version, now, 'people.updated', event.data)
      : publishUpdate(tournamentId, version, now, 'team.updated', event.data),
  );
  const changed = await syncReadyStatus(tx, tournamentId);
  if (changed) await publishStatus(tx, tournamentId, onCommit);
}

/** Bump the sequence and publish the tournament's current status after commit. */
export async function publishStatus(
  tx: Tx,
  tournamentId: string,
  onCommit: OnCommit,
): Promise<void> {
  const now = await dbNow(tx);
  const version = await bumpRosterVersion(tx, tournamentId);
  const [row] = await tx
    .select({ status: tournaments.status, announcement: tournaments.announcement })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!row) return;
  onCommit(() =>
    publishUpdate(tournamentId, version, now, 'tournament.status', {
      status: row.status,
      announcement: row.announcement,
    }),
  );
}
