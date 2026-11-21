import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { decrypt } from '../../auth/crypto';
import { getDb, withTransaction } from '../../db/client';
import {
  memberships,
  notifications,
  tournaments,
  webhookDeliveries,
  webhooks,
  type Webhook,
  type WebhookDelivery,
} from '../../db/schema';
import { env } from '../../env';
import { logger } from '../../logger';
import { publishInbox } from '../../realtime/publisher';
import { writeAudit } from '../audit';
import { getWebhookDeps } from './deps';
import type { OutgoingEvent } from './dispatch';
import { formatDiscordMessage } from './discord';
import { signedHeaders } from './signing';
import { assertSafeWebhookUrl, maskWebhookUrl, UnsafeWebhookUrlError } from './ssrf';
import type { WebhookPayload } from './types';

/**
 * Outgoing webhook delivery (PLAN §6.4).
 *
 *   producer tx → onCommit → queueWebhookEvents (dispatch.ts)
 *     → scheduleWebhookDelivery: next/server `after()` (or a detached promise outside a request)
 *       → deliverEvents: one webhook_deliveries row per (enabled, subscribed webhook × event)
 *         → attemptDelivery: SSRF re-check, POST (5 s timeout), up to 3 attempts with backoff
 *
 * Nothing here ever throws to the caller: a slow or broken webhook can't delay or fail a bid
 * (§9 item 27). Deliveries for one webhook run in order; different webhooks run in parallel.
 */

/** Disable a webhook after this many automatic deliveries in a row have failed. */
export const AUTO_DISABLE_AFTER = 20;
const MAX_ERROR_LENGTH = 500;

export type DeliveryTarget = Pick<
  Webhook,
  'id' | 'tournamentId' | 'kind' | 'urlEncrypted' | 'signingSecretEncrypted'
>;

export interface AttemptOptions {
  /** Defaults to the number of configured retry delays (3). */
  maxAttempts?: number;
  /**
   * Whether a final failure counts towards auto-disable. Automatic deliveries do; manual test
   * sends and redeliveries don't (an organiser probing a broken endpoint shouldn't disable it).
   * A success always resets the counter.
   */
  countFailures: boolean;
}

function encryptionKey(): string {
  return env().APP_ENCRYPTION_KEY;
}

function errorText(err: unknown): string {
  if (err instanceof UnsafeWebhookUrlError) return `Blocked: ${err.message}`;
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Timed out';
    return err.message || err.name;
  }
  return String(err);
}

/** 5xx, 408 and 429 are worth retrying; other statuses won't change on a retry. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

interface BuiltRequest {
  headers: Record<string, string>;
  body: string;
}

function buildRequest(
  target: DeliveryTarget,
  secret: string | null,
  deliveryId: number,
  payload: WebhookPayload,
): BuiltRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'MPL-Webhooks/1.0',
  };
  if (target.kind === 'DISCORD') {
    const body = JSON.stringify(formatDiscordMessage(payload, { appUrl: env().PUBLIC_APP_URL }));
    return { headers, body };
  }
  const body = JSON.stringify(payload);
  if (secret) {
    Object.assign(
      headers,
      signedHeaders({
        secret,
        event: payload.event,
        deliveryId,
        timestamp: Math.floor(Date.now() / 1000),
        body,
      }),
    );
  }
  return { headers, body };
}

function isPayload(
  value: Record<string, unknown>,
): value is Record<string, unknown> & WebhookPayload {
  return (
    typeof value.id === 'string' &&
    typeof value.event === 'string' &&
    typeof value.tournamentId === 'string' &&
    typeof value.tournamentName === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.data === 'object' &&
    value.data !== null
  );
}

/**
 * Send one stored delivery, retrying with backoff, and record every attempt on its row. Returns
 * the final status. Never throws.
 */
