import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq, isNotNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { signSessionToken } from '@/server/auth/session-token';
import {
  groups,
  leaders,
  matches,
  memberships,
  players,
  teams,
  tournaments,
  users,
} from '@/server/db/schema';
import { setupTestDb } from '@/test/db';
import { FAKE_PASSWORD_HASH } from '@/test/factories';
import { seedDatabase } from '../../../scripts/seed-lib';

/**
 * Tenant-isolation sweep (PLAN §2.0, §13.8 I5): EVERY Route Handler under
 * `/api/tournaments/[id]/**`, EVERY exported method, called by an organiser of another, unrelated
 * tournament. The answer must be indistinguishable from the answer for a tournament that doesn't
 * exist (same status, same body) and never a success. So no route can reveal, read or change
 * another organiser's data, whatever it does with its input.
 *
 * A sanity pass checks that the same GET routes do answer the real owner, so the sweep isn't
 * passing just because the ids are wrong.
 */

const state = vi.hoisted(() => ({ token: null as string | null }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'mpl_session' && state.token ? { name, value: state.token } : undefined,
    getAll: () => [],
    has: (name: string) => name === 'mpl_session' && state.token !== null,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));

const testDb = setupTestDb();
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = (typeof METHODS)[number];
type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const ROOT = path.join(process.cwd(), 'src', 'app', 'api', 'tournaments', '[id]');
const MISSING = '0b5b2b1e-1d3c-4c1e-9b1a-6f0e4f6a9c11';
const OTHER = '7d2f3c4a-5b6e-4f70-8a9b-0c1d2e3f4a5b';

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

interface Fixture {
  tournamentId: string;
  ownerId: string;
  attackerId: string;
  leaderRowId: string;
  playerRowId: string;
  matchId: string;
  groupId: string;
  memberUserId: string;
  participantUserId: string;
}
let fx: Fixture;

beforeAll(async () => {
  const db = testDb.db;
  await seedDatabase(db, 'knockout', { passwordHash: FAKE_PASSWORD_HASH });
  const [ravi] = await db.select().from(users).where(eq(users.username, 'ravi'));
  const [meera] = await db.select().from(users).where(eq(users.username, 'meera'));
  const [t] = await db.select().from(tournaments).where(eq(tournaments.ownerId, ravi!.id));
  const tid = t!.id;
  const [leader] = await db
    .select({ id: leaders.id })
    .from(leaders)
    .innerJoin(teams, eq(teams.leaderId, leaders.id))
    .where(eq(leaders.tournamentId, tid));
  const [player] = await db
    .select({ id: players.id, userId: players.userId })
    .from(players)
    .where(and(eq(players.tournamentId, tid), isNotNull(players.userId)));
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.tournamentId, tid), eq(matches.isBye, false)));
  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.tournamentId, tid));
  const [member] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.tournamentId, tid), eq(memberships.role, 'CO_ADMIN')));
  fx = {
    tournamentId: tid,
    ownerId: ravi!.id,
    attackerId: meera!.id,
    leaderRowId: leader!.id,
    playerRowId: player!.id,
    matchId: match!.id,
    groupId: group?.id ?? OTHER,
    memberUserId: member?.userId ?? OTHER,
    participantUserId: player!.userId!,
  };
});

/** Params for one route file, with `[id]` set to `tournamentId`. */
function paramsFor(file: string, tournamentId: string): Record<string, string> {
  const rel = path.relative(ROOT, path.dirname(file)).split(path.sep);
  const params: Record<string, string> = { id: tournamentId };
  rel.forEach((seg, i) => {
    const m = /^\[(\w+)\]$/.exec(seg);
    if (!m) return;
    const name = m[1]!;
    const parent = rel[i - 1];
    params[name] =
      name === 'rowId'
        ? parent === 'leaders'
          ? fx.leaderRowId
          : fx.playerRowId
        : name === 'mid'
          ? fx.matchId
          : name === 'gid'
            ? fx.groupId
            : name === 'leaderId'
              ? fx.leaderRowId
              : name === 'userId'
                ? parent === 'members'
                  ? fx.memberUserId
                  : fx.participantUserId
                : OTHER; // wid, did, rid: ids that don't exist anywhere
  });
  return params;
}

async function call(
  handler: Handler,
  method: Method,
  file: string,
  tournamentId: string,
): Promise<{ status: number; body: unknown }> {
  const params = paramsFor(file, tournamentId);
  const url = `http://localhost:3000/api/tournaments/${tournamentId}`;
  const res = await handler(
    new Request(url, {
      method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: method === 'GET' ? undefined : '{}',
    }),
    { params: Promise.resolve(params) },
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: compare the raw text
  }
  return { status: res.status, body };
}

async function loadRoutes(): Promise<{ file: string; method: Method; handler: Handler }[]> {
  const out: { file: string; method: Method; handler: Handler }[] = [];
  for (const file of routeFiles(ROOT).sort()) {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    for (const method of METHODS) {
      if (typeof mod[method] === 'function') {
        out.push({ file, method, handler: mod[method] as Handler });
      }
    }
  }
  return out;
}

const label = (file: string, method: Method): string =>
  `${method} /api/tournaments/[id]/${path.relative(ROOT, path.dirname(file)).split(path.sep).join('/')}`;

describe('tenant isolation sweep: every /api/tournaments/[id]/** route', () => {
  it('answers an unrelated organiser exactly like a tournament that does not exist', async () => {
    const routes = await loadRoutes();
    expect(routes.length).toBeGreaterThan(50);
    state.token = await signSessionToken(fx.attackerId, process.env.JWT_SECRET!);

    const leaks: string[] = [];
    for (const { file, method, handler } of routes) {
      const real = await call(handler, method, file, fx.tournamentId);
      const missing = await call(handler, method, file, MISSING);
      const name = label(file, method);
      if (real.status >= 200 && real.status < 400) leaks.push(`${name}: answered ${real.status}`);
      else if (
        real.status !== missing.status ||
        JSON.stringify(real.body) !== JSON.stringify(missing.body)
      ) {
        leaks.push(
          `${name}: ${real.status} ${JSON.stringify(real.body)} ≠ missing ${missing.status} ${JSON.stringify(missing.body)}`,
        );
      }
    }
    expect(leaks).toEqual([]);
  }, 180_000);

  it('the same GET routes do answer the real owner (the sweep uses valid ids)', async () => {
    // Legitimate 404s for the owner: `/me` is the captain / soldier's own card (the owner isn't one
    // here), and webhook routes get a webhook id that doesn't exist (the seed creates none).
    const ownerNotFoundIsCorrect = (file: string): boolean => {
      const rel = path.relative(ROOT, path.dirname(file)).split(path.sep);
      return rel[0] === 'me' || rel.includes('[wid]');
    };
    const routes = (await loadRoutes()).filter(
      (r) => r.method === 'GET' && !ownerNotFoundIsCorrect(r.file),
    );
    state.token = await signSessionToken(fx.ownerId, process.env.JWT_SECRET!);
    const notReached: string[] = [];
    for (const { file, method, handler } of routes) {
      const res = await call(handler, method, file, fx.tournamentId);
      if (res.status === 404 || res.status >= 500) {
        notReached.push(`${label(file, method)}: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
    expect(notReached).toEqual([]);
  }, 120_000);
});
