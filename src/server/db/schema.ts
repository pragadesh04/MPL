/**
 * Complete database schema (PLAN.md §5). SHARED + FROZEN after Phase 0: lanes never edit this
 * file; they write needed changes as integration notes (PLAN §13.1).
 *
 * Conventions:
 * - ids are uuid (`gen_random_uuid()`), append-only logs use bigserial
 * - money is integer Militia Points (MP), never floats
 * - every tournament-owned table has `tournament_id … ON DELETE CASCADE`
 * - invariants live in the database (unique / partial unique / check constraints); services map
 *   unique violations to 409 instead of pre-checking (see `src/server/errors.ts`)
 *
 * No `import 'server-only'` here: drizzle-kit and the seed / migrate scripts load this file
 * outside Next.js. It is still server-only by convention (never import it from client code).
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACQUIRED_VIA,
  JOIN_REQUEST_STATUSES,
  JOIN_SOURCES,
  LEADER_APPROVALS,
  LEADER_INVITE_STATUSES,
  MATCH_STAGES,
  MATCH_STATUSES,
  MEMBERSHIP_ROLES,
  PARTICIPANT_KINDS,
  PLAYER_INVITE_STATUSES,
  PLAYER_STATUSES,
  TOURNAMENT_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_KINDS,
} from '../../lib/schemas/enums';
import type { MatchSource } from '../../lib/schemas/domain';

// ─── Enums ────────────────────────────────────────────────────────────────────────────────

export const tournamentStatusEnum = pgEnum('tournament_status', TOURNAMENT_STATUSES);
export const membershipRoleEnum = pgEnum('membership_role', MEMBERSHIP_ROLES);
export const joinSourceEnum = pgEnum('join_source', JOIN_SOURCES);
export const leaderApprovalEnum = pgEnum('leader_approval', LEADER_APPROVALS);
export const leaderInviteStatusEnum = pgEnum('leader_invite_status', LEADER_INVITE_STATUSES);
export const playerInviteStatusEnum = pgEnum('player_invite_status', PLAYER_INVITE_STATUSES);
export const playerStatusEnum = pgEnum('player_status', PLAYER_STATUSES);
export const acquiredViaEnum = pgEnum('acquired_via', ACQUIRED_VIA);
export const participantKindEnum = pgEnum('participant_kind', PARTICIPANT_KINDS);
export const joinRequestStatusEnum = pgEnum('join_request_status', JOIN_REQUEST_STATUSES);
export const matchStageEnum = pgEnum('match_stage', MATCH_STAGES);
export const matchStatusEnum = pgEnum('match_status', MATCH_STATUSES);
export const webhookKindEnum = pgEnum('webhook_kind', WEBHOOK_KINDS);
export const webhookDeliveryStatusEnum = pgEnum(
  'webhook_delivery_status',
  WEBHOOK_DELIVERY_STATUSES,
);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const tz = (name: string) => timestamp(name, { withTimezone: true });

// ─── Accounts ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    ign: text('ign'),
    phone: text('phone'),
    photoUrl: text('photo_url'),
    isOrganiser: boolean('is_organiser').notNull().default(false),
    /** Required for organisers. */
    email: text('email'),
    /** Public Player ID without the '#', e.g. `4K9QX7`. Every account has one. */
    playerCode: text('player_code').notNull(),
    /** Organisers only, stored without the dash, e.g. `RV7K2P`. */
    organiserKey: text('organiser_key'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    uniqueIndex('users_player_code_uq').on(t.playerCode),
    uniqueIndex('users_organiser_key_uq').on(t.organiserKey),
    check(
      'users_organiser_fields_ck',
      sql`NOT ${t.isOrganiser} OR ${t.organiserKey} IS NOT NULL`,
    ),
  ],
);

