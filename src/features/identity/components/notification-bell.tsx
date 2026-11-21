'use client';

import { Bell } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { userChannel } from '@/lib/realtime/channels';
import { useChannel } from '@/lib/realtime/provider';
import { api } from '../lib/api';

interface Item {
  id: number;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** One line of human text per notification type. */
export function notificationText(item: Pick<Item, 'type' | 'data'>): string {
  const d = item.data;
  const role = d.kind === 'LEADER' || d.role === 'LEADER' ? 'captain' : 'soldier';
  switch (item.type) {
    case 'request.received':
      return `${str(d.organiserName)} invited you to ${str(d.tournamentName)} as ${role}`;
    case 'request.accepted':
      return `${str(d.playerName)} accepted your invite to ${str(d.tournamentName)}`;
    case 'request.declined':
      return `${str(d.playerName)} declined your invite to ${str(d.tournamentName)}`;
    case 'approval.approved':
      return `You're approved as ${role} in ${str(d.tournamentName)}`;
    case 'approval.rejected':
      return `Your sign-up for ${str(d.tournamentName)} was turned down: ${str(d.reason)}`;
    case 'role.switched':
      return `The organiser moved you to ${role}s in ${str(d.tournamentName)}`;
    case 'team.reminder':
      return `Reminder: finish your team setup for ${str(d.tournamentName)}`;
    case 'webhook.auto_disabled':
      return `A ${d.kind === 'DISCORD' ? 'Discord' : 'webhook'} integration (${str(d.maskedUrl)}) was switched off after ${String(d.consecutiveFailures ?? 20)} failed deliveries`;
    default:
      return 'New notification';
  }
}

/**
 * Bell with an unread badge (§7.1), shown in the shared top bar on every logged-in page.
 * Live: `notification.new` on `u:<userId>` refetches the list.
 */
export function NotificationBell({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await api<{ items: Item[]; unread: number }>('/api/me/notifications');
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // Keep the last known state; the bell is best-effort.
    }
  }, []);

  useChannel(userChannel(userId), (e) => {
    if (e.type === 'notification.new') void load();
  });

  const onOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) void load();
  };

  const markAll = async (): Promise<void> => {
    const res = await api<{ unread: number }>('/api/me/notifications/read', { body: {} });
    setUnread(res.unread);
    setItems(
      (prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null,
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative"
        >
          <Bell aria-hidden className="size-5" />
          {unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-blood px-1 text-[0.625rem] font-bold text-blood-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-semibold">Notifications</p>
          {unread > 0 ? (
            <button type="button" className="text-xs text-lime hover:underline" onClick={markAll}>
              Mark all read
            </button>
          ) : null}
        </div>
        {items === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="grid max-h-80 gap-2 overflow-y-auto">
            {items.map((i) => (
              <li
                key={i.id}
                className={`rounded-md p-2 text-sm ${i.readAt ? 'text-muted' : 'bg-surface-2'}`}
              >
                {notificationText(i)}
                <span className="block text-xs text-muted">
                  {new Date(i.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
