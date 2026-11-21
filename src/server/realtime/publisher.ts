import 'server-only';
import * as Ably from 'ably';
import { auctionChannel, updatesChannel, userChannel } from '@/lib/realtime/channels';
import type {
  AuctionEventType,
  EventDataMap,
  InboxEventType,
  RealtimeEnvelope,
  RealtimeEventType,
  UpdateEventType,
} from '@/lib/schemas/realtime';
import { env } from '../env';
import { logger } from '../logger';

/**
 * Server-side Ably publishing (PLAN §6.1, §6.3).
 *
 * RULES: publish only AFTER COMMIT (register the call with `withTransaction`'s `onCommit`), and
 * never inside a transaction. A failed publish is logged, never thrown: the database is still
 * right and clients catch up from a snapshot.
 *
 * In tests (NODE_ENV=test) and when ABLY_API_KEY is missing, events are RECORDED instead of sent
 * (`getPublishedEvents()`), so services can assert what they publish.
 */

export interface PublishedEvent {
  channel: string;
  envelope: RealtimeEnvelope;
}

const g = globalThis as typeof globalThis & {
  __mplAblyRest?: Ably.Rest;
  __mplPublished?: PublishedEvent[];
};

function recorded(): PublishedEvent[] {
  if (!g.__mplPublished) g.__mplPublished = [];
  return g.__mplPublished;
}

/** Events recorded instead of sent (tests / no Ably key). */
export function getPublishedEvents(): readonly PublishedEvent[] {
  return recorded();
}

export function clearPublishedEvents(): void {
  recorded().length = 0;
}

export function isRealtimeEnabled(): boolean {
  return env().NODE_ENV !== 'test' && Boolean(env().ABLY_API_KEY);
}

/** Shared Ably REST client (server only). Throws if real-time is disabled. */
export function ablyRest(): Ably.Rest {
  const key = env().ABLY_API_KEY;
  if (!key) throw new Error('ABLY_API_KEY is not set');
  if (!g.__mplAblyRest) g.__mplAblyRest = new Ably.Rest({ key });
  return g.__mplAblyRest;
}

export function makeEnvelope<T extends RealtimeEventType>(
  type: T,
  tournamentId: string | null,
  version: number | null,
  serverNow: Date,
  data: EventDataMap[T],
): RealtimeEnvelope<T> {
  return { type, tournamentId, version, serverNow: serverNow.toISOString(), data };
}

/** Publish one envelope to one channel. Never throws. */
export async function publish(channel: string, envelope: RealtimeEnvelope): Promise<void> {
  if (!isRealtimeEnabled()) {
    recorded().push({ channel, envelope });
    if (env().NODE_ENV !== 'test') {
      logger.debug(
        { channel, type: envelope.type, version: envelope.version },
        'realtime disabled: recorded event',
      );
    }
    return;
  }
  try {
    await ablyRest().channels.get(channel).publish(envelope.type, envelope);
  } catch (err) {
    logger.error({ err, channel, type: envelope.type }, 'ably publish failed');
  }
}

/**
 * `t:<id>:auction` event. `version` = the new `auction_state.version`; `serverNow` = Postgres
 * now() read inside the transaction that produced the event.
 */
export function publishAuction<T extends AuctionEventType>(
  tournamentId: string,
  version: number,
  serverNow: Date,
  type: T,
  data: EventDataMap[T],
): Promise<void> {
  return publish(
    auctionChannel(tournamentId),
    makeEnvelope(type, tournamentId, version, serverNow, data),
  );
}

/** `t:<id>:updates` event. `version` = the new `tournaments.roster_version` (bumpRosterVersion). */
export function publishUpdate<T extends UpdateEventType>(
  tournamentId: string,
  version: number,
  serverNow: Date,
  type: T,
  data: EventDataMap[T],
): Promise<void> {
  return publish(
    updatesChannel(tournamentId),
    makeEnvelope(type, tournamentId, version, serverNow, data),
  );
}

/** `u:<userId>` inbox event (no sequence number). */
export function publishInbox<T extends InboxEventType>(
  userId: string,
  tournamentId: string | null,
  serverNow: Date,
  type: T,
  data: EventDataMap[T],
): Promise<void> {
  return publish(userChannel(userId), makeEnvelope(type, tournamentId, null, serverNow, data));
}