// ─── Tournaments & organiser team ─────────────────────────────────────────────────────────

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    status: tournamentStatusEnum('status').notNull().default('DRAFT'),
    /** Validated by `tournamentSettingsSchema` (src/lib/schemas/settings.ts), §3.1 + §4.1. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
    /** Public big-screen code for `/live/:liveCode`. */
    liveCode: text('live_code').notNull(),
    liveScreenEnabled: boolean('live_screen_enabled').notNull().default(true),
    registrationOpen: boolean('registration_open').notNull().default(true),
    maxRegistrations: integer('max_registrations'),
    /** One line of banner text (§7), null = no banner. */
    announcement: text('announcement'),
    /** Sequence for `t:<id>:updates` events (people / team / match changes). */
    rosterVersion: bigint('roster_version', { mode: 'number' }).notNull().default(0),
    createdAt: createdAt(),
    startedAt: tz('started_at'),
    lockedAt: tz('locked_at'),
    completedAt: tz('completed_at'),
    cancelledAt: tz('cancelled_at'),
  },
  (t) => [
    // One active tournament per organiser (§1, decision 11). Races are decided here → 409.
    uniqueIndex('tournaments_one_active_per_owner_uq')
      .on(t.ownerId)
      .where(sql`${t.status} NOT IN ('COMPLETED', 'CANCELLED')`),
    uniqueIndex('tournaments_live_code_uq').on(t.liveCode),
    check(
      'tournaments_max_registrations_ck',
      sql`${t.maxRegistrations} IS NULL OR ${t.maxRegistrations} > 0`,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull(),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tournamentId, t.userId] }),
    // Exactly one OWNER row per tournament (kept in step with tournaments.owner_id).
    uniqueIndex('memberships_one_owner_uq')
      .on(t.tournamentId)
      .where(sql`${t.role} = 'OWNER'`),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const organiserInvites = pgTable(
  'organiser_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    emailOrUsername: text('email_or_username').notNull(),
    role: membershipRoleEnum('role').notNull(),
    /** SHA-256 of the 32-byte random token; the raw token is only in the link. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: tz('expires_at').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    usedAt: tz('used_at'),
    usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: tz('revoked_at'),
  },
  (t) => [
    uniqueIndex('organiser_invites_token_hash_uq').on(t.tokenHash),
    index('organiser_invites_tournament_idx').on(t.tournamentId),
    check('organiser_invites_role_ck', sql`${t.role} <> 'OWNER'`),
  ],
);

// ─── People: captains (leaders), teams, soldiers (players) ───────────────────────────────

export const leaders = pgTable(
  'leaders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Null until the personal link is claimed. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Profile snapshot taken at join time (§5 "Profile snapshot").
    name: text('name').notNull(),
    ign: text('ign'),
    phone: text('phone'),
    photoUrl: text('photo_url'),
    source: joinSourceEnum('source').notNull(),
    approval: leaderApprovalEnum('approval').notNull().default('PENDING'),
    rejectReason: text('reject_reason'),
    purseTotal: integer('purse_total').notNull().default(0),
    purseRemaining: integer('purse_remaining').notNull().default(0),
    /** Bumped by "Regenerate" so old personal links stop working. */
    linkVersion: integer('link_version').notNull().default(1),
    inviteStatus: leaderInviteStatusEnum('invite_status').notNull().default('NOT_OPENED'),
    lastActivityAt: tz('last_activity_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('leaders_tournament_user_uq').on(t.tournamentId, t.userId),
    index('leaders_tournament_idx').on(t.tournamentId),
    check('leaders_purse_ck', sql`${t.purseRemaining} BETWEEN 0 AND ${t.purseTotal}`),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    leaderId: uuid('leader_id')
      .notNull()
      .references(() => leaders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** 3-letter short code, always shown next to the colour. */
    shortName: text('short_name').notNull(),
    /** Lowercase `#rrggbb`. */
    color: text('color').notNull(),
    secondaryColor: text('secondary_color'),
    logoUrl: text('logo_url'),
    emoji: text('emoji'),
    motto: text('motto'),
    seed: integer('seed'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('teams_leader_uq').on(t.leaderId),
    uniqueIndex('teams_tournament_name_uq').on(t.tournamentId, sql`lower(${t.name})`),
    uniqueIndex('teams_tournament_short_name_uq').on(t.tournamentId, sql`upper(${t.shortName})`),
    uniqueIndex('teams_tournament_color_uq').on(t.tournamentId, t.color),
    check('teams_color_ck', sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
    check(
      'teams_secondary_color_ck',
      sql`${t.secondaryColor} IS NULL OR ${t.secondaryColor} ~ '^#[0-9a-f]{6}$'`,
    ),
  ],
);

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Null until claimed, and forever for phone-less soldiers. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    ign: text('ign'),
    phone: text('phone'),
    photoUrl: text('photo_url'),
    source: joinSourceEnum('source').notNull(),
    linkVersion: integer('link_version').notNull().default(1),
    inviteStatus: playerInviteStatusEnum('invite_status').notNull().default('NOT_OPENED'),
    lastActivityAt: tz('last_activity_at'),
    /** Original base price; re-auction prices are derived from it (§3.1). */
    basePrice: integer('base_price').notNull().default(0),
    status: playerStatusEnum('status').notNull().default('PENDING_APPROVAL'),
    rejectReason: text('reject_reason'),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    soldPrice: integer('sold_price'),
    acquiredVia: acquiredViaEnum('acquired_via'),
    /** Position in the waiting pool (random / by price / manual queue). */
    auctionOrder: integer('auction_order'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('players_tournament_user_uq').on(t.tournamentId, t.userId),
    index('players_tournament_status_idx').on(t.tournamentId, t.status),
    index('players_team_idx').on(t.teamId),
    check('players_base_price_ck', sql`${t.basePrice} >= 0`),
    check('players_sold_price_ck', sql`${t.soldPrice} IS NULL OR ${t.soldPrice} >= 0`),
    // In a squad exactly when SOLD / ALLOCATED, and then the price and route are known.
    check(
      'players_squad_ck',
      sql`(${t.status} IN ('SOLD', 'ALLOCATED')) = (${t.teamId} IS NOT NULL)`,
    ),
    check(
      'players_squad_fields_ck',
      sql`${t.teamId} IS NULL OR (${t.soldPrice} IS NOT NULL AND ${t.acquiredVia} IS NOT NULL)`,
    ),
  ],
);

// ─── Passwords, joining, inbox ────────────────────────────────────────────────────────────

export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** The organiser who issued it; null when issued by the operator script. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    expiresAt: tz('expires_at').notNull(),
    usedAt: tz('used_at'),
  },
  (t) => [uniqueIndex('password_resets_token_hash_uq').on(t.tokenHash)],
);

