import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountTypeCards } from '@/features/identity/components/account-type-cards';
import { RegisterPlayerForm } from '@/features/identity/components/register-player-form';
import { getSessionUserId } from '@/server/auth/session';

export const metadata = { title: 'Enlist' };

/** Player sign-up, the default (§7.0). Accepts `?key=` from a shared organiser link. */
export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const { key } = await searchParams;
  const initialKey = typeof key === 'string' ? key : '';
  if (await getSessionUserId()) {
    redirect(initialKey ? `/dashboard?key=${encodeURIComponent(initialKey)}` : '/dashboard');
  }
  return (
    <>
      <AccountTypeCards active="PLAYER" keyParam={initialKey || undefined} />
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-wide">Enlist</CardTitle>
          <CardDescription>
            Create your player account. You get a Player ID that organisers can invite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterPlayerForm initialKey={initialKey} />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted">
        Already enlisted?{' '}
        <Link href="/login" className="font-semibold text-lime">
          Log in
        </Link>
      </p>
    </>
  );
}
