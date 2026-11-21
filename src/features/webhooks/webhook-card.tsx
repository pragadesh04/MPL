'use client';

import * as React from 'react';
import { ChevronDownIcon, ListChecksIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusPill } from '@/components/ui/status-pill';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import type { WebhookEvent } from '@/lib/schemas/realtime';
import { cn } from '@/lib/utils';
import type { DeliveryView, WebhookView } from '@/server/services/webhooks/types';
import {
  deleteWebhookRequest,
  errorMessage,
  listDeliveriesRequest,
  redeliverRequest,
  sendTestRequest,
  updateWebhookRequest,
} from './api';
import { DeliveryLog } from './delivery-log';
import { EventCheckboxes } from './event-checkboxes';
import { EVENT_LABELS, KIND_LABELS } from './labels';

interface WebhookCardProps {
  tournamentId: string;
  webhook: WebhookView;
  onChanged: (webhook: WebhookView) => void;
  onDeleted: (webhookId: string) => void;
}

/** Auto-disable threshold (mirrors AUTO_DISABLE_AFTER on the server; display only). */
const AUTO_DISABLE_AFTER = 20;

/** One webhook: masked URL, enabled switch, failures, test send, events, delete and its log. */
export function WebhookCard({
  tournamentId,
  webhook,
  onChanged,
  onDeleted,
}: WebhookCardProps): React.JSX.Element {
  const [busy, setBusy] = React.useState<'toggle' | 'test' | 'delete' | 'events' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [editEvents, setEditEvents] = React.useState<WebhookEvent[] | null>(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [deliveries, setDeliveries] = React.useState<DeliveryView[] | null>(null);
  const [logLoading, setLogLoading] = React.useState(false);
  const [logError, setLogError] = React.useState<string | null>(null);
  const [redeliveringId, setRedeliveringId] = React.useState<number | null>(null);
  const logId = `webhook-log-${webhook.id}`;

  const loadDeliveries = async (): Promise<void> => {
    setLogLoading(true);
    setLogError(null);
    try {
      setDeliveries(await listDeliveriesRequest(tournamentId, webhook.id));
    } catch (err) {
      setLogError(errorMessage(err));
    } finally {
      setLogLoading(false);
    }
  };

  const toggleLog = (): void => {
    const next = !logOpen;
    setLogOpen(next);
    if (next) void loadDeliveries();
  };

  const setEnabled = async (enabled: boolean): Promise<void> => {
    setBusy('toggle');
    try {
      onChanged(await updateWebhookRequest(tournamentId, webhook.id, { enabled }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async (): Promise<void> => {
    setBusy('test');
    try {
      const d = await sendTestRequest(tournamentId, webhook.id);
      if (d.status === 'SUCCEEDED') toast.success('Test event delivered');
      else toast.error(`Test failed: ${d.lastError ?? 'unknown error'}`);
      setDeliveries((list) => (list ? [d, ...list] : list));
      if (d.status === 'SUCCEEDED' && webhook.consecutiveFailures > 0) {
        onChanged({ ...webhook, consecutiveFailures: 0 });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const redeliver = async (deliveryId: number): Promise<void> => {
    setRedeliveringId(deliveryId);
    try {
      const d = await redeliverRequest(tournamentId, webhook.id, deliveryId);
      if (d.status === 'SUCCEEDED') toast.success('Redelivered');
      else toast.error(`Redelivery failed: ${d.lastError ?? 'unknown error'}`);
      setDeliveries((list) => (list ? [d, ...list] : [d]));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRedeliveringId(null);
    }
  };

  const saveEvents = async (): Promise<void> => {
    if (!editEvents || editEvents.length === 0) return;
    setBusy('events');
    try {
      onChanged(await updateWebhookRequest(tournamentId, webhook.id, { events: editEvents }));
      setEditEvents(null);
      toast.success('Events updated');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy('delete');
    try {
      await deleteWebhookRequest(tournamentId, webhook.id);
      setConfirmDelete(false);
      onDeleted(webhook.id);
      toast.success('Webhook deleted');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  const autoDisabled = !webhook.enabled && webhook.consecutiveFailures >= AUTO_DISABLE_AFTER;
  const switchId = `webhook-enabled-${webhook.id}`;

  return (
    <li
      className={cn(
        'grid gap-4 rounded-lg border border-border bg-surface p-4',
        !webhook.enabled && 'opacity-90',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={webhook.kind === 'DISCORD' ? 'info' : 'sand'} caps>
              {KIND_LABELS[webhook.kind]}
            </Badge>
            {webhook.enabled ? (
              <StatusPill tone="lime">Active</StatusPill>
            ) : (
              <StatusPill tone={autoDisabled ? 'blood' : 'neutral'}>
                {autoDisabled ? 'Auto-disabled' : 'Off'}
              </StatusPill>
            )}
            {webhook.consecutiveFailures > 0 ? (
              <StatusPill tone={webhook.consecutiveFailures >= 5 ? 'blood' : 'amber'}>
                {webhook.consecutiveFailures} failed in a row
              </StatusPill>
            ) : null}
          </div>
          <code className="truncate font-numeric text-sm text-foreground" title={webhook.maskedUrl}>
            {webhook.maskedUrl}
          </code>
          <p className="text-xs text-muted">
            {webhook.events.map((e) => EVENT_LABELS[e].label).join(' · ') || 'No events'}
          </p>
          {autoDisabled ? (
            <p className="text-xs text-blood">
              Turned off after {AUTO_DISABLE_AFTER} failed deliveries in a row. Fix the receiver,
              send a test, then switch it back on.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={switchId}
            className="text-xs font-semibold tracking-wide text-muted uppercase"
          >
            {webhook.enabled ? 'On' : 'Off'}
          </label>
          <Switch
            id={switchId}
            checked={webhook.enabled}
            onCheckedChange={(v) => void setEnabled(v)}
            disabled={busy !== null}
            aria-label={webhook.enabled ? 'Disable webhook' : 'Enable webhook'}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void sendTest()}
          disabled={busy !== null}
        >
          <SendIcon aria-hidden="true" />
          {busy === 'test' ? 'Sending…' : 'Send test'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditEvents(webhook.events)}
          disabled={busy !== null}
        >
          <ListChecksIcon aria-hidden="true" />
          Events
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={toggleLog}
          aria-expanded={logOpen}
          aria-controls={logId}
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('transition-transform', logOpen && 'rotate-180')}
          />
          Delivery log
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto text-blood hover:text-blood"
          onClick={() => setConfirmDelete(true)}
          disabled={busy !== null}
        >
          <Trash2Icon aria-hidden="true" />
          Delete
        </Button>
      </div>

      {logOpen ? (
        <div id={logId}>
          <DeliveryLog
            deliveries={deliveries}
            loading={logLoading}
            error={logError}
            redeliveringId={redeliveringId}
            onRefresh={() => void loadDeliveries()}
            onRedeliver={(id) => void redeliver(id)}
          />
        </div>
      ) : null}

      <Dialog open={editEvents !== null} onOpenChange={(open) => !open && setEditEvents(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Events</DialogTitle>
            <DialogDescription>Choose what this webhook receives.</DialogDescription>
          </DialogHeader>
          {editEvents ? (
            <EventCheckboxes
              idPrefix={`edit-${webhook.id}`}
              value={editEvents}
              onChange={setEditEvents}
              disabled={busy === 'events'}
              invalid={editEvents.length === 0}
            />
          ) : null}
          {editEvents && editEvents.length === 0 ? (
            <p role="alert" className="text-xs text-blood">
              Pick at least one event
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditEvents(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEvents()}
              disabled={busy === 'events' || !editEvents || editEvents.length === 0}
            >
              {busy === 'events' ? 'Saving…' : 'Save events'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete webhook?</DialogTitle>
            <DialogDescription>
              {webhook.maskedUrl} stops receiving events and its delivery log is removed. This can’t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void remove()}
              disabled={busy === 'delete'}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
