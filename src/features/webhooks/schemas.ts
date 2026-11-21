import { z } from 'zod';
import { webhookDeliveryStatusSchema, webhookKindSchema } from '@/lib/schemas/enums';
import {
  DEFAULT_WEBHOOK_EVENTS,
  webhookEventSchema,
  type WebhookEvent,
} from '@/lib/schemas/realtime';
import type {
  CreateWebhookResult,
  DeliveryView,
  WebhookView,
} from '@/server/services/webhooks/types';

/**
 * Client-side contracts for the webhook routes: response parsing (no casts on responses) and
 * the add-webhook form. The server re-validates everything.
 */

export const webhookViewSchema = z.object({
  id: z.string(),
  kind: webhookKindSchema,
  maskedUrl: z.string(),
  events: z.array(webhookEventSchema),
  enabled: z.boolean(),
  consecutiveFailures: z.number().int(),
  createdAt: z.string(),
});

export const createWebhookResultSchema = z.object({
  webhook: webhookViewSchema,
  signingSecret: z.string().nullable(),
});

export const deliveryViewSchema = z.object({
  id: z.number().int(),
  event: z.string(),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export const deliveryListSchema = z.array(deliveryViewSchema);

// Compile-time check that these schemas match the server's view types exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _contractsMatch: [
  Same<z.infer<typeof webhookViewSchema>, WebhookView>,
  Same<z.infer<typeof createWebhookResultSchema>, CreateWebhookResult>,
  Same<z.infer<typeof deliveryViewSchema>, DeliveryView>,
] = [true, true, true];
void _contractsMatch;

export const addWebhookFormSchema = z
  .object({
    kind: webhookKindSchema,
    url: z
      .string()
      .trim()
      .min(1, 'Paste the webhook URL')
      .max(2048)
      .refine((u) => u.startsWith('https://'), 'The URL must start with https://'),
    events: z.array(webhookEventSchema).min(1, 'Pick at least one event'),
  })
  .refine(
    (v) =>
      v.kind !== 'DISCORD' ||
      /^https:\/\/(ptb\.|canary\.)?(discord|discordapp)\.com\/api\/(v\d+\/)?webhooks\//.test(v.url),
    {
      path: ['url'],
      message: 'Paste a Discord channel webhook URL (https://discord.com/api/webhooks/…)',
    },
  );
export type AddWebhookFormValues = z.infer<typeof addWebhookFormSchema>;

export const DEFAULT_FORM_EVENTS: WebhookEvent[] = [...DEFAULT_WEBHOOK_EVENTS];
