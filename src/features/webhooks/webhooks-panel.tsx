'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateWebhookResult, WebhookView } from '@/server/services/webhooks/types';
import { AddWebhookForm } from './add-webhook-form';
import { SecretDialog } from './secret-dialog';
import { WebhookCard } from './webhook-card';

interface WebhooksPanelProps {
  tournamentId: string;
  initialWebhooks: WebhookView[];
}

/** Settings → Integrations (PLAN §6.4): the webhook list, the add form and the secret dialog. */
export function WebhooksPanel({
  tournamentId,
  initialWebhooks,
}: WebhooksPanelProps): React.JSX.Element {
  const [webhooks, setWebhooks] = React.useState<WebhookView[]>(initialWebhooks);
  const [secret, setSecret] = React.useState<string | null>(null);

  const onCreated = (result: CreateWebhookResult): void => {
    setWebhooks((list) => [...list, result.webhook]);
    if (result.signingSecret) setSecret(result.signingSecret);
  };

  const onChanged = (updated: WebhookView): void => {
    setWebhooks((list) => list.map((w) => (w.id === updated.id ? updated : w)));
  };

  const onDeleted = (id: string): void => {
    setWebhooks((list) => list.filter((w) => w.id !== id));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Auction events are posted here as they happen. A webhook that fails 20 times in a row is
            switched off and you’re notified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
              No webhooks yet. Add a Discord channel so everyone sees “SOLD” the moment it happens.
            </p>
          ) : (
            <ul className="grid gap-3">
              {webhooks.map((w) => (
                <WebhookCard
                  key={w.id}
                  tournamentId={tournamentId}
                  webhook={w}
                  onChanged={onChanged}
                  onDeleted={onDeleted}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Add webhook</CardTitle>
          <CardDescription>Discord channel or any https endpoint.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddWebhookForm tournamentId={tournamentId} onCreated={onCreated} />
        </CardContent>
      </Card>

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
