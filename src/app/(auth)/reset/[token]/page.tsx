import { headers } from 'next/headers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from '@/features/identity/components/reset-password-form';
import { isAppError } from '@/server/errors';
import { getResetPreview } from '@/server/services/passwords/passwords';

export const metadata = { title: 'Reset password' };

/** One-time password reset link (§2.5). Same message for any invalid / used / expired link. */
export default async function ResetPage({ params }: PageProps<'/reset/[token]'>) {
  const { token } = await params;
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const who = await getResetPreview(token, ip).catch((err: unknown) => {
    if (isAppError(err)) return null;
    throw err;
  });
  if (!who) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This reset link doesn&apos;t work</CardTitle>
          <CardDescription>
            It may have expired (links last 30 minutes) or been used already. Players: ask your
            organiser for a new one. Organisers: contact the site admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">New password</CardTitle>
        <CardDescription>
          For {who.displayName} (@{who.username}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
