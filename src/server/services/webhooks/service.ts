import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  DEFAULT_WEBHOOK_EVENTS,
  webhookEventSchema,
  type WebhookEvent,
} from '@/lib/schemas/realtime';
import { decrypt, encrypt } from '../../auth/crypto';
import { getDb, withTransaction, type Db } from '../../db/client';
import {
  tournaments,
  webhookDeliveries,
  webhooks,
  type Webhook,
  type WebhookDelivery,
} from '../../db/schema';
import { env } from '../../env';
import { AppError, notFound } from '../../errors';
import { writeAudit } from '../audit';
import { requireRole } from '../roles';
import { sendNow } from './deliver';
import { getWebhookDeps } from './deps';
import {
  createWebhookBodySchema,
  updateWebhookBodySchema,
  type CreateWebhookBody,
  type UpdateWebhookBody,
} from './schemas';
import { generateSigningSecret } from './signing';
import { assertSafeWebhookUrl, maskWebhookUrl, UnsafeWebhookUrlError } from './ssrf';
import type { CreateWebhookResult, DeliveryView, WebhookPayload, WebhookView } from './types';

/**
 * Webhook management per tournament (PLAN §6.4). Every function checks
 * `requireRole(…, 'webhooks:manage')` (owner / co-admin; 404 for no role, 403 for the wrong
 * one) and scopes every query by `tournament_id`, so an organiser of tournament A can never see
 * or touch tournament B's webhooks (404).
 *
 * URLs and signing secrets are encrypted at rest with APP_ENCRYPTION_KEY. Lists show only a
 * masked URL; a GENERIC webhook's secret is returned once, by `createWebhook`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_DELIVERY_LIMIT = 50;

function key(): string {
  return env().APP_ENCRYPTION_KEY;
}

function urlError(err: UnsafeWebhookUrlError): AppError {
  return new AppError('VALIDATION_FAILED', err.message, { issues: { url: [err.message] } });
}

/** Structure + DNS check (outside any transaction: it's a network call). */
async function vetUrl(url: string, kind: Webhook['kind']): Promise<string> {
  try {
    const { url: parsed } = await assertSafeWebhookUrl(url, kind, getWebhookDeps().lookup);
    return parsed.toString();
  } catch (err) {
    if (err instanceof UnsafeWebhookUrlError) throw urlError(err);
    throw err;
  }
}

function knownEvents(events: string[]): WebhookEvent[] {
  return events.flatMap((e) => {
    const parsed = webhookEventSchema.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

function masked(row: Pick<Webhook, 'urlEncrypted'>): string {
  const url = decrypt(row.urlEncrypted, key());
  return url === null ? 'unreadable (encryption key changed)' : maskWebhookUrl(url);
}

function toView(row: Webhook): WebhookView {
  return {
    id: row.id,
    kind: row.kind,
    maskedUrl: masked(row),
    events: knownEvents(row.events),
    enabled: row.enabled,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDeliveryView(row: WebhookDelivery): DeliveryView {
  return {
    id: row.id,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    payload: row.payload,
  };
}

/** Audit snapshot: never the URL or the secret. */
function auditShape(row: Webhook): Record<string, unknown> {
  return {
    webhookId: row.id,
    kind: row.kind,
    maskedUrl: masked(row),
    events: row.events,
    enabled: row.enabled,
  };
}

/** The webhook, scoped to its tournament; 404 for a malformed id or another tournament's. */
async function loadWebhook(db: Db, tournamentId: string, webhookId: string): Promise<Webhook> {
  if (!UUID_RE.test(webhookId)) throw notFound();
  const [row] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.tournamentId, tournamentId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export async function listWebhooks(
  userId: string | null,
  tournamentId: string,
): Promise<WebhookView[]> {
  await requireRole(userId, tournamentId, 'webhooks:manage');
  const rows = await getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.tournamentId, tournamentId))
    .orderBy(asc(webhooks.createdAt), asc(webhooks.id));
  return rows.map(toView);
}

export async function createWebhook(
  userId: string | null,
  tournamentId: string,
  body: CreateWebhookBody,
): Promise<CreateWebhookResult> {
  const access = await requireRole(userId, tournamentId, 'webhooks:manage');
  const input = createWebhookBodySchema.parse(body);
  const url = await vetUrl(input.url, input.kind);
  const secret = input.kind === 'GENERIC' ? generateSigningSecret() : null;

  const row = await withTransaction(async (tx) => {
    const [created] = await tx
      .insert(webhooks)
      .values({
        tournamentId,
        kind: input.kind,
        urlEncrypted: encrypt(url, key()),
        signingSecretEncrypted: secret ? encrypt(secret, key()) : null,
        events: input.events ?? [...DEFAULT_WEBHOOK_EVENTS],
        createdBy: access.userId,
      })
      .returning();
    await writeAudit(tx, {
      tournamentId,
      actorUserId: access.userId,
      action: 'webhook.created',
      after: auditShape(created!),
    });
    return created!;
  });
  return { webhook: toView(row), signingSecret: secret };
}

export async function updateWebhook(
  userId: string | null,
  tournamentId: string,
  webhookId: string,
  body: UpdateWebhookBody,
): Promise<WebhookView> {
  const access = await requireRole(userId, tournamentId, 'webhooks:manage');
  const input = updateWebhookBodySchema.parse(body);
  const current = await loadWebhook(getDb(), tournamentId, webhookId);
  const url = input.url !== undefined ? await vetUrl(input.url, current.kind) : undefined;

  return withTransaction(async (tx) => {
    const before = await loadWebhook(tx, tournamentId, webhookId);
    const reEnabled = input.enabled === true && !before.enabled;
    const [updated] = await tx
      .update(webhooks)
      .set({
        ...(input.events !== undefined ? { events: input.events } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(url !== undefined ? { urlEncrypted: encrypt(url, key()) } : {}),
        // A fresh start after the organiser fixes and re-enables a webhook.
        ...(reEnabled || url !== undefined ? { consecutiveFailures: 0 } : {}),
      })
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.tournamentId, tournamentId)))
      .returning();
    if (!updated) throw notFound();
    await writeAudit(tx, {
      tournamentId,
      actorUserId: access.userId,
      action: 'webhook.updated',
      before: auditShape(before),
      after: { ...auditShape(updated), urlChanged: url !== undefined },
    });
    return toView(updated);
  });
}

export async function deleteWebhook(
  userId: string | null,
  tournamentId: string,
  webhookId: string,
): Promise<void> {
  const access = await requireRole(userId, tournamentId, 'webhooks:manage');
  if (!UUID_RE.test(webhookId)) throw notFound();
  await withTransaction(async (tx) => {
    const [deleted] = await tx
      .delete(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.tournamentId, tournamentId)))
      .returning();
    if (!deleted) throw notFound();
    await writeAudit(tx, {
      tournamentId,
      actorUserId: access.userId,
      action: 'webhook.deleted',
      before: auditShape(deleted),
    });
  });
}

