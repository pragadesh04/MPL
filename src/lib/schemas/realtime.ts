import { z } from 'zod';
import { idSchema } from './domain';
import { participantKindSchema, leaderApprovalSchema, tournamentStatusSchema } from './enums';

/**
 * Real-time contracts (PLAN.md §6.3, §6.5). The server publishes these to Ably after COMMIT;
 * browsers only subscribe. Envelope: `{ type, tournamentId, version, serverNow, data }`.
 *
 * - `t:<id>:auction` events carry `auction_state.version`.
 * - `t:<id>:updates` events carry `tournaments.roster_version`.
 * - `u:<userId>` inbox events carry no sequence (`version: null`, `tournamentId` may be null).
 *
 * Clients apply an auction event only if `version === local + 1`; on a gap they refetch the
 * snapshot (`GET /api/tournaments/:id/auction`).
 */

const isoDate = z.iso.datetime({ offset: true });
const mp = z.number().int().nonnegative();

// ─── t:<id>:auction ───────────────────────────────────────────────────────────────────────

export const lotOpenedDataSchema = z.object({
  playerId: idSchema,
  round: z.number().int().positive(),
  /** Effective opening price (re-auction price in re-auction rounds). */
  basePrice: mp,
  /** The original base price, shown struck through in re-auction rounds. */
  originalBasePrice: mp,
  isReauction: z.boolean(),
  endsAt: isoDate,
});

export const bidPlacedDataSchema = z.object({
  bidId: z.number().int().positive(),
  playerId: idSchema,
  teamId: idSchema,
  amount: mp,
  endsAt: isoDate,
  /** Auctioneer-entered fallback bid (§2.6). */
  isFallback: z.boolean(),
  enteredByUserId: idSchema.nullable(),
});

export const lotClosedDataSchema = z.object({
  playerId: idSchema,
  result: z.enum(['SOLD', 'UNSOLD']),
  teamId: idSchema.nullable(),
  price: mp.nullable(),
  /** e.g. 'NO_BIDS', 'NO_SPACE', 'CLOSED_BY_ORGANISER'. */
  reason: z.string().nullable(),
  /** End of the break; the next lot opens then. Null when the round / auction ended. */
  nextAt: isoDate.nullable(),
});

export const auctionPausedDataSchema = z.object({
  pausedRemainingMs: z.number().int().nonnegative(),
});
export const auctionResumedDataSchema = z.object({
  endsAt: isoDate.nullable(),
  nextAt: isoDate.nullable(),
});
export const controlChangedDataSchema = z.object({ controllerUserId: idSchema.nullable() });
export const allocationStepDataSchema = z.object({
  step: z.number().int().nonnegative(),
  playerId: idSchema,
  teamId: idSchema,
  /** Human reason, e.g. "Fewest players: 3". */
  reason: z.string(),
});

export const AUCTION_EVENT_TYPES = [
  'lot.opened',
  'bid.placed',
  'lot.closed',
  'auction.paused',
  'auction.resumed',
  'control.changed',
  'allocation.step',
] as const;
export type AuctionEventType = (typeof AUCTION_EVENT_TYPES)[number];

export const auctionEventDataSchemas = {
  'lot.opened': lotOpenedDataSchema,
  'bid.placed': bidPlacedDataSchema,
  'lot.closed': lotClosedDataSchema,
  'auction.paused': auctionPausedDataSchema,
  'auction.resumed': auctionResumedDataSchema,
  'control.changed': controlChangedDataSchema,
  'allocation.step': allocationStepDataSchema,
} as const satisfies Record<AuctionEventType, z.ZodType>;

// ─── t:<id>:updates ───────────────────────────────────────────────────────────────────────

export const peopleUpdatedDataSchema = z.object({
  /** What changed, for targeted refreshes; clients may simply router.refresh(). */
  kind: z.enum(['LEADER', 'PLAYER', 'MEMBER', 'REGISTRATION']).optional(),
  ids: z.array(idSchema).optional(),
});
export const teamUpdatedDataSchema = z.object({ teamId: idSchema });
export const groupsUpdatedDataSchema = z.object({});
export const matchUpdatedDataSchema = z.object({ matchIds: z.array(idSchema) });
export const tournamentStatusDataSchema = z.object({
  status: tournamentStatusSchema,
  announcement: z.string().nullable().optional(),
});

export const UPDATE_EVENT_TYPES = [
  'people.updated',
  'team.updated',
  'groups.updated',
  'match.updated',
  'tournament.status',
] as const;
export type UpdateEventType = (typeof UPDATE_EVENT_TYPES)[number];

