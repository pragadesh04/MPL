import 'server-only';
import { eq } from 'drizzle-orm';
import { withTransaction } from '../../db/client';
import { tournaments } from '../../db/schema';
import { writeAudit } from '../audit';
import { queueUpdates } from '../format/events';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';

/**
 * Announcement banner (PLAN §7, §2.4): one line posted by the owner or a co-admin, shown on the
 * tournament home, auction room, dashboard and big screen. `null` clears it. Logged, and pushed
 * live as `tournament.status` with the new `announcement` (the banner's real-time event).
 */
export async function setAnnouncement(
  userId: string | null,
  tournamentId: string,
  text: string | null,
): Promise<{ announcement: string | null }> {
  const access = await requireRole(userId, tournamentId, 'announcement:post');
  const announcement = text?.trim() ? text.trim() : null;
  return withTransaction(async (tx, onCommit) => {
    const t = await lockTournament(tx, tournamentId);
    if (t.announcement === announcement) return { announcement };
    await tx.update(tournaments).set({ announcement }).where(eq(tournaments.id, tournamentId));
    await writeAudit(tx, {
      tournamentId,
      actorUserId: access.userId,
      action: announcement ? 'announcement.posted' : 'announcement.cleared',
      before: { announcement: t.announcement },
      after: { announcement },
    });
    await queueUpdates(tx, onCommit, tournamentId, [
      { type: 'tournament.status', data: { status: t.status, announcement } },
    ]);
    return { announcement };
  });
}
