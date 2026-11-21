import { z } from 'zod';
import { idSchema } from './domain';
import { acquiredViaSchema, playerStatusSchema, tournamentStatusSchema } from './enums';

/**
 * Auction API contracts (PLAN.md §5 API table, §6.2, §6.3). Lane B implements the endpoints;
 * every other lane may read the snapshot type.
 */

const mp = z.number().int().nonnegative();
const isoDate = z.iso.datetime({ offset: true });

/** Client-generated idempotency key, stored in `processed_commands` (§6.2). */
export const commandIdSchema = z.uuid();

// ─── Requests ─────────────────────────────────────────────────────────────────────────────

/** POST /api/tournaments/:id/auction/bids */
export const placeBidRequestSchema = z.object({
  amount: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
  commandId: commandIdSchema,
  /**
   * Only for the controlling auctioneer's fallback bid (§2.6). Captains never send it: the
   * server takes their team from the session's role in this tournament (§9 item 8).
   */
  teamId: idSchema.optional(),
});
export type PlaceBidRequest = z.infer<typeof placeBidRequestSchema>;

const commandBase = {
  expectedVersion: z.number().int().nonnegative(),
  commandId: commandIdSchema,
};

/** POST /api/tournaments/:id/auction/commands */
export const auctionCommandSchema = z.discriminatedUnion('type', [
  /** Open the next soldier now (skip the break) or a chosen one from the pool. */
  z.object({ type: z.literal('next'), playerId: idSchema.optional(), ...commandBase }),
  z.object({ type: z.literal('sold'), ...commandBase }),
  z.object({ type: z.literal('unsold'), ...commandBase }),
  z.object({ type: z.literal('pause'), ...commandBase }),
  z.object({ type: z.literal('resume'), ...commandBase }),
  z.object({ type: z.literal('undo'), reason: z.string().trim().min(1).max(500), ...commandBase }),
  z.object({ type: z.literal('take-control'), ...commandBase }),
  z.object({ type: z.literal('start-round'), ...commandBase }),
  /** Remove a bought soldier from a squad, refund, back to the pool. */
  z.object({
    type: z.literal('release'),
    playerId: idSchema,
    reason: z.string().max(500).optional(),
    ...commandBase,
  }),
  /** Move one unsold soldier back into the pool. */
  z.object({ type: z.literal('auction-again'), playerId: idSchema, ...commandBase }),
  /** "Admin pick": unsold soldier straight into a squad at price 0. */
  z.object({ type: z.literal('assign'), playerId: idSchema, teamId: idSchema, ...commandBase }),
  /** Owner only, typed confirmation of the tournament name. */
  z.object({ type: z.literal('reset'), confirmName: z.string().min(1), ...commandBase }),
]);
export type AuctionCommand = z.infer<typeof auctionCommandSchema>;
export type AuctionCommandType = AuctionCommand['type'];

/** POST /api/tournaments/:id/auction/tick (body optional). */
export const tickRequestSchema = z.object({}).loose();

// ─── Snapshot (GET /api/tournaments/:id/auction) ─────────────────────────────────────────

export const snapshotSquadMemberSchema = z.object({
  playerId: idSchema,
  name: z.string(),
  ign: z.string().nullable(),
  photoUrl: z.string().nullable(),
  price: mp,
  acquiredVia: acquiredViaSchema,
});

export const snapshotTeamSchema = z.object({
  id: idSchema,
  leaderId: idSchema,
  captainName: z.string(),
  name: z.string(),
  shortName: z.string(),
  color: z.string(),
  logoUrl: z.string().nullable(),
  emoji: z.string().nullable(),
  sortOrder: z.number().int(),
  purseTotal: mp,
  purseRemaining: mp,
  spent: mp,
  /** 1 (captain) + soldiers. */
  squadSize: z.number().int().positive(),
  members: z.array(snapshotSquadMemberSchema),
});

export const snapshotPlayerSchema = z.object({
  id: idSchema,
  name: z.string(),
  ign: z.string().nullable(),
  photoUrl: z.string().nullable(),
  basePrice: mp,
  status: playerStatusSchema,
  auctionOrder: z.number().int().nullable(),
});

export const lastResultSchema = z.object({
  playerId: idSchema,
  result: z.enum(['SOLD', 'UNSOLD']),
  teamId: idSchema.nullable(),
  price: mp.nullable(),
  reason: z.string().nullable(),
  /**
   * When the lot closed (DB clock). Makes every close distinct, so the big screen stamps the same
   * soldier going UNSOLD twice in a row (re-auction). Optional for rows written before it existed.
   */
  closedAt: isoDate.optional(),
});
export type LastResult = z.infer<typeof lastResultSchema>;

export const auctionSnapshotSchema = z.object({
  tournamentId: idSchema,
  serverNow: isoDate,
  /** auction_state.version — the auction event sequence. */
  version: z.number().int().nonnegative(),
  /** tournaments.roster_version — the updates event sequence. */
  rosterVersion: z.number().int().nonnegative(),
  status: tournamentStatusSchema,
  round: z.number().int().positive(),
  current: z
    .object({
      playerId: idSchema,
      /** Effective opening price this round. */
      basePrice: mp,
      originalBasePrice: mp,
      isReauction: z.boolean(),
      currentBid: mp.nullable(),
      currentTeamId: idSchema.nullable(),
      /** Minimum next bid (nextValidBid). */
      nextBid: mp,
      endsAt: isoDate.nullable(),
    })
    .nullable(),
  nextAt: isoDate.nullable(),
  pausedRemainingMs: z.number().int().nonnegative().nullable(),
  controllerUserId: idSchema.nullable(),
  lastResult: lastResultSchema.nullable(),
  teams: z.array(snapshotTeamSchema),
  /** Waiting pool in auction order. */
  pool: z.array(snapshotPlayerSchema),
  unsold: z.array(snapshotPlayerSchema),
  recentBids: z.array(
    z.object({
      id: z.number().int().positive(),
      playerId: idSchema,
      teamId: idSchema,
      amount: mp,
      isFallback: z.boolean(),
      createdAt: isoDate,
    }),
  ),
});
export type AuctionSnapshot = z.infer<typeof auctionSnapshotSchema>;

// ─── Responses ────────────────────────────────────────────────────────────────────────────

/** Every successful auction write answers with the fresh snapshot. */
export const auctionWriteResponseSchema = z.object({ snapshot: auctionSnapshotSchema });
export type AuctionWriteResponse = z.infer<typeof auctionWriteResponseSchema>;
