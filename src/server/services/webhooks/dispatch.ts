import 'server-only';
import type { WebhookEvent } from '@/lib/schemas/realtime';
import { logger } from '../../logger';

/**
 * Seam between the services that produce events (auction, allocation) and outgoing webhook
 * delivery (PLAN §6.4). Producers collect `OutgoingEvent`s inside their transaction and call
 * `queueWebhookEvents` from `onCommit`, so nothing is sent for a rolled-back write and a slow or
 * failing webhook can never delay or fail a bid (§9 items 24, 27).
 *
 * `data` carries display-ready fields (names, colours, prices) captured inside the transaction,
 * so the Discord formatter never has to query again.
 */
export interface OutgoingEvent {
  event: WebhookEvent;
  data: Record<string, unknown>;
}

export type WebhookSink = (tournamentId: string, events: OutgoingEvent[]) => void;

const g = globalThis as typeof globalThis & {
  __mplWebhookSink?: WebhookSink;
  __mplQueuedWebhooks?: { tournamentId: string; events: OutgoingEvent[] }[];
};

/** Events queued so far (tests). */
export function getQueuedWebhookEvents(): readonly {
  tournamentId: string;
  events: OutgoingEvent[];
}[] {
  return (g.__mplQueuedWebhooks ??= []);
}

export function clearQueuedWebhookEvents(): void {
  (g.__mplQueuedWebhooks ??= []).length = 0;
}

/** The delivery module registers itself here (see ./deliver.ts). Tests may swap it. */
export function setWebhookSink(sink: WebhookSink | null): void {
  g.__mplWebhookSink = sink ?? undefined;
}

/** Hand committed events to webhook delivery. Never throws. Call from `onCommit` only. */
export function queueWebhookEvents(tournamentId: string, events: OutgoingEvent[]): void {
  if (events.length === 0) return;
  // Recorded only in tests, so a long-running server doesn't keep every event in memory.
  if (process.env.NODE_ENV === 'test')
    (g.__mplQueuedWebhooks ??= []).push({ tournamentId, events });
  try {
    g.__mplWebhookSink?.(tournamentId, events);
  } catch (err) {
    logger.error({ err, tournamentId }, 'queueWebhookEvents: sink failed');
  }
}