export const joinRequests = pgTable(
  'join_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** The organiser who sent it. */
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: participantKindEnum('role').notNull(),
    purse: integer('purse'),
    basePrice: integer('base_price'),
    status: joinRequestStatusEnum('status').notNull().default('PENDING'),
    expiresAt: tz('expires_at').notNull(),
    createdAt: createdAt(),
    respondedAt: tz('responded_at'),
  },
  (t) => [
    uniqueIndex('join_requests_one_pending_uq')
      .on(t.tournamentId, t.toUserId)
      .where(sql`${t.status} = 'PENDING'`),
    index('join_requests_to_user_idx').on(t.toUserId, t.status),
    index('join_requests_from_user_created_idx').on(t.fromUserId, t.createdAt),
    check(
      'join_requests_amount_ck',
      sql`(${t.role} = 'LEADER' AND ${t.purse} IS NOT NULL AND ${t.purse} >= 0)
        OR (${t.role} = 'PLAYER' AND ${t.basePrice} IS NOT NULL AND ${t.basePrice} >= 0)`,
    ),
  ],
);

export const organiserBlocks = pgTable(
  'organiser_blocks',
  {
    playerUserId: uuid('player_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organiserUserId: uuid('organiser_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.playerUserId, t.organiserUserId] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: tz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

// ─── Auction ──────────────────────────────────────────────────────────────────────────────

export const auctionState = pgTable('auction_state', {
  tournamentId: uuid('tournament_id')
    .primaryKey()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  currentPlayerId: uuid('current_player_id').references(() => players.id, {
    onDelete: 'set null',
  }),
  currentBid: integer('current_bid'),
  currentTeamId: uuid('current_team_id').references(() => teams.id, { onDelete: 'set null' }),
  /** Lot deadline, always computed from Postgres now(). */
  endsAt: tz('ends_at'),
  /** End of the break between soldiers. */
  nextAt: tz('next_at'),
  round: integer('round').notNull().default(1),
  pausedRemainingMs: integer('paused_remaining_ms'),
  controllerUserId: uuid('controller_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  lastResult: jsonb('last_result').$type<Record<string, unknown>>(),
  /** Optimistic lock AND the `t:<id>:auction` event sequence number. */
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bids = pgTable(
  'bids',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    round: integer('round').notNull(),
    /** The user who placed it: the captain, or the auctioneer for a fallback bid. */
    enteredBy: uuid('entered_by').references(() => users.id, { onDelete: 'set null' }),
    /** True for auctioneer-entered fallback bids (§2.6), shown "entered by <organiser>". */
    isFallback: boolean('is_fallback').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('bids_tournament_player_idx').on(t.tournamentId, t.playerId, t.createdAt),
    check('bids_amount_ck', sql`${t.amount} > 0`),
  ],
);

export const processedCommands = pgTable('processed_commands', {
  commandId: text('command_id').primaryKey(),
  tournamentId: uuid('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  result: jsonb('result').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

// ─── Format: groups, matches ──────────────────────────────────────────────────────────────

export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** 'A', 'B', … */
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('groups_tournament_name_uq').on(t.tournamentId, t.name)],
);

export const groupTeams = pgTable(
  'group_teams',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    /** Denormalised so a team can be in at most one group per tournament. */
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Seeding pot the team was drawn from (1-based), null for manual placement. */
    pot: integer('pot'),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.teamId] }),
    uniqueIndex('group_teams_tournament_team_uq').on(t.tournamentId, t.teamId),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** Running order M1, M2… across the tournament; null for byes (§4.6). */
    matchNumber: integer('match_number'),
    stage: matchStageEnum('stage').notNull(),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    matchday: integer('matchday'),
    /** Knockout round depth (1 = first round). */
    round: integer('round'),
    /** Position within the round (0-based, top to bottom). */
    slot: integer('slot'),
    teamAId: uuid('team_a_id').references(() => teams.id, { onDelete: 'set null' }),
    teamBId: uuid('team_b_id').references(() => teams.id, { onDelete: 'set null' }),
    /** Placeholder source until the slot is decided, e.g. { type: 'WINNER_OF', ref: '<matchId>' }. */
    sourceA: jsonb('source_a').$type<MatchSource>(),
    sourceB: jsonb('source_b').$type<MatchSource>(),
    bestOf: integer('best_of').notNull().default(1),
    winnerTeamId: uuid('winner_team_id').references(() => teams.id, { onDelete: 'set null' }),
    nextMatchId: uuid('next_match_id').references((): AnyPgColumn => matches.id, {
      onDelete: 'set null',
    }),
    nextSlot: text('next_slot'),
    isBye: boolean('is_bye').notNull().default(false),
    status: matchStatusEnum('status').notNull().default('SCHEDULED'),
    scheduledAt: tz('scheduled_at'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_tournament_number_uq').on(t.tournamentId, t.matchNumber),
    index('matches_tournament_stage_idx').on(t.tournamentId, t.stage),
    check('matches_next_slot_ck', sql`${t.nextSlot} IS NULL OR ${t.nextSlot} IN ('A', 'B')`),
    check('matches_bye_number_ck', sql`NOT ${t.isBye} OR ${t.matchNumber} IS NULL`),
    check('matches_best_of_ck', sql`${t.bestOf} IN (1, 3, 5, 7)`),
    check('matches_group_stage_ck', sql`(${t.stage} = 'GROUP') = (${t.groupId} IS NOT NULL)`),
  ],
);

export const matchGames = pgTable(
  'match_games',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    gameNo: integer('game_no').notNull(),
    map: text('map'),
    killsA: integer('kills_a').notNull(),
    killsB: integer('kills_b').notNull(),
    winnerTeamId: uuid('winner_team_id').references(() => teams.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.gameNo] }),
    check('match_games_kills_ck', sql`${t.killsA} >= 0 AND ${t.killsB} >= 0`),
    // No draws: a game level on kills is replayed and can't be saved (§4.3).
    check('match_games_no_tie_ck', sql`${t.killsA} <> ${t.killsB}`),
  ],
);

