import 'server-only';
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { EventDataMap, InboxEventType } from '@/lib/schemas/realtime';
import { getDb, type Db, type OnCommit } from '../../db/client';
import { notifications } from '../../db/schema';
import { dbNow } from '../../db/sql';
import { publishInbox } from '../../realtime/publisher';

/**
 * The inbox (PLAN §2.3 C, §5 `notifications`): requests, approvals, role switches… Each new row
 * is pushed live on `u:<userId>` as `notification.new` AFTER commit; the bell badge counts
 * unread rows.
 */

export type NotificationType =
  | 'request.received'
  | 'request.accepted'
  | 'request.declined'
  | 'request.cancelled'
  | 'approval.approved'
  | 'approval.rejected'
  | 'role.switched'
  | 'team.reminder';

export interface NotifyOptions {
  tournamentId?: string | null;
  /** An extra typed inbox event to publish alongside `notification.new`. */
  event?: { [K in InboxEventType]: { type: K; data: EventDataMap[K] } }[InboxEventType];
}

/** Insert a notification inside `tx` and publish it after commit. */
export async function notify(
  tx: Db,
  onCommit: OnCommit,
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
  opts: NotifyOptions = {},
): Promise<number> {
  const [row] = await tx
    .insert(notifications)
    .values({ userId, type, data })
    .returning({ id: notifications.id });
  const now = await dbNow(tx);
  const tid = opts.tournamentId ?? null;
  onCommit(async () => {
    await publishInbox(userId, tid, now, 'notification.new', { notificationId: row!.id, type });
    const e = opts.event;
    if (e) {
      // Narrowed by the discriminant; publishInbox's generic keeps data in step with type.
      switch (e.type) {
        case 'request.received':
          await publishInbox(userId, tid, now, e.type, e.data);
          break;
        case 'request.cancelled':
          await publishInbox(userId, tid, now, e.type, e.data);
          break;
        case 'approval.changed':
          await publishInbox(userId, tid, now, e.type, e.data);
          break;
        case 'notification.new':
          break;
      }
    }
  });
  return row!.id;
}

export interface NotificationItem {
  id: number;
  type: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export async function listNotifications(
  userId: string,
  limit = 30,
  db: Db = getDb(),
): Promise<{ items: NotificationItem[]; unread: number }> {
  const items = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      data: notifications.data,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(Math.max(limit, 1), 100));
  return { items, unread: await unreadCount(userId, db) };
}

export async function unreadCount(userId: string, db: Db = getDb()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Mark some (or all) of MY notifications as read. Other users' ids are silently ignored. */
export async function markNotificationsRead(
  userId: string,
  ids: number[] | undefined,
  db: Db = getDb(),
): Promise<{ unread: number }> {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids && ids.length > 0 ? inArray(notifications.id, ids) : undefined,
      ),
    );
  return { unread: await unreadCount(userId, db) };
}
