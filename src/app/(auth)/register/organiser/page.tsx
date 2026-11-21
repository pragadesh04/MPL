import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountTypeCards } from '@/features/identity/components/account-type-cards';
import { RegisterOrganiserForm } from '@/features/identity/components/register-organiser-form';
import { getSessionUserId } from '@/server/auth/session';

export const metadata = { title: 'Organiser sign-up' };

export default async function RegisterOrganiserPage() {
  if (await getSessionUserId()) redirect('/dashboard');
  return (
    <>
      <AccountTypeCards active="ORGANISER" />
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl tracking-wide">Command post</CardTitle>
          <CardDescription>
            Organiser accounts get an organiser key for players to join with, and can run one active
            tournament at a time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterOrganiserForm />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-lime">
          Log in
        </Link>
      </p>
    </>
  );
}
