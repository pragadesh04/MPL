import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from '@/features/identity/components/login-form';
import { safeNextPath } from '@/features/identity/lib/next-path';
import { getSessionUserId } from '@/server/auth/session';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const next = safeNextPath((await searchParams).next);
  if (await getSessionUserId()) redirect(next);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">Report for duty</CardTitle>
        <CardDescription>Log in with your MPL username.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
      </CardContent>
    </Card>
  );
}