/** Most recent deliveries for one webhook, newest first. */
export async function listWebhookDeliveries(
  userId: string | null,
  tournamentId: string,
  webhookId: string,
  limit: number = DEFAULT_DELIVERY_LIMIT,
): Promise<DeliveryView[]> {
  await requireRole(userId, tournamentId, 'webhooks:manage');
  const db = getDb();
  await loadWebhook(db, tournamentId, webhookId);
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(Math.min(Math.max(1, Math.trunc(limit)), 200));
  return rows.map(toDeliveryView);
}

/**
 * Resend a stored delivery's payload as a new delivery (new `X-MPL-Delivery` id, same event `id`
 * in the body so receivers can dedupe). One attempt, made now; works on disabled webhooks too.
 */
export async function redeliverWebhookDelivery(
  userId: string | null,
  tournamentId: string,
  webhookId: string,
  deliveryId: string | number,
): Promise<DeliveryView> {
  await requireRole(userId, tournamentId, 'webhooks:manage');
  const db = getDb();
  const hook = await loadWebhook(db, tournamentId, webhookId);
  const id = typeof deliveryId === 'number' ? deliveryId : Number(deliveryId);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  const [original] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.webhookId, hook.id)))
    .limit(1);
  if (!original) throw notFound();
  const payload = parseStoredPayload(original.payload);
  if (!payload) throw new AppError('CONFLICT', 'This delivery’s payload can’t be resent');
  return toDeliveryView(await sendNow(hook, payload));
}

/** Send a sample `lot.sold` event now (one attempt), so organisers can check the wiring. */
export async function sendTestWebhook(
  userId: string | null,
  tournamentId: string,
  webhookId: string,
): Promise<DeliveryView> {
  await requireRole(userId, tournamentId, 'webhooks:manage');
  const db = getDb();
  const hook = await loadWebhook(db, tournamentId, webhookId);
  const [tour] = await db
    .select({ name: tournaments.name })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  if (!tour) throw notFound();
  return toDeliveryView(await sendNow(hook, samplePayload(tournamentId, tour.name)));
}

export function samplePayload(tournamentId: string, tournamentName: string): WebhookPayload {
  return {
    id: randomUUID(),
    event: 'lot.sold',
    tournamentId,
    tournamentName,
    createdAt: new Date().toISOString(),
    data: {
      test: true,
      playerId: '00000000-0000-4000-8000-000000000001',
      playerName: 'Ravi',
      playerIgn: 'RaviOP',
      photoUrl: null,
      teamId: '00000000-0000-4000-8000-000000000002',
      teamName: 'Red Rhinos',
      teamShortName: 'RR',
      teamColor: '#d64545',
      price: 12,
      purseRemaining: 38,
      closedBy: 'TIMER',
    },
  };
}

function parseStoredPayload(raw: Record<string, unknown>): WebhookPayload | null {
  const event = webhookEventSchema.safeParse(raw.event);
  const { id, tournamentId, tournamentName, createdAt, data } = raw;
  if (
    !event.success ||
    typeof id !== 'string' ||
    typeof tournamentId !== 'string' ||
    typeof tournamentName !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof data !== 'object' ||
    data === null ||
    Array.isArray(data)
  ) {
    return null;
  }
  return {
    id,
    event: event.data,
    tournamentId,
    tournamentName,
    createdAt,
    data: Object.fromEntries(Object.entries(data)),
  };
}
