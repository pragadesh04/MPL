import { eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { tournaments } from '@/server/db/schema';
import { getTournamentHome, loadLiveScreen } from './home';
import { makeFormatTournament } from './test-fixtures';

const t = setupTestDb();

describe('tournament home and live screen', () => {
  it('participants get counts, rules from the settings and their viewer; outsiders 404', async () => {
    const f = await makeFormatTournament(t.db, {
      teams: 4,
      soldiersPerTeam: 2,
      settings: { defaultPurse: 120, bidTimerSeconds: 45, timerResetSeconds: 45 },
    });
    const other = await makeFormatTournament(t.db, { teams: 2 });
    const home = await getTournamentHome(f.soldierUserIds[0]!, f.tournament.id);
    expect(home.counts).toEqual({ captains: 4, soldiers: 8, inSquads: 8 });
    expect(home.rules.find((r) => r.id === 'purse')!.value).toBe('120 MP');
    expect(home.rules.find((r) => r.id === 'timer')!.value).toBe('45s');
    expect(home.viewer).toMatchObject({
      roles: ['SOLDIER'],
      myTeamId: f.teamIds[0],
      canEditMatches: false,
    });
    await expect(getTournamentHome(other.ownerId, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getTournamentHome(null, f.tournament.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('the live screen works by live code only while enabled', async () => {
    const f = await makeFormatTournament(t.db, { teams: 3 });
    const live = await loadLiveScreen(f.tournament.liveCode);
    expect(live.tournament.id).toBe(f.tournament.id);
    expect(live.viewer.roles).toEqual([]);
    await t.db
      .update(tournaments)
      .set({ liveScreenEnabled: false })
      .where(eq(tournaments.id, f.tournament.id));
    await expect(loadLiveScreen(f.tournament.liveCode)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(loadLiveScreen('no-such-code')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
