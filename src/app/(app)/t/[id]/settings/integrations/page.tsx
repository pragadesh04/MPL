import { notFound } from 'next/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WebhooksPanel } from '@/features/webhooks/webhooks-panel';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { listWebhooks } from '@/server/services/webhooks/service';
import type { WebhookView } from '@/server/services/webhooks/types';

export const metadata = { title: 'Integrations' };

/**
 * Settings → Integrations (PLAN §6.4): outgoing Discord / generic webhooks. Owner and co-admins
 * only; anyone without a role in this tournament gets the generic 404.
 */
export default async function IntegrationsPage({
  params,
}: PageProps<'/t/[id]/settings/integrations'>) {
  const { id } = await params;
  let webhooks: WebhookView[];
  try {
    webhooks = await listWebhooks(await getSessionUserId(), id);
  } catch (err) {
    if (isAppError(err) && err.status === 404) notFound();
    if (isAppError(err) && err.status === 403) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Only the owner and co-admins can manage integrations.</CardDescription>
          </CardHeader>
        </Card>
      );
    }
    throw err;
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-xs font-semibold tracking-widest text-lime uppercase">Settings</p>
        <h1 className="font-display text-3xl tracking-wide uppercase">Integrations</h1>
        <p className="text-sm text-muted">
          Share live auction events with Discord or your own app. Webhook URLs and secrets are
          encrypted at rest.
        </p>
      </header>
      <WebhooksPanel tournamentId={id} initialWebhooks={webhooks} />
    </div>
  );
}
