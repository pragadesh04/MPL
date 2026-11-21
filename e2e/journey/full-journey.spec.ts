import { randomUUID } from 'node:crypto';
import {
  expect as baseExpect,
  request as pwRequest,
  test,
  type APIRequestContext,
  type Browser,
} from '@playwright/test';

// The dev server compiles each route on first use; give assertions room.
const expect = baseExpect.configure({ timeout: 30_000 });

/**
 * Phase 2 full journey (PLAN §13.8 I5), across all three lanes, for TWO unrelated organisers
 * running their tournaments at the same time:
 *
 *   organiser signs up → tournament → captains and soldiers join by all three paths (personal
 *   link, organiser key → approval, Player ID request → accept) → captains set up teams → Start
 *   → live auction with two captains bidding at the same instant (exactly one wins) → a soldier
 *   nobody buys → leftover allocation → group draw → group results → knockout → champion.
 *
 * Setup and play go through the real HTTP API (the lanes' own e2e specs cover each screen in
 * detail); the browser checks the cross-lane pages: role-based navigation, the auction room, the
 * champion, the big-screen redirect, and that each organiser gets a 404 on the other's tournament.
 *
 * Self-contained (fresh accounts every run, no seed). Desktop project only.
 *   npx playwright test e2e/journey --project=desktop
 */

const run = Date.now().toString(36).slice(-5);
const PASSWORD = 'password123';
const COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047'];

type Ctx = APIRequestContext;

async function call<T = unknown>(
  ctx: Ctx,
  method: string,
  url: string,
  data?: unknown,
): Promise<T> {
  const res = await ctx.fetch(url, { method, data });
  const text = await res.text();
  expect(res.ok(), `${method} ${url} → ${res.status()} ${text}`).toBe(true);
  return (text ? JSON.parse(text) : null) as T;
}

async function newActor(baseURL: string): Promise<Ctx> {
  return pwRequest.newContext({ baseURL });
}

async function registerPlayer(
  ctx: Ctx,
  username: string,
  name: string,
  extra: { organiserKey?: string; requestedRole?: 'LEADER' | 'PLAYER' } = {},
): Promise<void> {
  await call(ctx, 'POST', '/api/auth/register', {
    accountType: 'PLAYER',
    displayName: name,
    ign: username.slice(0, 24), // unique per account: the Start check flags duplicate IGNs
    username,
    password: PASSWORD,
    ...extra,
  });
}

interface Snapshot {
  version: number;
  status: string;
  current: { playerId: string; nextBid: number; currentTeamId: string | null } | null;
  teams: { id: string; name: string; squadSize: number; purseRemaining: number }[];
  pool: { id: string; status: string }[];
  unsold: { id: string }[];
}

interface HubMatch {
  id: string;
  stage: string;
  bestOf: number;
  status: string;
  isBye: boolean;
  teamAId: string | null;
  teamBId: string | null;
  winnerTeamId: string | null;
  nextMatchId: string | null;
}

interface Journey {
  tid: string;
  name: string;
  liveCode: string;
  owner: Ctx;
  captains: { ctx: Ctx; teamName: string }[];
  /** Team ids, strongest first (this order decides every match). */
  ranking: string[];
}

