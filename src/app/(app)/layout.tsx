import { TopBar } from '@/components/shell/top-bar';
import { NotificationBell } from '@/features/identity/components/notification-bell';
import { RealtimeProvider } from '@/lib/realtime/provider';
import { getSessionUser } from '@/server/auth/session';
import { isRealtimeEnabled } from '@/server/realtime/publisher';
import { unreadCount } from '@/server/services/notifications/notifications';
import { listMyTournaments } from '@/server/services/tournaments/tournaments';

/**
 * App shell for logged-in pages (dashboard, /t/[id]/…). `proxy.ts` already redirected visitors
 * without a session cookie; real authorisation happens in each page's service calls.
 *
 * The top bar gets the tournament switcher (every tournament I'm in, with my roles), the live
 * notification bell and the user menu. Tournament navigation is in `t/[id]/layout.tsx`.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await getSessionUser();
  const [mine, unread] = user
    ? await Promise.all([listMyTournaments(user.id), unreadCount(user.id)])
    : [[], 0];
  const tournaments = mine
    .filter((t) => t.roles.length > 0 || t.pending)
    .map((t) => ({ id: t.id, name: t.name, roles: t.roles }));
  return (
    <RealtimeProvider enabled={isRealtimeEnabled()}>
      <TopBar
        user={user}
        tournaments={tournaments}
        actions={user ? <NotificationBell userId={user.id} initialUnread={unread} /> : null}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </RealtimeProvider>
  );
}
