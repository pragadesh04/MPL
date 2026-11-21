import { headers } from 'next/headers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AcceptInviteButton } from '@/features/identity/components/accept-invite-button';
import { ROLE_LABEL } from '@/features/identity/lib/labels';
import { getSessionUser } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getOrganiserInvitePreview } from '@/server/services/organisers/organisers';

export const metadata = { title: 'Organiser invite' };

/** Organiser invite link (§2.4): register or log in, then accept. */
export default async function OrganiserInvitePage({
  params,
}: PageProps<'/organiser-invite/[token]'>) {
  const { token } = await params;
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const preview = await getOrganiserInvitePreview(token, ip).catch((err: unknown) => {
    if (isAppError(err)) return null;
    throw err;
  });
  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This invite link doesn&apos;t work</CardTitle>
          <CardDescription>
            It may have been used, revoked or expired. Ask the tournament owner for a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const user = await getSessionUser();
  const next = `/organiser-invite/${token}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">
          Join the organiser team
        </CardTitle>
        <CardDescription>
          <strong>{preview.invitedBy}</strong> invited you to help run{' '}
          <strong className="text-lime">{preview.tournamentName}</strong> as{' '}
          <strong>{ROLE_LABEL[preview.role]}</strong>. This invite is for{' '}
          <strong>{preview.emailOrUsername}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {user ? (
          <>
            <p className="text-sm text-muted">Logged in as @{user.username}.</p>
            <AcceptInviteButton token={token} />
          </>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild size="lg">
              <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/register/organiser">Create an account</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