export async function attemptDelivery(
  target: DeliveryTarget,
  delivery: Pick<WebhookDelivery, 'id' | 'payload'>,
  opts: AttemptOptions,
): Promise<'SUCCEEDED' | 'FAILED'> {
  const deps = getWebhookDeps();
  const db = getDb();
  const maxAttempts = Math.max(1, opts.maxAttempts ?? deps.retryDelaysMs.length);

  const finish = async (
    status: 'SUCCEEDED' | 'FAILED',
    attempts: number,
    lastError: string | null,
  ): Promise<'SUCCEEDED' | 'FAILED'> => {
    try {
      await db
        .update(webhookDeliveries)
        .set({ status, attempts, lastError: lastError?.slice(0, MAX_ERROR_LENGTH) ?? null })
        .where(eq(webhookDeliveries.id, delivery.id));
      if (status === 'SUCCEEDED') {
        await db.update(webhooks).set({ consecutiveFailures: 0 }).where(eq(webhooks.id, target.id));
      } else if (opts.countFailures) {
        await recordFailure(target);
      }
    } catch (err) {
      logger.error({ err, deliveryId: delivery.id }, 'webhook delivery: bookkeeping failed');
    }
    return status;
  };

  try {
    const url = decrypt(target.urlEncrypted, encryptionKey());
    const secret = target.signingSecretEncrypted
      ? decrypt(target.signingSecretEncrypted, encryptionKey())
      : null;
    if (url === null || (target.kind === 'GENERIC' && secret === null)) {
      return await finish('FAILED', 0, 'Couldn’t decrypt the webhook (encryption key changed?)');
    }
    if (!isPayload(delivery.payload)) {
      return await finish('FAILED', 0, 'Stored payload is malformed');
    }
    const payload = delivery.payload;

    let lastError: string | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await deps.sleep(deps.retryDelaysMs[attempt - 1] ?? deps.retryDelaysMs.at(-1) ?? 0);
      let retryable = true;
      try {
        await assertSafeWebhookUrl(url, target.kind, deps.lookup);
        const { headers, body } = buildRequest(target, secret, delivery.id, payload);
        const res = await deps.fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(deps.timeoutMs),
          redirect: 'manual',
        });
        if (res.status >= 200 && res.status < 300) return await finish('SUCCEEDED', attempt, null);
        lastError = `HTTP ${res.status}`;
        retryable = isRetryableStatus(res.status);
      } catch (err) {
        lastError = errorText(err);
        retryable = !(err instanceof UnsafeWebhookUrlError);
      }
      if (!retryable || attempt === maxAttempts) return await finish('FAILED', attempt, lastError);
      await db
        .update(webhookDeliveries)
        .set({ attempts: attempt, lastError: lastError.slice(0, MAX_ERROR_LENGTH) })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
    return await finish('FAILED', maxAttempts, lastError);
  } catch (err) {
    logger.error({ err, deliveryId: delivery.id }, 'webhook delivery failed unexpectedly');
    return finish('FAILED', 0, errorText(err));
  }
}

/**
 * Count a failed automatic delivery; at AUTO_DISABLE_AFTER in a row, disable the webhook, log it
 * and tell the tournament's owner and co-admins (notification + inbox event).
 */