export const updateEventDataSchemas = {
  'people.updated': peopleUpdatedDataSchema,
  'team.updated': teamUpdatedDataSchema,
  'groups.updated': groupsUpdatedDataSchema,
  'match.updated': matchUpdatedDataSchema,
  'tournament.status': tournamentStatusDataSchema,
} as const satisfies Record<UpdateEventType, z.ZodType>;

// ─── u:<userId> inbox ─────────────────────────────────────────────────────────────────────

export const requestReceivedDataSchema = z.object({ requestId: idSchema });
export const requestCancelledDataSchema = z.object({ requestId: idSchema });
export const approvalChangedDataSchema = z.object({
  kind: participantKindSchema,
  /** leaders.id or players.id */
  recordId: idSchema,
  approval: leaderApprovalSchema,
});
export const notificationNewDataSchema = z.object({
  notificationId: z.number().int().positive(),
  type: z.string(),
});

export const INBOX_EVENT_TYPES = [
  'request.received',
  'request.cancelled',
  'approval.changed',
  'notification.new',
] as const;
export type InboxEventType = (typeof INBOX_EVENT_TYPES)[number];

export const inboxEventDataSchemas = {
  'request.received': requestReceivedDataSchema,
  'request.cancelled': requestCancelledDataSchema,
  'approval.changed': approvalChangedDataSchema,
  'notification.new': notificationNewDataSchema,
} as const satisfies Record<InboxEventType, z.ZodType>;

// ─── Envelope ─────────────────────────────────────────────────────────────────────────────

export type RealtimeEventType = AuctionEventType | UpdateEventType | InboxEventType;

type DataOf<M, K extends keyof M> = M[K] extends z.ZodType ? z.infer<M[K]> : never;

export type EventDataMap = {
  [K in AuctionEventType]: DataOf<typeof auctionEventDataSchemas, K>;
} & {
  [K in UpdateEventType]: DataOf<typeof updateEventDataSchemas, K>;
} & {
  [K in InboxEventType]: DataOf<typeof inboxEventDataSchemas, K>;
};

/** What travels over Ably for every event. */
export interface RealtimeEnvelope<T extends RealtimeEventType = RealtimeEventType> {
  type: T;
  /** Null only for inbox events not tied to a tournament. */
  tournamentId: string | null;
  /** Sequence number of the channel (auction / roster); null for inbox events. */
  version: number | null;
  /** Postgres now() at publish time, ISO string. Clients derive their clock offset from it. */
  serverNow: string;
  data: EventDataMap[T];
}

export type AuctionEnvelope = { [K in AuctionEventType]: RealtimeEnvelope<K> }[AuctionEventType];
export type UpdateEnvelope = { [K in UpdateEventType]: RealtimeEnvelope<K> }[UpdateEventType];
export type InboxEnvelope = { [K in InboxEventType]: RealtimeEnvelope<K> }[InboxEventType];
export type AnyEnvelope = AuctionEnvelope | UpdateEnvelope | InboxEnvelope;

export const envelopeBaseSchema = z.object({
  type: z.string(),
  tournamentId: idSchema.nullable(),
  version: z.number().int().nonnegative().nullable(),
  serverNow: isoDate,
  data: z.unknown(),
});

const allDataSchemas: Record<string, z.ZodType> = {
  ...auctionEventDataSchemas,
  ...updateEventDataSchemas,
  ...inboxEventDataSchemas,
};

/** Validate an incoming message (client side). Returns null for unknown / malformed events. */
export function parseEnvelope(raw: unknown): AnyEnvelope | null {
  const base = envelopeBaseSchema.safeParse(raw);
  if (!base.success) return null;
  const dataSchema = allDataSchemas[base.data.type];
  if (!dataSchema) return null;
  const data = dataSchema.safeParse(base.data.data);
  if (!data.success) return null;
  return { ...base.data, data: data.data } as AnyEnvelope;
}

// ─── Outgoing webhooks (§6.4) ─────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  'lot.opened',
  'lot.sold',
  'lot.unsold',
  'bid.placed',
  'auction.started',
  'auction.paused',
  'auction.resumed',
  'auction.completed',
  'allocation.completed',
  'groups.drawn',
  'match.result',
  'tournament.completed',
] as const;
export const webhookEventSchema = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
/** `bid.placed` is noisy and off by default. */
export const DEFAULT_WEBHOOK_EVENTS: WebhookEvent[] = WEBHOOK_EVENTS.filter(
  (e) => e !== 'bid.placed',
);