/** One organiser's whole tournament, through the API. */
async function runTournament(baseURL: string, tag: string): Promise<Journey> {
  const u = (role: string): string => `fj${tag}_${role}_${run}`.toLowerCase();
  const name = `Journey ${tag.toUpperCase()} ${run}`;

  // ── Organiser signs up and creates a tournament ───────────────────────────────────────
  const owner = await newActor(baseURL);
  await call(owner, 'POST', '/api/auth/register', {
    accountType: 'ORGANISER',
    displayName: `Org ${tag.toUpperCase()}`,
    username: u('org'),
    email: `${u('org')}@example.test`,
    password: PASSWORD,
  });
  const { user } = await call<{ user: { organiserKey: string } }>(owner, 'GET', '/api/auth/me');
  const { id: tid } = await call<{ id: string }>(owner, 'POST', '/api/tournaments', { name });
  const detail = await call<{ settings: Record<string, unknown>; liveCode: string }>(
    owner,
    'GET',
    `/api/tournaments/${tid}`,
  );
  // 4 teams of 2–3 (captain included), no re-auction round, a long break so the organiser opens
  // each lot with "next".
  await call(owner, 'PATCH', `/api/tournaments/${tid}/settings`, {
    settings: {
      ...detail.settings,
      minPlayersPerTeam: 2,
      maxPlayersPerTeam: 3,
      unsoldReauctionRounds: 0,
      breakSeconds: 60,
    },
  });

  // ── Captains by all three paths ───────────────────────────────────────────────────────
  const captains: { ctx: Ctx; teamName: string }[] = [];

  // Path A (×2): personal links.
  for (const i of [1, 2]) {
    await call(owner, 'POST', `/api/tournaments/${tid}/people`, {
      type: 'LEADER',
      name: `Link Captain ${i}`,
    });
  }
  const { leaders } = await call<{ leaders: { id: string; name: string }[] }>(
    owner,
    'GET',
    `/api/tournaments/${tid}/leaders`,
  );
  for (const i of [1, 2]) {
    const row = leaders.find((l) => l.name === `Link Captain ${i}`)!;
    const { link } = await call<{ link: string }>(
      owner,
      'GET',
      `/api/tournaments/${tid}/leaders/${row.id}/invite-link`,
    );
    const token = new URL(link).pathname.split('/').pop()!;
    const cap = await newActor(baseURL);
    await registerPlayer(cap, u(`cap${i}`), `Link Captain ${i}`);
    await call(cap, 'POST', `/api/invites/${token}/claim`, {});
    captains.push({ ctx: cap, teamName: `Team ${tag}${i}` });
  }

  // Path B: organiser key → pending → approved.
  const keyCap = await newActor(baseURL);
  await registerPlayer(keyCap, u('cap3'), 'Key Captain', {
    organiserKey: user.organiserKey,
    requestedRole: 'LEADER',
  });
  const pendingCaps = await call<{ leaders: { id: string; name: string }[] }>(
    owner,
    'GET',
    `/api/tournaments/${tid}/leaders`,
  );
  const keyRow = pendingCaps.leaders.find((l) => l.name === 'Key Captain')!;
  await call(owner, 'POST', `/api/tournaments/${tid}/leaders/approve`, { ids: [keyRow.id] });
  captains.push({ ctx: keyCap, teamName: `Team ${tag}3` });

  // Path C: free agent → Player ID request → accepted.
  const reqCap = await newActor(baseURL);
  await registerPlayer(reqCap, u('cap4'), 'Request Captain');
  const reqMe = await call<{ user: { playerCode: string } }>(reqCap, 'GET', '/api/auth/me');
  await call(owner, 'POST', `/api/tournaments/${tid}/requests`, {
    playerCode: reqMe.user.playerCode,
    role: 'LEADER',
  });
  const inbox = await call<{ requests: { id: string }[] }>(reqCap, 'GET', '/api/me/requests');
  await call(reqCap, 'POST', `/api/me/requests/${inbox.requests[0]!.id}/accept`, {});
  captains.push({ ctx: reqCap, teamName: `Team ${tag}4` });

  // Every captain sets up a team.
  for (const [i, c] of captains.entries()) {
    await call(c.ctx, 'PUT', `/api/tournaments/${tid}/my-team`, {
      name: c.teamName,
      shortName: `${tag.toUpperCase()}${i + 1}`.padEnd(3, 'X').slice(0, 3),
      color: COLORS[i],
    });
  }

  // ── Soldiers: 3 added by the organiser, 1 by key, 1 by request ────────────────────────
  for (const i of [1, 2, 3]) {
    await call(owner, 'POST', `/api/tournaments/${tid}/people`, {
      type: 'PLAYER',
      name: `Soldier ${tag}${i}`,
    });
  }
  const keySoldier = await newActor(baseURL);
  await registerPlayer(keySoldier, u('sol4'), `Soldier ${tag}4`, {
    organiserKey: user.organiserKey,
    requestedRole: 'PLAYER',
  });
  const { players } = await call<{ players: { id: string; name: string }[] }>(
    owner,
    'GET',
    `/api/tournaments/${tid}/players`,
  );
  const keySol = players.find((p) => p.name === `Soldier ${tag}4`)!;
  await call(owner, 'POST', `/api/tournaments/${tid}/players/approve`, { ids: [keySol.id] });

  const reqSoldier = await newActor(baseURL);
  await registerPlayer(reqSoldier, u('sol5'), `Soldier ${tag}5`);
  const solMe = await call<{ user: { playerCode: string } }>(reqSoldier, 'GET', '/api/auth/me');
  await call(owner, 'POST', `/api/tournaments/${tid}/requests`, {
    playerCode: solMe.user.playerCode,
    role: 'PLAYER',
  });
  const solInbox = await call<{ requests: { id: string }[] }>(
    reqSoldier,
    'GET',
    '/api/me/requests',
  );
  await call(reqSoldier, 'POST', `/api/me/requests/${solInbox.requests[0]!.id}/accept`, {});

  // ── Start ─────────────────────────────────────────────────────────────────────────────
  await call(owner, 'POST', `/api/tournaments/${tid}/start`, { confirmName: name });

  // ── Auction ───────────────────────────────────────────────────────────────────────────
  const snap = (ctx: Ctx = owner) => call<Snapshot>(ctx, 'GET', `/api/tournaments/${tid}/auction`);
  const command = async (type: string): Promise<Snapshot> => {
    const s = await snap();
    const res = await call<{ snapshot: Snapshot }>(
      owner,
      'POST',
      `/api/tournaments/${tid}/auction/commands`,
      { type, expectedVersion: s.version, commandId: randomUUID() },
    );
    return res.snapshot;
  };
  const teamOf = (s: Snapshot, teamName: string) => s.teams.find((t) => t.name === teamName)!;

  // Lot 1: two captains bid at the same instant with the same expected version.
  let s = await command('next');
  expect(s.current, 'a soldier is on the block').not.toBeNull();
  const lot = s.current!;
  const [r1, r2] = await Promise.all(
    [captains[0]!, captains[1]!].map((c) =>
      c.ctx.post(`/api/tournaments/${tid}/auction/bids`, {
        data: { amount: lot.nextBid, expectedVersion: s.version, commandId: randomUUID() },
      }),
    ),
  );
  const statuses = [r1!.status(), r2!.status()].sort();
  expect(statuses, 'exactly one of two simultaneous bids wins').toEqual([200, 409]);
  s = await command('sold');

  // Lots 2–4: each team without a soldier buys one.
  for (let n = 0; n < 3; n++) {
    s = await command('next');
    const empty = captains.find((c) => teamOf(s, c.teamName).squadSize === 1)!;
    await call(empty.ctx, 'POST', `/api/tournaments/${tid}/auction/bids`, {
      amount: s.current!.nextBid,
      expectedVersion: s.version,
      commandId: randomUUID(),
    });
    s = await command('sold');
  }
  expect(s.teams.every((t) => t.squadSize === 2)).toBe(true);

  // Lot 5: nobody bids → unsold → the round ends → leftover allocation.
  s = await command('next');
  s = await command('unsold');
  await expect
    .poll(async () => (await snap()).status, { message: 'auction ends in ALLOCATION' })
    .toBe('ALLOCATION');
  const allocated = await call<{ status: string; allocated: number }>(
    owner,
    'POST',
    `/api/tournaments/${tid}/auction/allocation`,
    { commandId: randomUUID() },
  );
  expect(allocated).toEqual({ status: 'GROUP_DRAW', allocated: 1 });

  // ── Format: one group of 4 → final ────────────────────────────────────────────────────
  const finalSnap = await snap();
  const ranking = captains.map((c) => teamOf(finalSnap, c.teamName).id);
  const rank = (teamId: string | null) => ranking.indexOf(teamId ?? '');
  await call(owner, 'POST', `/api/tournaments/${tid}/groups/draw`, { mode: 'RANDOM' });

  const list = async () =>
    (await call<{ matches: HubMatch[] }>(owner, 'GET', `/api/tournaments/${tid}/matches?view=list`))
      .matches;
  const play = async (m: HubMatch) => {
    const aWins = rank(m.teamAId) < rank(m.teamBId);
    const games = Array.from({ length: Math.ceil(m.bestOf / 2) }, () =>
      aWins ? { killsA: 20, killsB: 10 } : { killsA: 10, killsB: 20 },
    );
    await call(owner, 'PATCH', `/api/tournaments/${tid}/matches/${m.id}`, {
      action: 'result',
      games,
    });
  };

  const groupMatches = (await list()).filter((m) => m.stage === 'GROUP' && !m.isBye);
  expect(groupMatches).toHaveLength(6);
  for (const m of groupMatches) await play(m);
  await call(owner, 'POST', `/api/tournaments/${tid}/matches/knockout`, {});

  for (let pass = 0; pass < 4; pass++) {
    const open = (await list()).filter(
      (m) => m.stage !== 'GROUP' && !m.isBye && m.status !== 'DONE' && m.teamAId && m.teamBId,
    );
    if (open.length === 0) break;
    for (const m of open) await play(m);
  }
  const final = (await list()).find((m) => m.stage === 'KNOCKOUT' && m.nextMatchId === null)!;
  expect(final.winnerTeamId, 'the strongest team wins the final').toBe(ranking[0]);
  await expect
    .poll(
      async () => (await call<{ status: string }>(owner, 'GET', `/api/tournaments/${tid}`)).status,
    )
    .toBe('COMPLETED');

  return { tid, name, liveCode: detail.liveCode, owner, captains, ranking };
}

