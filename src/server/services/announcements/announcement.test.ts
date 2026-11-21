import { and, eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { auditLog, tournaments } from '@/server/db/schema';
import { clearPublishedEvents, getPublishedEvents } from '@/server/realtime/publisher';
import { makeFormatTournament } from '../format/test-fixtures';
import { setAnnouncement } from './announcement';

const t = setupTestDb();

async function current(id: string): Promise<string | null> {
  const [row] = await t.db
    .select({ a: tournaments.announcement })
    .from(tournaments)
    .where(eq(tournaments.id, id));
  return row!.a;
}

describe('setAnnouncement', () => {
  beforeEach(() => clearPublishedEvents());

  it('posts, publishes live, logs, and clears', async () => {
    const f = await makeFormatTournament(t.db, { teams: 2, status: 'GROUP_STAGE' });
    await expect(
      setAnnouncement(f.coAdminId, f.tournament.id, '  Finals at 9 PM!  '),
    ).resolves.toEqual({
      announcement: 'Finals at 9 PM!',
    });
    expect(await current(f.tournament.id)).toBe('Finals at 9 PM!');
    expect(getPublishedEvents().map((e) => [e.channel, e.envelope.type, e.envelope.data])).toEqual([
      [
        `t:${f.tournament.id}:updates`,
        'tournament.status',
        { status: 'GROUP_STAGE', announcement: 'Finals at 9 PM!' },
      ],
    ]);

    // Same text again: nothing to do.
    clearPublishedEvents();
    await setAnnouncement(f.ownerId, f.tournament.id, 'Finals at 9 PM!');
    expect(getPublishedEvents()).toEqual([]);

    await setAnnouncement(f.ownerId, f.tournament.id, '   ');
    expect(await current(f.tournament.id)).toBeNull();
    const logs = await t.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.tournamentId, f.tournament.id)));
    expect(logs.map((l) => l.action)).toEqual(['announcement.posted', 'announcement.cleared']);
  });

  it('only owners and co-admins; outsiders get 404', async () => {
    const f = await makeFormatTournament(t.db, { teams: 2 });
    const other = await makeFormatTournament(t.db, { teams: 2 });
    await expect(setAnnouncement(f.auctioneerId, f.tournament.id, 'x')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(setAnnouncement(f.captainUserIds[0]!, f.tournament.id, 'x')).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    await expect(setAnnouncement(other.ownerId, f.tournament.id, 'x')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await current(f.tournament.id)).toBeNull();
  });
});
