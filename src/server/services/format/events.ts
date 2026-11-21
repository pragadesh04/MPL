import 'server-only';
import type { EventDataMap, UpdateEventType } from '@/lib/schemas/realtime';
import type { OnCommit, Tx } from '../../db/client';
import { dbNow } from '../../db/sql';
import { publishUpdate } from '../../realtime/publisher';
import { bumpRosterVersion } from '../roster';

export type FormatEvent = {
  [K in UpdateEventType]: { type: K; data: EventDataMap[K] };
}[UpdateEventType];

/**
 * Bump `tournaments.roster_version` once per event inside the transaction and publish each event
 * on `t:<id>:updates` after COMMIT (PLAN §6.3). Returns the last version.
 */
export async function queueUpdates(
  tx: Tx,
  onCommit: OnCommit | null,
  tournamentId: string,
  events: FormatEvent[],
): Promise<number> {
  const serverNow = await dbNow(tx);
  let version = 0;
  const queued: { version: number; event: FormatEvent }[] = [];
  for (const event of events) {
    version = await bumpRosterVersion(tx, tournamentId);
    queued.push({ version, event });
  }
  onCommit?.(async () => {
    for (const { version: v, event } of queued) {
      // `FormatEvent` pairs each type with its data; TS can't correlate the union members here.
      await publishUpdate(tournamentId, v, serverNow, event.type, event.data as never);
    }
  });
  return version;
}
