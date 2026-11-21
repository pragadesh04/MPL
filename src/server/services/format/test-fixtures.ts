/**
 * Test-only fixtures for Lane C service tests (PGlite). Builds a tournament at a given status with
 * N captains + teams (and optional soldiers in squads), plus organisers in the usual roles.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/connect';
import { memberships, tournaments, type Tournament } from '@/server/db/schema';
import { DEFAULT_SETTINGS, type TournamentSettingsInput } from '@/lib/schemas/settings';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';

export interface FormatFixture {
  tournament: Tournament;
  ownerId: string;
  coAdminId: string;
  auctioneerId: string;
  captainUserIds: string[];
  soldierUserIds: string[];
  teamIds: string[];
  /** Soldier player ids per team (same order as teamIds). */
  squadPlayerIds: string[][];
}

export async function makeFormatTournament(
  db: Db,
  opts: {
    teams: number;
    status?: TournamentStatus;
    settings?: TournamentSettingsInput;
    soldiersPerTeam?: number;
  },
): Promise<FormatFixture> {
  const owner = await makeUser(db, { isOrganiser: true });
  const coAdmin = await makeUser(db);
  const auctioneer = await makeUser(db);
  const tournament = await makeTournament(db, {
    ownerId: owner.id,
    status: opts.status ?? 'GROUP_DRAW',
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
  });
  await db.insert(memberships).values([
    { tournamentId: tournament.id, userId: coAdmin.id, role: 'CO_ADMIN' },
    { tournamentId: tournament.id, userId: auctioneer.id, role: 'AUCTIONEER' },
  ]);
  const captainUserIds: string[] = [];
  const soldierUserIds: string[] = [];
  const teamIds: string[] = [];
  const squadPlayerIds: string[][] = [];
  for (let i = 0; i < opts.teams; i++) {
    const user = await makeUser(db);
    // Spend decreasing amounts so the seeding pots are predictable: team 0 spent the most.
    const leader = await makeLeader(db, {
      tournamentId: tournament.id,
      userId: user.id,
      purseTotal: 50,
      purseRemaining: Math.min(50, 5 + i),
    });
    const team = await makeTeam(db, {
      tournamentId: tournament.id,
      leaderId: leader.id,
      sortOrder: i,
    });
    captainUserIds.push(user.id);
    teamIds.push(team.id);
    const squad: string[] = [];
    for (let s = 0; s < (opts.soldiersPerTeam ?? 0); s++) {
      const su = await makeUser(db);
      const p = await makePlayer(db, {
        tournamentId: tournament.id,
        userId: su.id,
        status: 'SOLD',
        teamId: team.id,
        soldPrice: 5,
        acquiredVia: 'AUCTION',
      });
      soldierUserIds.push(su.id);
      squad.push(p.id);
    }
    squadPlayerIds.push(squad);
  }
  return {
    tournament,
    ownerId: owner.id,
    coAdminId: coAdmin.id,
    auctioneerId: auctioneer.id,
    captainUserIds,
    soldierUserIds,
    teamIds,
    squadPlayerIds,
  };
}

export async function setStatus(
  db: Db,
  tournamentId: string,
  status: TournamentStatus,
): Promise<void> {
  await db.update(tournaments).set({ status }).where(eq(tournaments.id, tournamentId));
}

/** Deterministic PRNG (mulberry32) for repeatable draws in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
