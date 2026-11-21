/**
 * Webhook view types: what the service returns and the routes send as JSON. Types only (no
 * runtime code, no `server-only`), so client components may `import type` them; the client
 * re-validates responses with the matching Zod schemas in src/features/webhooks/schemas.ts.
 */
import type { WebhookDeliveryStatus, WebhookKind } from '@/lib/schemas/enums';
import type { WebhookEvent } from '@/lib/schemas/realtime';

/** JSON body POSTed to GENERIC webhooks and stored in `webhook_deliveries.payload`. */
export interface WebhookPayload {
  /** Event id: the same for every webhook and every redelivery of this event (dedupe key). */
  id: string;
  event: WebhookEvent;
  tournamentId: string;
  tournamentName: string;
  /** ISO timestamp of when the event was queued. */
  createdAt: string;
  data: Record<string, unknown>;
}

/** A webhook as listed to organisers: never the full URL or the signing secret. */
export interface WebhookView {
  id: string;
  kind: WebhookKind;
  /** Host plus the last 4 characters, e.g. `discord.com/…Xy9Z`. */
  maskedUrl: string;
  events: WebhookEvent[];
  enabled: boolean;
  consecutiveFailures: number;
  createdAt: string;
}

export interface CreateWebhookResult {
  webhook: WebhookView;
  /** GENERIC only: the signing secret, returned once and never again. */
  signingSecret: string | null;
}

export interface DeliveryView {
  id: number;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
}
