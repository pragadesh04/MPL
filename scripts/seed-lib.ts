/**
 * Staged test data (PLAN §13.3). `seedDatabase(db, stage)` WIPES every table, then creates two
 * unrelated organisers, each with one tournament at `stage`:
 *
 *   ravi  → "Ravi's MPL Season 2"  8 captains, 29 soldiers (2 groups of 4 → semis → final)
 *   meera → "Meera's Militia Cup"  4 captains, 15 soldiers (1 group of 4 → final)
 *
 * plus `ravi_coadmin`, `ravi_auctioneer`, `free_agent` (in no tournament) and `dual_soldier`
 * (a soldier in BOTH organisers' tournaments). Every account's password is `password123`.
 *
 * Stages: draft · ready · auction · allocated (= GROUP_DRAW, allocation done) · groups · knockout.
 * The data is hand-built (the rule functions are lane work), deterministic, and satisfies every
 * database constraint. No `server-only` imports here: this runs under tsx.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../src/server/db/connect';
import {
  auctionState,
  auditLog,
  bids,
  groups,
  groupTeams,
  joinRequests,
  leaders,
  matches,
  matchGames,
  memberships,
  players,
  teams,
  tournaments,
  users,
  type NewMatch,
} from '../src/server/db/schema';
import { KEY_ALPHABET } from '../src/lib/schemas/domain';
import type { TournamentStatus } from '../src/lib/schemas/enums';
import { DEFAULT_SETTINGS } from '../src/lib/schemas/settings';

export const SEED_STAGES = [
  'draft',
  'ready',
  'auction',
  'allocated',
  'groups',
  'knockout',
] as const;
export type SeedStage = (typeof SEED_STAGES)[number];
export const SEED_PASSWORD = 'password123';

const STAGE_STATUS: Record<SeedStage, TournamentStatus> = {
  draft: 'DRAFT',
  ready: 'READY',
  auction: 'AUCTION_LIVE',
  allocated: 'GROUP_DRAW',
  groups: 'GROUP_STAGE',
  knockout: 'KNOCKOUT',
};

const STARTED: ReadonlySet<SeedStage> = new Set(['auction', 'allocated', 'groups', 'knockout']);

interface TeamSpec {
  name: string;
  shortName: string;
  color: string;
  emoji: string;
}

interface OrgSpec {
  username: string;
  displayName: string;
  email: string;
  organiserKey: string;
  tournamentName: string;
  liveCode: string;
  captainPrefix: string;
  soldierPrefix: string;
  soldierCount: number;
  teams: TeamSpec[];
}

const ORGS: OrgSpec[] = [
  {
    username: 'ravi',
    displayName: 'Ravi Kumar',
    email: 'ravi@example.test',
    organiserKey: 'RV7K2P',
    tournamentName: "Ravi's MPL Season 2",
    liveCode: 'ravi-live',
    captainPrefix: 'a_cap',
    soldierPrefix: 'a_sol',
    soldierCount: 28,
    teams: [
      { name: 'Red Rhinos', shortName: 'RHN', color: '#e53935', emoji: '🦏' },
      { name: 'Blue Hawks', shortName: 'HWK', color: '#1e88e5', emoji: '🦅' },
      { name: 'Green Vipers', shortName: 'VIP', color: '#43a047', emoji: '🐍' },
      { name: 'Gold Jackals', shortName: 'JCK', color: '#fdd835', emoji: '🐺' },
      { name: 'Purple Panthers', shortName: 'PNT', color: '#8e24aa', emoji: '🐆' },
      { name: 'Orange Tigers', shortName: 'TGR', color: '#fb8c00', emoji: '🐅' },
      { name: 'Cyan Sharks', shortName: 'SHK', color: '#00acc1', emoji: '🦈' },
      { name: 'Pink Flamingos', shortName: 'FLM', color: '#d81b60', emoji: '🦩' },
    ],
  },
  {
    username: 'meera',
    displayName: 'Meera Shah',
    email: 'meera@example.test',
    organiserKey: 'MRA3XQ',
    tournamentName: "Meera's Militia Cup",
    liveCode: 'meera-live',
    captainPrefix: 'b_cap',
    soldierPrefix: 'b_sol',
    soldierCount: 14,
    teams: [
      { name: 'Iron Wolves', shortName: 'WLF', color: '#757575', emoji: '🐺' },
      { name: 'Night Owls', shortName: 'OWL', color: '#3949ab', emoji: '🦉' },
      { name: 'Desert Foxes', shortName: 'FOX', color: '#ffb300', emoji: '🦊' },
      { name: 'Storm Cobras', shortName: 'COB', color: '#00897b', emoji: '🐍' },
    ],
  },
];

const FIRST_NAMES = [
  'Arjun',
  'Kabir',
  'Rohan',
  'Vikram',
  'Aditya',
  'Ishaan',
  'Karan',
  'Dev',
  'Nikhil',
  'Rahul',
  'Sameer',
  'Tanvir',
  'Yash',
  'Zaid',
  'Faizan',
  'Gautam',
  'Harsh',
  'Imran',
  'Jatin',
  'Lakshay',
  'Manav',
  'Naveen',
  'Omkar',
  'Pranav',
  'Qasim',
  'Rishi',
  'Siddharth',
  'Tushar',
  'Uday',
  'Varun',
];
const MAPS = ['Catacombs', 'Outpost', 'High Tower', 'Bunkers', 'Snow Blind'];

/** Deterministic, unique 6-char code from the unambiguous alphabet. */
function codeFor(n: number): string {
  let x = 1_000_003 + n * 7_919;
  let s = '';
  for (let i = 0; i < 6; i++) {
    s = KEY_ALPHABET[x % KEY_ALPHABET.length] + s;
    x = Math.floor(x / KEY_ALPHABET.length);
  }
  return s;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export interface SeedSummary {
  stage: SeedStage;
  users: number;
  tournaments: {
    name: string;
    id: string;
    status: TournamentStatus;
    owner: string;
    liveCode: string;
  }[];
}

/** Remove every row from every table (keeps the schema). */
export async function wipeDatabase(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE users, tournaments, rate_limits, password_resets, organiser_blocks,
      notifications, processed_commands, webhook_deliveries, webhooks, audit_log
    RESTART IDENTITY CASCADE
  `);
}

export async function seedDatabase(
  db: Db,
  stage: SeedStage,
  opts: { passwordHash: string },
): Promise<SeedSummary> {
  await wipeDatabase(db);
  let codeCounter = 0;
  const nextCode = (): string => codeFor(++codeCounter);

  const makeAccount = async (
    username: string,
    displayName: string,
    extra: Partial<typeof users.$inferInsert> = {},
  ): Promise<string> => {
    const [row] = await db
      .insert(users)
      .values({
        username,
        displayName,
        passwordHash: opts.passwordHash,
        ign: `${displayName.split(' ')[0]}_MM`,
        playerCode: nextCode(),
        ...extra,
      })
      .returning({ id: users.id });
    return row!.id;
  };

  const coAdminId = await makeAccount('ravi_coadmin', 'Sanjay (co-admin)');
  const auctioneerId = await makeAccount('ravi_auctioneer', 'Priya (auctioneer)');
  await makeAccount('free_agent', 'Faiz Free Agent');
  const dualId = await makeAccount('dual_soldier', 'Dhruv Dual');

  const summary: SeedSummary = { stage, users: 4, tournaments: [] };

  for (const [orgIndex, org] of ORGS.entries()) {
    const ownerId = await makeAccount(org.username, org.displayName, {
      isOrganiser: true,
      email: org.email,
      organiserKey: org.organiserKey,
    });
    summary.users++;

    const status = STAGE_STATUS[stage];
    const started = STARTED.has(stage);
    const [tour] = await db
      .insert(tournaments)
      .values({
        ownerId,
        name: org.tournamentName,
        status,
        settings: { ...DEFAULT_SETTINGS },
        liveCode: org.liveCode,
        registrationOpen: !started,
        announcement: orgIndex === 0 ? 'Auction night is Saturday 8 PM. Charge your phones!' : null,
        rosterVersion: 1,
        startedAt: started ? sql`now() - interval '1 hour'` : null,
        lockedAt: started ? sql`now() - interval '1 hour'` : null,
      })
      .returning();
    const tid = tour!.id;
    summary.tournaments.push({
      name: org.tournamentName,
      id: tid,
      status,
      owner: org.username,
      liveCode: org.liveCode,
    });

    await db.insert(memberships).values({ tournamentId: tid, userId: ownerId, role: 'OWNER' });
    if (orgIndex === 0) {
      await db.insert(memberships).values([
        { tournamentId: tid, userId: coAdminId, role: 'CO_ADMIN', addedBy: ownerId },
        { tournamentId: tid, userId: auctioneerId, role: 'AUCTIONEER', addedBy: ownerId },
      ]);
    }

    // ── Captains + teams ──────────────────────────────────────────────────────────────
    const teamIds: string[] = [];
    const leaderIds: string[] = [];
    for (const [i, spec] of org.teams.entries()) {
      const username = `${org.captainPrefix}${i + 1}`;
      const displayName = `${FIRST_NAMES[(i + orgIndex * 11) % FIRST_NAMES.length]} ${spec.name.split(' ')[1]}`;
      const userId = await makeAccount(username, displayName);
      summary.users++;

      // Draft quirks (Ravi only): captain 7 hasn't claimed the personal link yet, captain 8
      // signed up with the organiser key and is waiting for approval.
      const unclaimed = stage === 'draft' && orgIndex === 0 && i === 6;
      const pending = stage === 'draft' && orgIndex === 0 && i === 7;
      const [leader] = await db
        .insert(leaders)
        .values({
          tournamentId: tid,
          userId: unclaimed ? null : userId,
          name: displayName,
          ign: `${displayName.split(' ')[0]}_MM`,
          source: pending ? 'ORGANISER_KEY' : 'ADDED_BY_ORGANISER',
          approval: pending ? 'PENDING' : 'APPROVED',
          purseTotal: DEFAULT_SETTINGS.defaultPurse,
          purseRemaining: DEFAULT_SETTINGS.defaultPurse,
          inviteStatus: unclaimed ? 'NOT_OPENED' : pending ? 'ACCOUNT_LINKED' : 'TEAM_READY',
          lastActivityAt: unclaimed ? null : sql`now() - interval '2 hours'`,
        })
        .returning({ id: leaders.id });
      leaderIds.push(leader!.id);
      if (unclaimed || pending) continue;
      const [team] = await db
        .insert(teams)
        .values({
          tournamentId: tid,
          leaderId: leader!.id,
          name: spec.name,
          shortName: spec.shortName,
          color: spec.color,
          emoji: spec.emoji,
          motto: `${spec.name} never retreat!`,
          sortOrder: i,
        })
        .returning({ id: teams.id });
      teamIds.push(team!.id);
    }

    // ── Soldiers ──────────────────────────────────────────────────────────────────────
    const soldierRows: { id: string; basePrice: number }[] = [];
    const total = org.soldierCount + 1; // + dual_soldier
    for (let i = 0; i < total; i++) {
      const isDual = i === org.soldierCount;
      const phoneless = !isDual && i >= org.soldierCount - 2; // last two have no account
      const pendingKey = stage === 'draft' && orgIndex === 0 && (i === 0 || i === 1);
      let userId: string | null = null;
      let name: string;
      if (isDual) {
        userId = dualId;
        name = 'Dhruv Dual';
      } else {
        name = `${FIRST_NAMES[(i + 3 + orgIndex * 7) % FIRST_NAMES.length]} ${org.soldierPrefix.toUpperCase()}${pad(i + 1)}`;
        if (!phoneless) {
          userId = await makeAccount(`${org.soldierPrefix}${pad(i + 1)}`, name);
          summary.users++;
        }
      }
      const basePrice = 1 + (i % 5);
      const [row] = await db
        .insert(players)
        .values({
          tournamentId: tid,
          userId,
          name,
          ign: `${name.split(' ')[0]}${pad(i + 1)}`,
          source: pendingKey
            ? 'ORGANISER_KEY'
            : isDual
              ? 'PLAYER_ID_REQUEST'
              : 'ADDED_BY_ORGANISER',
          inviteStatus: userId ? 'ACCOUNT_LINKED' : 'NOT_OPENED',
          basePrice,
          status: pendingKey ? 'PENDING_APPROVAL' : 'POOL',
        })
        .returning({ id: players.id });
      soldierRows.push({ id: row!.id, basePrice });
    }

    if (stage === 'draft') {
      if (orgIndex === 0) {
        const [fa] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`${users.username} = 'free_agent'`);
        await db.insert(joinRequests).values({
          tournamentId: tid,
          fromUserId: ownerId,
          toUserId: fa!.id,
          role: 'PLAYER',
          basePrice: 2,
          expiresAt: sql`now() + interval '7 days'`,
        });
      }
      continue;
    }
    if (stage === 'ready') continue;

    await db.insert(auditLog).values({
      tournamentId: tid,
      actorUserId: ownerId,
      action: 'tournament.started',
      after: { status: 'AUCTION_LIVE' },
    });

    // Pool order for every started stage.
    for (const [i, s] of soldierRows.entries()) {
      await db
        .update(players)
        .set({ auctionOrder: i + 1 })
        .where(sql`${players.id} = ${s.id}`);
    }

    const spent = new Map<string, number>(teamIds.map((t) => [t, 0]));
    const sell = async (
      soldierIndex: number,
      teamIndex: number,
      price: number,
      via: 'AUCTION' | 'AUTO_ALLOCATED',
    ): Promise<void> => {
      const s = soldierRows[soldierIndex]!;
      const teamId = teamIds[teamIndex]!;
      await db
        .update(players)
        .set({
          status: via === 'AUCTION' ? 'SOLD' : 'ALLOCATED',
          teamId,
          soldPrice: price,
          acquiredVia: via,
        })
        .where(sql`${players.id} = ${s.id}`);
      if (via === 'AUCTION') {
        await db.insert(bids).values({
          tournamentId: tid,
          playerId: s.id,
          teamId,
          amount: price,
          round: 1,
          enteredBy: null,
        });
      }
      spent.set(teamId, (spent.get(teamId) ?? 0) + price);
    };

    const teamCount = teamIds.length;
    if (stage === 'auction') {
      // First 10 sold, the 11th is on the block with two bids, the rest wait in the pool.
      for (let i = 0; i < 10; i++)
        await sell(i, i % teamCount, soldierRows[i]!.basePrice + (i % 3), 'AUCTION');
      const onBlock = soldierRows[10]!;
      await db
        .update(players)
        .set({ status: 'ON_BLOCK' })
        .where(sql`${players.id} = ${onBlock.id}`);
      await db.insert(bids).values([
        {
          tournamentId: tid,
          playerId: onBlock.id,
          teamId: teamIds[0]!,
          amount: onBlock.basePrice,
          round: 1,
        },
        {
          tournamentId: tid,
          playerId: onBlock.id,
          teamId: teamIds[1]!,
          amount: onBlock.basePrice + 1,
          round: 1,
        },
      ]);
      await applyPurses(db, leaderIds, teamIds, spent);
      await db.insert(auctionState).values({
        tournamentId: tid,
        currentPlayerId: onBlock.id,
        currentBid: onBlock.basePrice + 1,
        currentTeamId: teamIds[1]!,
        endsAt: sql`now() + interval '45 seconds'`,
        round: 1,
        controllerUserId: ownerId,
        version: 32,
      });
      continue;
    }

    // allocated / groups / knockout: everyone is in a squad. The last few soldiers were
    // auto-allocated at price 0 (§3.4).
    const autoFrom = soldierRows.length - Math.min(3, teamCount);
    for (let i = 0; i < soldierRows.length; i++) {
      const auto = i >= autoFrom;
      await sell(
        i,
        i % teamCount,
        auto ? 0 : soldierRows[i]!.basePrice + (i % 3),
        auto ? 'AUTO_ALLOCATED' : 'AUCTION',
      );
    }
    await applyPurses(db, leaderIds, teamIds, spent);
    await db.insert(auctionState).values({
      tournamentId: tid,
      round: 2,
      controllerUserId: ownerId,
      version: 120,
    });
    if (stage === 'allocated') continue;

    await seedFormat(db, tid, teamIds, stage === 'knockout');
  }

  return summary;
}

async function applyPurses(
  db: Db,
  leaderIds: string[],
  teamIds: string[],
  spent: Map<string, number>,
): Promise<void> {
  for (const [i, teamId] of teamIds.entries()) {
    await db
      .update(leaders)
      .set({ purseRemaining: sql`${leaders.purseTotal} - ${spent.get(teamId) ?? 0}` })
      .where(sql`${leaders.id} = ${leaderIds[i]!}`);
  }
}

/** Circle-method fixtures for exactly 4 teams (indexes into the group). */
const ROUND_ROBIN_4: [number, number][][] = [
  [
    [0, 3],
    [1, 2],
  ],
  [
    [0, 2],
    [3, 1],
  ],
  [
    [0, 1],
    [2, 3],
  ],
];

/**
 * Groups of 4 (8 teams → A, B; 4 teams → A), round-robin fixtures numbered with groups
 * interleaved, and the knockout tree with placeholders. Results: within each group the
 * earlier-drawn team always wins, so standings are A1 = first team, A2 = second.
 */
async function seedFormat(
  db: Db,
  tid: string,
  teamIds: string[],
  knockoutStage: boolean,
): Promise<void> {
  const groupCount = teamIds.length / 4;
  const groupRows: { id: string; name: string; teamIds: string[] }[] = [];
  for (let g = 0; g < groupCount; g++) {
    const name = String.fromCharCode(65 + g);
    const [row] = await db
      .insert(groups)
      .values({ tournamentId: tid, name, sortOrder: g })
      .returning({ id: groups.id });
    // Snake draw across groups so each group has a mix of teams.
    const members = teamIds.filter((_, i) => i % groupCount === g);
    await db.insert(groupTeams).values(
      members.map((teamId, pot) => ({
        groupId: row!.id,
        teamId,
        tournamentId: tid,
        pot: pot + 1,
      })),
    );
    groupRows.push({ id: row!.id, name, teamIds: members });
  }

  let matchNumber = 0;
  for (const [md, fixtures] of ROUND_ROBIN_4.entries()) {
    for (const group of groupRows) {
      for (const [a, b] of fixtures) {
        matchNumber++;
        const teamA = group.teamIds[a]!;
        const teamB = group.teamIds[b]!;
        const winner = a < b ? teamA : teamB;
        const done = knockoutStage || md === 0;
        const live = !knockoutStage && md === 1 && matchNumber === groupRows.length * 2 + 1;
        const [m] = await db
          .insert(matches)
          .values({
            tournamentId: tid,
            matchNumber,
            stage: 'GROUP',
            groupId: group.id,
            matchday: md + 1,
            teamAId: teamA,
            teamBId: teamB,
            bestOf: 1,
            status: done ? 'DONE' : live ? 'LIVE' : 'SCHEDULED',
            winnerTeamId: done ? winner : null,
          })
          .returning({ id: matches.id });
        if (done) {
          const aWins = winner === teamA;
          await db.insert(matchGames).values({
            matchId: m!.id,
            gameNo: 1,
            map: MAPS[matchNumber % MAPS.length],
            killsA: aWins ? 20 : 11 + (matchNumber % 7),
            killsB: aWins ? 11 + (matchNumber % 7) : 20,
            winnerTeamId: winner,
          });
        }
      }
    }
  }

  // Knockout tree with placeholders, created at the draw so the full order is visible (§4.6).
  const gp = (g: number, pos: number) => ({
    type: 'GROUP_POS' as const,
    ref: `${groupRows[g]!.id}:${pos}`,
  });
  const winnerOf = (g: number, pos: number): string => groupRows[g]!.teamIds[pos - 1]!;

  const [final] = await db
    .insert(matches)
    .values({
      tournamentId: tid,
      matchNumber: matchNumber + (groupCount === 1 ? 1 : 3),
      stage: 'KNOCKOUT',
      round: groupCount === 1 ? 1 : 2,
      slot: 0,
      bestOf: DEFAULT_SETTINGS.finalBestOf,
      ...(groupCount === 1
        ? {
            sourceA: gp(0, 1),
            sourceB: gp(0, 2),
            teamAId: knockoutStage ? winnerOf(0, 1) : null,
            teamBId: knockoutStage ? winnerOf(0, 2) : null,
          }
        : {}),
    })
    .returning({ id: matches.id });
  if (groupCount === 1) return;

  // Semi-finals: A1 v B2 (top half), B1 v A2 (bottom half).
  const semis: NewMatch[] = [
    {
      slot: 0,
      sourceA: gp(0, 1),
      sourceB: gp(1, 2),
      teamAId: winnerOf(0, 1),
      teamBId: winnerOf(1, 2),
    },
    {
      slot: 1,
      sourceA: gp(1, 1),
      sourceB: gp(0, 2),
      teamAId: winnerOf(1, 1),
      teamBId: winnerOf(0, 2),
    },
  ].map((s, i) => ({
    tournamentId: tid,
    matchNumber: matchNumber + 1 + i,
    stage: 'KNOCKOUT' as const,
    round: 1,
    slot: s.slot,
    sourceA: s.sourceA,
    sourceB: s.sourceB,
    teamAId: knockoutStage ? s.teamAId : null,
    teamBId: knockoutStage ? s.teamBId : null,
    bestOf: DEFAULT_SETTINGS.knockoutBestOf,
    nextMatchId: final!.id,
    nextSlot: i === 0 ? 'A' : 'B',
  }));
  const semiRows = await db.insert(matches).values(semis).returning({ id: matches.id });
  await db
    .update(matches)
    .set({
      sourceA: { type: 'WINNER_OF', ref: semiRows[0]!.id },
      sourceB: { type: 'WINNER_OF', ref: semiRows[1]!.id },
    })
    .where(sql`${matches.id} = ${final!.id}`);

  if (knockoutStage) {
    // Semi-final 1 is done (A1 won 2–1) and the winner moved into the final; semi 2 is live.
    const a1 = winnerOf(0, 1);
    const b2 = winnerOf(1, 2);
    await db
      .update(matches)
      .set({ status: 'DONE', winnerTeamId: a1 })
      .where(sql`${matches.id} = ${semiRows[0]!.id}`);
    await db.insert(matchGames).values([
      {
        matchId: semiRows[0]!.id,
        gameNo: 1,
        map: 'Outpost',
        killsA: 20,
        killsB: 17,
        winnerTeamId: a1,
      },
      {
        matchId: semiRows[0]!.id,
        gameNo: 2,
        map: 'Catacombs',
        killsA: 15,
        killsB: 20,
        winnerTeamId: b2,
      },
      {
        matchId: semiRows[0]!.id,
        gameNo: 3,
        map: 'Bunkers',
        killsA: 20,
        killsB: 12,
        winnerTeamId: a1,
      },
    ]);
    await db
      .update(matches)
      .set({ status: 'LIVE' })
      .where(sql`${matches.id} = ${semiRows[1]!.id}`);
    await db
      .update(matches)
      .set({ teamAId: a1 })
      .where(sql`${matches.id} = ${final!.id}`);
  }
}
