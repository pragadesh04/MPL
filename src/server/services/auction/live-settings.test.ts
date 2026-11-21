import { and, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { auditLog, tournaments } from '@/server/db/schema';
import { parseSettings } from '@/lib/schemas/settings';
import { getCommandPostRoster } from './page-data';
import { updateLiveAuctionSettings } from './live-settings';
import { makeAuction } from './test-fixtures';

const t = setupTestDb();

describe('updateLiveAuctionSettings', () => {
  it('changes the editable-after-start keys and audits them', async () => {
    const f = await makeAuction(t.db);
    const next = await updateLiveAuctionSettings(f.coAdminId, f.tournamentId, {
      bidTimerSeconds: 30,
      timerResetSeconds: 15,
      unsoldPolicy: 'ADMIN_DECIDES',
    });
    expect(next).toMatchObject({
      bidTimerSeconds: 30,
      timerResetSeconds: 15,
      unsoldPolicy: 'ADMIN_DECIDES',
    });
    const [tour] = await t.db.select().from(tournaments).where(eq(tournaments.id, f.tournamentId));
    expect(parseSettings(tour?.settings).bidTimerSeconds).toBe(30);
    const [entry] = await t.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tournamentId, f.tournamentId),
          eq(auditLog.action, 'settings.live_updated'),
        ),
      );
    expect(entry?.before).toMatchObject({ bidTimerSeconds: 60 });
  });

  it('rejects locked keys and invalid combinations', async () => {
    const f = await makeAuction(t.db);
    await expect(
      updateLiveAuctionSettings(f.ownerId, f.tournamentId, { defaultPurse: 99 } as never),
    ).rejects.toBeTruthy();
    await expect(
      updateLiveAuctionSettings(f.ownerId, f.tournamentId, { timerResetSeconds: 90 }),
    ).rejects.toBeTruthy();
  });

  it('is limited to owners and co-admins of this tournament', async () => {
    const f = await makeAuction(t.db);
    const other = await makeAuction(t.db);
    await expect(
      updateLiveAuctionSettings(f.auctioneerId, f.tournamentId, { breakSeconds: 5 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      updateLiveAuctionSettings(other.ownerId, f.tournamentId, { breakSeconds: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('getCommandPostRoster', () => {
  it('lists captains and soldiers for organisers only', async () => {
    const f = await makeAuction(t.db, { captains: 2, soldierPrices: [1, 2, 3] });
    const roster = await getCommandPostRoster(f.auctioneerId, f.tournamentId);
    expect(roster.filter((p) => p.kind === 'CAPTAIN')).toHaveLength(2);
    expect(roster.filter((p) => p.kind === 'SOLDIER')).toHaveLength(3);
    expect(roster.every((p) => p.username !== null)).toBe(true);
    await expect(getCommandPostRoster(f.captains[0]!.userId, f.tournamentId)).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
    const other = await makeAuction(t.db);
    await expect(getCommandPostRoster(other.ownerId, f.tournamentId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
