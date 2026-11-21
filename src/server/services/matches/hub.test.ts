import { setupTestDb } from '@/test/db';
import { drawGroups } from '../format/groupDraw';
import { makeFormatTournament, seededRandom } from '../format/test-fixtures';
import { getMatchesHub } from './hub';

const t = setupTestDb();

describe('getMatchesHub', () => {
  it('every participant role sees the list and the tree; outsiders get 404', async () => {
    const f = await makeFormatTournament(t.db, { teams: 8, soldiersPerTeam: 1 });
    const other = await makeFormatTournament(t.db, { teams: 4 });
    await drawGroups(f.ownerId, f.tournament.id, { mode: 'RANDOM' }, seededRandom(2));

    for (const userId of [
      f.ownerId,
      f.coAdminId,
      f.auctioneerId,
      f.captainUserIds[0]!,
      f.soldierUserIds[0]!,
    ]) {
      const list = await getMatchesHub(userId, f.tournament.id, { view: 'list', filters: {} });
      expect(list.view === 'list' && list.matches).toHaveLength(15);
    }
    const tree = await getMatchesHub(f.captainUserIds[1]!, f.tournament.id, {
      view: 'tree',
      filters: {},
    });
    expect(tree.view === 'tree' && tree.tree.rounds.map((r) => r.name)).toEqual([
      'Semi-final',
      'Final',
    ]);

    const mine = await getMatchesHub(f.ownerId, f.tournament.id, {
      view: 'list',
      filters: { teamId: f.teamIds[0], stage: 'GROUP' },
    });
    expect(mine.view === 'list' && mine.matches).toHaveLength(3);

    await expect(
      getMatchesHub(other.ownerId, f.tournament.id, { view: 'list', filters: {} }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      getMatchesHub(null, f.tournament.id, { view: 'tree', filters: {} }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
