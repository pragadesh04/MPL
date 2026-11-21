import { z } from 'zod';
import { webhookKindSchema } from '@/lib/schemas/enums';
import { webhookEventSchema, WEBHOOK_EVENTS } from '@/lib/schemas/realtime';

/** Request bodies for the webhook routes (validated again inside the service). */

const eventsSchema = z
  .array(webhookEventSchema)
  .min(1, 'Pick at least one event')
  .max(WEBHOOK_EVENTS.length)
  .transform((events) => WEBHOOK_EVENTS.filter((e) => events.includes(e)));

const urlSchema = z.string().trim().min(1, 'Paste the webhook URL').max(2048);

export const createWebhookBodySchema = z.object({
  kind: webhookKindSchema,
  url: urlSchema,
  events: eventsSchema.optional(),
});
export type CreateWebhookBody = z.input<typeof createWebhookBodySchema>;

export const updateWebhookBodySchema = z
  .object({
    events: eventsSchema.optional(),
    enabled: z.boolean().optional(),
    url: urlSchema.optional(),
  })
  .refine((b) => b.events !== undefined || b.enabled !== undefined || b.url !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateWebhookBody = z.input<typeof updateWebhookBodySchema>;
