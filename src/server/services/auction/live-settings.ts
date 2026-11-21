import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseSettings, unsoldPolicySchema, type TournamentSettings } from '@/lib/schemas/settings';
import { withTransaction } from '../../db/client';
import { dbNow } from '../../db/sql';
import { tournaments } from '../../db/schema';
import { ruleViolation } from '../../errors';
import { publishUpdate } from '../../realtime/publisher';
import { writeAudit } from '../audit';
import { bumpRosterVersion, lockTournament } from '../roster';
import { requireRole } from '../roles';

/**
 * Command post Rules card after Start (§1, §7.6a): only `EDITABLE_AFTER_START` keys (timer, timer
 * reset, break, unsoldPolicy) change without an override. Every change is audited. Changes apply
 * to the next lot / break; a running countdown keeps its deadline.
 *
 * Other settings after Start need Lane A's logged admin-override flow.
 */
export const liveSettingsPatchSchema = z
  .object({
    bidTimerSeconds: z.number().int().min(5).max(600),
    timerResetSeconds: z.number().int().min(1).max(600),
    breakSeconds: z.number().int().min(0).max(120),
    unsoldPolicy: unsoldPolicySchema,
  })
  .partial()
  .strict();
export type LiveSettingsPatch = z.infer<typeof liveSettingsPatchSchema>;

const LIVE_STATUSES = new Set(['AUCTION_LIVE', 'AUCTION_PAUSED']);

export async function updateLiveAuctionSettings(
  userId: string | null,
  tournamentId: string,
  patch: LiveSettingsPatch,
): Promise<TournamentSettings> {
  const access = await requireRole(userId, tournamentId, 'settings:edit');
  const changes = liveSettingsPatchSchema.parse(patch);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    if (!LIVE_STATUSES.has(tour.status)) {
      throw ruleViolation('AUCTION_NOT_LIVE', 'Live rules can only change during the auction');
    }
    const before = parseSettings(tour.settings);
    const next = parseSettings({ ...before, ...changes });
    const changed = Object.fromEntries(
      Object.entries(changes).filter(([k, v]) => before[k as keyof TournamentSettings] !== v),
    );
    if (Object.keys(changed).length === 0) return before;
    await tx.update(tournaments).set({ settings: next }).where(eq(tournaments.id, tournamentId));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: access.userId,
      action: 'settings.live_updated',
      before: Object.fromEntries(
        Object.keys(changed).map((k) => [k, before[k as keyof TournamentSettings]]),
      ),
      after: changed,
    });
    const version = await bumpRosterVersion(tx, tournamentId);
    const now = await dbNow(tx);
    onCommit(() =>
      publishUpdate(tournamentId, version, now, 'tournament.status', { status: tour.status }),
    );
    return next;
  });
}