export const playerStats = pgTable(
  'player_stats',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    mvp: boolean('mvp').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.playerId] }),
    check('player_stats_ck', sql`${t.kills} >= 0 AND ${t.deaths} >= 0`),
  ],
);

// ─── Audit, webhooks, rate limits ─────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_tournament_created_idx').on(t.tournamentId, t.createdAt)],
);

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    kind: webhookKindEnum('kind').notNull(),
    /** AES-256-GCM with APP_ENCRYPTION_KEY (a Discord URL is effectively a password). */
    urlEncrypted: text('url_encrypted').notNull(),
    /** Generic webhooks only. */
    signingSecretEncrypted: text('signing_secret_encrypted'),
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    enabled: boolean('enabled').notNull().default(true),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('webhooks_tournament_idx').on(t.tournamentId)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatusEnum('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('webhook_deliveries_webhook_created_idx').on(t.webhookId, t.createdAt)],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Row types ────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type OrganiserInvite = typeof organiserInvites.$inferSelect;
export type Leader = typeof leaders.$inferSelect;
export type NewLeader = typeof leaders.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type OrganiserBlock = typeof organiserBlocks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuctionStateRow = typeof auctionState.$inferSelect;
export type Bid = typeof bids.$inferSelect;
export type ProcessedCommand = typeof processedCommands.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupTeam = typeof groupTeams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchGame = typeof matchGames.$inferSelect;
export type PlayerStat = typeof playerStats.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type RateLimit = typeof rateLimits.$inferSelect;