async function pageFor(browser: Browser, ctx: Ctx) {
  const context = await browser.newContext({ storageState: await ctx.storageState() });
  return context.newPage();
}

test.describe('full journey (all lanes)', () => {
  test.setTimeout(600_000);

  test('two unrelated organisers run complete tournaments at the same time', async ({
    browser,
    baseURL,
  }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only (creates accounts)');
    const [a, b] = await Promise.all([runTournament(baseURL!, 'a'), runTournament(baseURL!, 'b')]);

    // Owner A: role-based navigation across every lane, and the champion on the home page.
    const ownerPage = await pageFor(browser, a.owner);
    await ownerPage.goto(`/t/${a.tid}`);
    const nav = ownerPage.getByRole('navigation', { name: 'Tournament' });
    for (const label of [
      'Home',
      'People',
      'Auction',
      'Command post',
      'Allocation',
      'Matches',
      'Groups',
      'Knockout',
      'Stats',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    await expect(ownerPage.getByLabel(/^Champions: /)).toBeVisible();

    // A captain sees the player pages, not the organiser ones.
    const captainPage = await pageFor(browser, a.captains[0]!.ctx);
    await captainPage.goto(`/t/${a.tid}/matches`);
    const capNav = captainPage.getByRole('navigation', { name: 'Tournament' });
    await expect(capNav.getByRole('link', { name: 'Matches', exact: true })).toBeVisible();
    await expect(capNav.getByRole('link', { name: 'Command post' })).toHaveCount(0);
    await expect(capNav.getByRole('link', { name: 'Settings' })).toHaveCount(0);

    // Tenant isolation in the browser: each organiser gets a 404 on the other's tournament.
    const ownerBPage = await pageFor(browser, b.owner);
    for (const path of ['', '/people', '/auction', '/command-post', '/matches', '/settings']) {
      const res = await ownerBPage.goto(`/t/${a.tid}${path}`);
      expect(res?.status(), `B on A${path || '/'}`).toBe(404);
    }
    const apiRes = await b.owner.get(`/api/tournaments/${a.tid}/auction`);
    expect(apiRes.status()).toBe(404);

    // The one big-screen link follows the stage: after the auction it's the format view.
    const live = await a.owner.get(`/live/${a.liveCode}`, { maxRedirects: 0 });
    expect([307, 308]).toContain(live.status());
    expect(live.headers().location).toContain(`/live/${a.liveCode}/format`);
  });
});
