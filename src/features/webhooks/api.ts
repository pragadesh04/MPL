import type { z } from 'zod';
import { apiErrorSchema } from '@/lib/schemas/api';
import type { WebhookEvent } from '@/lib/schemas/realtime';
import type { WebhookKind } from '@/lib/schemas/enums';
import {
  createWebhookResultSchema,
  deliveryListSchema,
  deliveryViewSchema,
  webhookViewSchema,
} from './schemas';
import type {
  CreateWebhookResult,
  DeliveryView,
  WebhookView,
} from '@/server/services/webhooks/types';

/** Browser calls to the webhook Route Handlers. Errors carry the server's message. */

export class WebhookApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'WebhookApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function fieldErrorsOf(details: Record<string, unknown> | undefined): Record<string, string[]> {
  const issues = details?.issues;
  if (!issues || typeof issues !== 'object' || Array.isArray(issues)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(issues)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
    });
  } catch {
    throw new WebhookApiError(0, 'Network error. Check your connection and try again.');
  }
  if (res.ok) return res;
  let message = `Request failed (${res.status})`;
  let fieldErrors: Record<string, string[]> = {};
  try {
    const parsed = apiErrorSchema.safeParse(await res.json());
    if (parsed.success) {
      message = parsed.data.error.message;
      fieldErrors = fieldErrorsOf(parsed.data.error.details);
    }
  } catch {
    // non-JSON error body: keep the generic message
  }
  throw new WebhookApiError(res.status, message, fieldErrors);
}

async function requestJson<S extends z.ZodType>(
  schema: S,
  url: string,
  init?: RequestInit,
): Promise<z.infer<S>> {
  const res = await request(url, init);
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new WebhookApiError(res.status, 'Unexpected response from the server');
  return parsed.data;
}

const base = (tournamentId: string): string =>
  `/api/tournaments/${encodeURIComponent(tournamentId)}/webhooks`;
const one = (tournamentId: string, webhookId: string): string =>
  `${base(tournamentId)}/${encodeURIComponent(webhookId)}`;

export function createWebhookRequest(
  tournamentId: string,
  body: { kind: WebhookKind; url: string; events: WebhookEvent[] },
): Promise<CreateWebhookResult> {
  return requestJson(createWebhookResultSchema, base(tournamentId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateWebhookRequest(
  tournamentId: string,
  webhookId: string,
  body: { events?: WebhookEvent[]; enabled?: boolean; url?: string },
): Promise<WebhookView> {
  return requestJson(webhookViewSchema, one(tournamentId, webhookId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteWebhookRequest(tournamentId: string, webhookId: string): Promise<void> {
  await request(one(tournamentId, webhookId), { method: 'DELETE' });
}

export function sendTestRequest(tournamentId: string, webhookId: string): Promise<DeliveryView> {
  return requestJson(deliveryViewSchema, `${one(tournamentId, webhookId)}/test`, {
    method: 'POST',
  });
}

export function listDeliveriesRequest(
  tournamentId: string,
  webhookId: string,
): Promise<DeliveryView[]> {
  return requestJson(deliveryListSchema, `${one(tournamentId, webhookId)}/deliveries?limit=50`);
}

export function redeliverRequest(
  tournamentId: string,
  webhookId: string,
  deliveryId: number,
): Promise<DeliveryView> {
  return requestJson(
    deliveryViewSchema,
    `${one(tournamentId, webhookId)}/deliveries/${deliveryId}/redeliver`,
    { method: 'POST' },
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
