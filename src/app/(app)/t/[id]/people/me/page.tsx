import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MpAmount } from '@/components/ui/mp-amount';
import { StatusPill } from '@/components/ui/status-pill';
import { TeamChip } from '@/components/ui/team-chip';
import { LiveRefresh } from '@/features/identity/components/live-refresh';
import { MyCardForm } from '@/features/identity/components/my-card';
import { firstName } from '@/features/identity/lib/labels';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import type { MyCard } from '@/server/services/people/teams';
import { getMyCard } from '@/server/services/people/teams';

export const metadata = { title: 'My card' };

function statusLine(card: MyCard): {
  tone: 'amber' | 'lime' | 'gold' | 'blood' | 'sand';
  text: string;
} {
  const owner = firstName(card.tournament.ownerName);
  if (card.rejected) return { tone: 'blood', text: `${owner} turned down your sign-up` };
  if (card.pending) return { tone: 'amber', text: 'Waiting for approval' };
  if (card.kind === 'LEADER') return { tone: 'lime', text: 'Captain' };
  switch (card.status) {
    case 'ON_BLOCK':
      return { tone: 'gold', text: 'You’re on the block!' };
    case 'SOLD':
      return { tone: 'lime', text: 'Drafted' };
    case 'ALLOCATED':
      return { tone: 'lime', text: 'Auto-assigned' };
    case 'UNSOLD':
      return { tone: 'sand', text: 'On the unsold list for now' };
    default:
      return { tone: 'lime', text: 'Approved' };
  }
}

/**
 * Soldier portal (§7.5) — also a captain's own card. Pending people see only this card.
 * Integration (I3) adds Lane B's live auction status card and Lane C's fixtures here.
 */
export default async function MyCardPage({ params }: PageProps<'/t/[id]/people/me'>) {
  const { id } = await params;
  const userId = await requirePageUser(`/t/${id}/people/me`);
  const card = await orNotFound(() => getMyCard(userId, id));
  const status = statusLine(card);
  const editable =
    !card.rejected && (card.tournament.status === 'DRAFT' || card.tournament.status === 'READY');

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <LiveRefresh tournamentId={card.pending ? undefined : id} userId={userId} />
      <div>
        <p className="text-sm text-muted">{card.tournament.name}</p>
        <h1 className="font-display text-3xl tracking-wide">My card</h1>
      </div>
      <Card>
        <CardHeader>
          <StatusPill tone={status.tone}>{status.text}</StatusPill>
          <CardTitle className="mt-2">
            {card.pending
              ? `Waiting for ${firstName(card.tournament.ownerName)} to approve you as ${card.kind === 'LEADER' ? 'captain' : 'soldier'}`
              : card.kind === 'LEADER'
                ? 'You’re a captain'
                : card.team
                  ? `You have been drafted to ${card.team.name}`
                  : 'You’re in! Waiting for the auction'}
          </CardTitle>
          {card.rejectReason ? (
            <CardDescription>Reason: {card.rejectReason}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {card.kind === 'PLAYER' && card.basePrice !== null && !card.pending ? (
            <span className="flex items-center gap-2">
              Base price <MpAmount value={card.basePrice} />
            </span>
          ) : null}
          {card.kind === 'LEADER' && card.purse !== null && !card.pending ? (
            <span className="flex items-center gap-2">
              Purse <MpAmount value={card.purse} />
            </span>
          ) : null}
          {card.team ? <TeamChip {...card.team} /> : null}
          {card.soldPrice !== null && card.soldPrice > 0 ? (
            <span className="flex items-center gap-2">
              for <MpAmount value={card.soldPrice} />
            </span>
          ) : null}
          {card.kind === 'LEADER' && !card.pending ? (
            <Button asChild size="sm">
              <Link href={`/t/${id}/teams/setup`}>
                {card.team ? 'My team' : 'Set up your team'}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Check your card</CardTitle>
          <CardDescription>
            {editable
              ? 'This is how you appear on the auction card. You can change it until the tournament starts.'
              : 'Locked: the tournament has started.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyCardForm
            tournamentId={id}
            initial={{ name: card.name, ign: card.ign, phone: card.phone, photoUrl: card.photoUrl }}
            basePrice={card.kind === 'PLAYER' ? card.basePrice : null}
            disabled={!editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
