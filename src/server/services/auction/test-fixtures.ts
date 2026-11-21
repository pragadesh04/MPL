/**
 * Test-only fixtures for the auction services (PGlite). Not imported by app code.
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/connect';
import { withTransaction } from '@/server/db/client';
import { auctionState, memberships } from '@/server/db/schema';
import { DEFAULT_SETTINGS, type TournamentSettingsInput } from '@/lib/schemas/settings';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { initializeAuction } from './initializeAuction';

export interface AuctionFixture {
  tournamentId: string;
  name: string;
  liveCode: string;
  ownerId: string;
  coAdminId: string;
  auctioneerId: string;
  captains: { userId: string; leaderId: string; teamId: string }[];
  soldiers: { id: string; userId: string | null; basePrice: number }[];
}

export async function makeAuction(
  db: Db,
  opts: {
    captains?: number;
    soldierPrices?: number[];
    purse?: number;
    settings?: TournamentSettingsInput;
  } = {},
): Promise<AuctionFixture> {
  const owner = await makeUser(db, { isOrganiser: true });
  const coAdmin = await makeUser(db);
  const auctioneer = await makeUser(db);
  const tour = await makeTournament(db, {
    ownerId: owner.id,
    status: 'AUCTION_LIVE',
    // manualQueue keeps the pool in creation order, so tests know who opens next.
    settings: { ...DEFAULT_SETTINGS, playerOrder: 'manualQueue', ...opts.settings },
  });
  await db.insert(memberships).values([
    { tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN' },
    { tournamentId: tour.id, userId: auctioneer.id, role: 'AUCTIONEER' },
  ]);
  const captains: AuctionFixture['captains'] = [];
  for (let i = 0; i < (opts.captains ?? 2); i++) {
    const user = await makeUser(db);
    const leader = await makeLeader(db, {
      tournamentId: tour.id,
      userId: user.id,
      purseTotal: opts.purse ?? 50,
      purseRemaining: opts.purse ?? 50,
    });
    const team = await makeTeam(db, {
      tournamentId: tour.id,
      leaderId: leader.id,
      name: `Squad ${i + 1} ${randomUUID().slice(0, 4)}`,
      sortOrder: i,
    });
    captains.push({ userId: user.id, leaderId: leader.id, teamId: team.id });
  }
  const soldiers: AuctionFixture['soldiers'] = [];
  for (const [i, basePrice] of (opts.soldierPrices ?? [2, 4, 6]).entries()) {
    const user = await makeUser(db);
    const p = await makePlayer(db, {
      tournamentId: tour.id,
      userId: user.id,
      basePrice,
      auctionOrder: i + 1,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    });
    soldiers.push({ id: p.id, userId: user.id, basePrice });
  }
  await withTransaction((tx) => initializeAuction(tx, tour.id));
  return {
    tournamentId: tour.id,
    name: tour.name,
    liveCode: tour.liveCode,
    ownerId: owner.id,
    coAdminId: coAdmin.id,
    auctioneerId: auctioneer.id,
    captains,
    soldiers,
  };
}

/** Move the running lot's deadline (or the break's end) into the past. */
export async function expireLot(db: Db, tournamentId: string): Promise<void> {
  await db
    .update(auctionState)
    .set({ endsAt: sql`now() - interval '1 second'` })
    .where(eq(auctionState.tournamentId, tournamentId));
}

export async function expireBreak(db: Db, tournamentId: string): Promise<void> {
  await db
    .update(auctionState)
    .set({ nextAt: sql`now() - interval '1 second'` })
    .where(eq(auctionState.tournamentId, tournamentId));
}

export const cid = (): string => randomUUID();
