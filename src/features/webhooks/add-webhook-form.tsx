'use client';

import type * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/sonner';
import type { CreateWebhookResult } from '@/server/services/webhooks/types';
import { createWebhookRequest, errorMessage, WebhookApiError } from './api';
import { EventCheckboxes } from './event-checkboxes';
import { KIND_LABELS } from './labels';
import { addWebhookFormSchema, DEFAULT_FORM_EVENTS, type AddWebhookFormValues } from './schemas';

interface AddWebhookFormProps {
  tournamentId: string;
  onCreated: (result: CreateWebhookResult) => void;
}

const PLACEHOLDERS = {
  DISCORD: 'https://discord.com/api/webhooks/…',
  GENERIC: 'https://your-app.example.com/mpl-webhook',
} as const;

/** Add a Discord or generic webhook: kind, URL and the events to send. */
export function AddWebhookForm({
  tournamentId,
  onCreated,
}: AddWebhookFormProps): React.JSX.Element {
  const form = useForm<AddWebhookFormValues>({
    resolver: zodResolver(addWebhookFormSchema),
    defaultValues: { kind: 'DISCORD', url: '', events: DEFAULT_FORM_EVENTS },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await createWebhookRequest(tournamentId, values);
      onCreated(result);
      form.reset({ kind: values.kind, url: '', events: DEFAULT_FORM_EVENTS });
      toast.success(`${KIND_LABELS[values.kind]} webhook added`);
    } catch (err) {
      const urlError = err instanceof WebhookApiError ? err.fieldErrors.url?.[0] : undefined;
      if (urlError) form.setError('url', { message: urlError });
      else toast.error(errorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold tracking-wide">Type</legend>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(v) => field.onChange(v === 'GENERIC' ? 'GENERIC' : 'DISCORD')}
              className="flex flex-wrap gap-4"
            >
              {(['DISCORD', 'GENERIC'] as const).map((k) => (
                <Label key={k} htmlFor={`webhook-kind-${k}`} className="cursor-pointer font-normal">
                  <RadioGroupItem id={`webhook-kind-${k}`} value={k} />
                  {KIND_LABELS[k]}
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <p className="text-xs text-muted">
          {kind === 'DISCORD'
            ? 'In Discord: channel settings → Integrations → Webhooks → Copy webhook URL.'
            : 'Any https endpoint. Each POST is signed with HMAC-SHA256; you get the secret once.'}
        </p>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="webhook-url">URL</Label>
        <Input
          id="webhook-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDERS[kind]}
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={errors.url ? 'webhook-url-error' : undefined}
          {...form.register('url')}
        />
        {errors.url ? (
          <p id="webhook-url-error" role="alert" className="text-xs text-blood">
            {errors.url.message}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold tracking-wide">Events</legend>
        <Controller
          control={form.control}
          name="events"
          render={({ field }) => (
            <EventCheckboxes
              idPrefix="new-webhook"
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(errors.events)}
            />
          )}
        />
        {errors.events ? (
          <p role="alert" className="text-xs text-blood">
            {errors.events.message}
          </p>
        ) : null}
      </fieldset>

      <div>
        <Button type="submit" disabled={isSubmitting}>
          <PlusIcon aria-hidden="true" />
          {isSubmitting ? 'Checking URL…' : 'Add webhook'}
        </Button>
      </div>
    </form>
  );
}
