import { headers } from 'next/headers';
import Link from 'next/link';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MpAmount } from '@/components/ui/mp-amount';
import { StatusPill } from '@/components/ui/status-pill';
import {
  afterClaimPath,
  ClaimButton,
  InviteRegisterForm,
} from '@/features/identity/components/invite-claim';
import { getSessionUser } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { previewInvite } from '@/server/services/joining/personalLink';

export const metadata = { title: 'You’re invited' };

/** Personal invite link (§7.4), captain or soldier. Public route; mobile-first. */
export default async function InvitePage({ params }: PageProps<'/i/[token]'>) {
  const { token } = await params;
  const user = await getSessionUser();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const preview = await previewInvite(token, ip, user?.id ?? null).catch((err: unknown) => {
    if (isAppError(err)) return null;
    throw err;
  });
  const loginHref = `/login?next=${encodeURIComponent(`/i/${token}`)}`;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/" className="flex items-center justify-center gap-2">
        <JetpackSoldier pose="flying" className="size-12 text-lime" />
        <span className="font-display text-3xl tracking-wider text-lime">MPL</span>
      </Link>
      {!preview ? (
        <Card>
          <CardHeader>
            <CardTitle>This link doesn&apos;t work</CardTitle>
            <CardDescription>
              It may have been replaced by a newer link, or the tournament is over. Ask your
              organiser for a fresh one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary">
              <Link href={loginHref}>Log in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-lime/40 text-center">
            <CardHeader className="items-center">
              <StatusPill tone="lime">{preview.tournamentName}</StatusPill>
              <CardTitle className="font-display text-3xl tracking-wide">
                You&apos;ve been invited as {preview.kind === 'LEADER' ? 'Captain' : 'Soldier'}
              </CardTitle>
              <CardDescription>
                by {preview.organiserName} · spot for <strong>{preview.spot.name}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center gap-2">
              {preview.kind === 'LEADER' ? (
                <>
                  You start with <MpAmount value={preview.spot.purse ?? 0} size="lg" />
                </>
              ) : (
                <>
                  Your base price is <MpAmount value={preview.spot.basePrice ?? 0} size="lg" />
                </>
              )}
            </CardContent>
          </Card>

          {preview.claimedByMe ? (
            <Card>
              <CardHeader>
                <CardTitle>This spot is yours</CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild size="lg">
                  <Link href={afterClaimPath(preview)}>
                    {preview.kind === 'LEADER' ? 'Set up your team' : 'Check your card'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : preview.claimed ? (
            <Card>
              <CardHeader>
                <CardTitle>This spot is already taken</CardTitle>
                <CardDescription>
                  Someone has already claimed it. If that wasn&apos;t you, ask your organiser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {user ? null : (
                  <Button asChild variant="secondary">
                    <Link href={loginHref}>It was me — log in</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : user ? (
            <Card>
              <CardHeader>
                <CardTitle>Step 1 · Account</CardTitle>
                <CardDescription>You&apos;re logged in as @{user.username}.</CardDescription>
              </CardHeader>
              <CardContent>
                <ClaimButton token={token} username={user.username} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Step 1 · Create your account</CardTitle>
                <CardDescription>
                  Already have one?{' '}
                  <Link href={loginHref} className="font-semibold text-lime">
                    Log in instead
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InviteRegisterForm
                  token={token}
                  prefill={{ name: preview.spot.name, ign: preview.spot.ign }}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
