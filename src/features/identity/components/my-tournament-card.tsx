import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { TeamChip } from '@/components/ui/team-chip';
import type { MyTournament } from '@/server/services/tournaments/tournaments';
import { ROLE_LABEL, STATUS_LABEL, STATUS_TONE } from '../lib/labels';
import { nextStepFor } from '../lib/next-step';

/** "My tournaments" card: role, my team (colour + code), next thing to do (§7.1). */
export function MyTournamentCard({ tournament }: { tournament: MyTournament }) {
  const step = nextStepFor(tournament);
  const body = (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-lime-dim">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[tournament.status]}>
          {STATUS_LABEL[tournament.status]}
        </StatusPill>
        {tournament.roles.map((r) => (
          <Badge key={r} variant="secondary">
            {ROLE_LABEL[r]}
          </Badge>
        ))}
        {tournament.pending ? <Badge variant="outline">Pending approval</Badge> : null}
      </div>
      <div>
        <h3 className="font-display text-xl tracking-wide">{tournament.name}</h3>
        <p className="text-sm text-muted">by {tournament.ownerName}</p>
      </div>
      {tournament.myTeam ? <TeamChip {...tournament.myTeam} /> : null}
      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-lime">
        {step.text}
        {step.href ? <ChevronRight aria-hidden className="size-4" /> : null}
      </p>
    </Card>
  );
  return step.href ? (
    <Link href={step.href} className="block rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