async function recordFailure(target: DeliveryTarget): Promise<void> {
  await withTransaction(async (tx, onCommit) => {
    const [row] = await tx
      .update(webhooks)
      .set({ consecutiveFailures: sql`${webhooks.consecutiveFailures} + 1` })
      .where(eq(webhooks.id, target.id))
      .returning({ failures: webhooks.consecutiveFailures, urlEncrypted: webhooks.urlEncrypted });
    if (!row || row.failures < AUTO_DISABLE_AFTER) return;

    // Only the transaction that flips `enabled` logs and notifies (no duplicates under races).
    const [flipped] = await tx
      .update(webhooks)
      .set({ enabled: false })
      .where(and(eq(webhooks.id, target.id), eq(webhooks.enabled, true)))
      .returning({ id: webhooks.id });
    if (!flipped) return;

    const url = decrypt(row.urlEncrypted, encryptionKey());
    const maskedUrl = url ? maskWebhookUrl(url) : null;
    await writeAudit(tx, {
      tournamentId: target.tournamentId,
      actorUserId: null,
      action: 'webhook.auto_disabled',
      before: { webhookId: target.id, enabled: true },
      after: {
        webhookId: target.id,
        kind: target.kind,
        maskedUrl,
        enabled: false,
        consecutiveFailures: row.failures,
      },
      reason: `Disabled automatically after ${row.failures} failed deliveries in a row`,
    });

    const organisers = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.tournamentId, target.tournamentId),
          inArray(memberships.role, ['OWNER', 'CO_ADMIN']),
        ),
      );
    if (organisers.length === 0) return;
    const created = await tx
      .insert(notifications)
      .values(
        organisers.map((o) => ({
          userId: o.userId,
          type: 'webhook.auto_disabled',
          data: {
            tournamentId: target.tournamentId,
            webhookId: target.id,
            kind: target.kind,
            maskedUrl,
            consecutiveFailures: row.failures,
          },
        })),
      )
      .returning({
        id: notifications.id,
        userId: notifications.userId,
        at: notifications.createdAt,
      });
    onCommit(async () => {
      for (const n of created) {
        await publishInbox(n.userId, target.tournamentId, n.at, 'notification.new', {
          notificationId: n.id,
          type: 'webhook.auto_disabled',
        });
      }
    });
  });
}

/**
 * Fan committed events out to the tournament's enabled, subscribed webhooks. Inserts one PENDING
 * delivery row per (webhook × event), then sends them. Never throws.
 */
export async function deliverEvents(tournamentId: string, events: OutgoingEvent[]): Promise<void> {
  try {
    if (events.length === 0) return;
    const db = getDb();
    const hooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.tournamentId, tournamentId), eq(webhooks.enabled, true)));
    const subscribed = hooks.filter((h) => events.some((e) => h.events.includes(e.event)));
    if (subscribed.length === 0) return;

    const [tour] = await db
      .select({ name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
    if (!tour) return;

    const createdAt = new Date().toISOString();
    const payloads: WebhookPayload[] = events.map((e) => ({
      id: randomUUID(),
      event: e.event,
      tournamentId,
      tournamentName: tour.name,
      createdAt,
      data: e.data,
    }));

    const values = subscribed.flatMap((h) =>
      payloads
        .filter((p) => h.events.includes(p.event))
        .map((p) => ({
          webhookId: h.id,
          event: p.event,
          payload: { ...p },
          status: 'PENDING' as const,
        })),
    );
    const rows = await db.insert(webhookDeliveries).values(values).returning({
      id: webhookDeliveries.id,
      webhookId: webhookDeliveries.webhookId,
      payload: webhookDeliveries.payload,
    });

    await Promise.allSettled(
      subscribed.map(async (hook) => {
        // Keep this webhook's events in the order they happened (ids are ascending).
        const mine = rows.filter((r) => r.webhookId === hook.id).sort((a, b) => a.id - b.id);
        for (const row of mine) await attemptDelivery(hook, row, { countFailures: true });
      }),
    );
  } catch (err) {
    logger.error({ err, tournamentId }, 'deliverEvents failed');
  }
}

/**
 * Run `deliverEvents` after the response is sent (`after()`), or as a detached promise when
 * there's no request scope (scripts, tests). Returns the promise only in the detached case.
 */
export function scheduleWebhookDelivery(
  tournamentId: string,
  events: OutgoingEvent[],
): Promise<void> | undefined {
  const task = (): Promise<void> => deliverEvents(tournamentId, events);
  try {
    after(task);
    return undefined;
  } catch {
    return task();
  }
}

/**
 * Manual send (test event / redeliver): store a new delivery row for `payload` and make a single
 * attempt now. Returns the finished row.
 */
export async function sendNow(
  target: DeliveryTarget,
  payload: WebhookPayload,
): Promise<WebhookDelivery> {
  const db = getDb();
  const [row] = await db
    .insert(webhookDeliveries)
    .values({ webhookId: target.id, event: payload.event, payload: { ...payload } })
    .returning();
  await attemptDelivery(target, row!, { maxAttempts: 1, countFailures: false });
  const [done] = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, row!.id))
    .limit(1);
  return done ?? row!;
}
