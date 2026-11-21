import { eq, sql } from 'drizzle-orm';
import { useTestDb } from '@/test/db';
import { makeLeader, makeTournament, makeUser } from '@/test/factories';
import { isUniqueViolation } from '@/server/errors';
import { rows } from './sql';
import { leaders, matchGames, matches, players, teams, tournaments } from './schema';

const t = useTestDb();

async function expectDbError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(p).rejects.toSatisfy((err: unknown) => {
    const text = `${String(err)} ${String((err as { cause?: unknown }).cause ?? '')}`;
    return pattern.test(text);
  });
}

describe('schema constraints (PLAN §5)', () => {
  it('applies every migration', async () => {
    const [res] = await rows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    expect(res?.n).toBeGreaterThanOrEqual(23);
  });

  it('allows only one active tournament per owner', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const first = await makeTournament(t.db, { ownerId: owner.id });
    const second = makeTournament(t.db, { ownerId: owner.id });
    await expect(second).rejects.toSatisfy(isUniqueViolation);

    await t.db.update(tournaments).set({ status: 'COMPLETED' }).where(eq(tournaments.id, first.id));
    await expect(makeTournament(t.db, { ownerId: owner.id })).resolves.toBeTruthy();
  });

  it('keeps usernames unique case-insensitively', async () => {
    await makeUser(t.db, { username: 'CaseUser' });
    await expect(makeUser(t.db, { username: 'caseuser' })).rejects.toSatisfy(isUniqueViolation);
  });

  it('never lets a purse go negative or above its total', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    const leader = await makeLeader(t.db, { tournamentId: tour.id, purseTotal: 50 });
    await expectDbError(
      t.db.update(leaders).set({ purseRemaining: -1 }).where(eq(leaders.id, leader.id)),
      /leaders_purse_ck/,
    );
    await expectDbError(
      t.db.update(leaders).set({ purseRemaining: 51 }).where(eq(leaders.id, leader.id)),
      /leaders_purse_ck/,
    );
  });

  it('requires team_id exactly for SOLD / ALLOCATED soldiers', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    await expectDbError(
      t.db.insert(players).values({
        tournamentId: tour.id,
        name: 'No team',
        source: 'ADDED_BY_ORGANISER',
        status: 'SOLD',
        soldPrice: 5,
        acquiredVia: 'AUCTION',
      }),
      /players_squad_ck/,
    );
  });

  it('rejects tied games and duplicate team colours', async () => {
    const owner = await makeUser(t.db, { isOrganiser: true });
    const tour = await makeTournament(t.db, { ownerId: owner.id });
    const l1 = await makeLeader(t.db, { tournamentId: tour.id });
    const l2 = await makeLeader(t.db, { tournamentId: tour.id });
    await t.db
      .insert(teams)
      .values({ tournamentId: tour.id, leaderId: l1.id, name: 'Red', shortName: 'RED', color: '#ff0000' });
    await expect(
      t.db
        .insert(teams)
        .values({ tournamentId: tour.id, leaderId: l2.id, name: 'Blue', shortName: 'BLU', color: '#ff0000' }),
    ).rejects.toSatisfy(isUniqueViolation);

    const [m] = await t.db
      .insert(matches)
      .values({ tournamentId: tour.id, stage: 'KNOCKOUT', matchNumber: 1, round: 1, slot: 0 })
      .returning();
    await expectDbError(
      t.db.insert(matchGames).values({ matchId: m!.id, gameNo: 1, killsA: 20, killsB: 20 }),
      /match_games_no_tie_ck/,
    );
  });
});
