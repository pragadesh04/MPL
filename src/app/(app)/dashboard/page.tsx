import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSessionUser } from '@/server/auth/session';

export const metadata = { title: 'Dashboard' };

/**
 * PHASE 0 PLACEHOLDER — Lane A replaces this page (A2: organiser and player dashboards, §7.1).
 * It exists so /dev/login-as has somewhere to land.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Command post</CardTitle>
        <CardDescription>
          {user ? `Logged in as ${user.displayName} (@${user.username}).` : 'Not logged in.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        The dashboard is built by Lane A (PLAN §7.1).
      </CardContent>
    </Card>
  );
}
