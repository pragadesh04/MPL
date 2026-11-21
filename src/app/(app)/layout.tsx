import { TopBar } from '@/components/shell/top-bar';
import { RealtimeProvider } from '@/lib/realtime/provider';
import { getSessionUser } from '@/server/auth/session';
import { isRealtimeEnabled } from '@/server/realtime/publisher';

/**
 * App shell for logged-in pages (dashboard, /t/[id]/…). `proxy.ts` already redirected visitors
 * without a session cookie; real authorisation happens in each page's service calls.
 *
 * The tournament switcher list and role-based navigation are wired in Phase 2 integration
 * (I3) from Lane A's `GET /api/me/tournaments` service; the announcement banner is rendered by
 * the tournament pages themselves (<AnnouncementBanner text={…} />).
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await getSessionUser();
  return (
    <RealtimeProvider enabled={isRealtimeEnabled()}>
      <TopBar user={user} tournaments={[]} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </RealtimeProvider>
  );
}
