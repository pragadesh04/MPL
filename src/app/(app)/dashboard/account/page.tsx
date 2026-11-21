import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm, ProfileForm } from '@/features/identity/components/account-forms';
import { formatKey } from '@/lib/rules/keys';
import { getSessionUserId } from '@/server/auth/session';
import { getUser } from '@/server/services/accounts/accounts';

export const metadata = { title: 'My account' };

/** Profile + change password (§7 App shell user menu, §2.5). */
export default async function AccountPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login?next=/dashboard/account');
  const user = await getUser(userId);
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <h1 className="font-display text-3xl tracking-wide">My account</h1>
        <p className="text-muted">
          @{user.username} · Player ID{' '}
          <span className="font-display tracking-widest text-lime">
            {formatKey(user.playerCode, 'PLAYER_CODE')}
          </span>
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>What organisers and captains see on your card.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              displayName: user.displayName,
              ign: user.ign ?? '',
              phone: user.phone ?? '',
              photoUrl: user.photoUrl ?? '',
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
