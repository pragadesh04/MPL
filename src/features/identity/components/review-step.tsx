import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReadyToStartResult } from '@/lib/rules/validateReadyToStart';
import type { RosterCounts, TournamentDetail } from '@/server/services/tournaments/tournaments';
import { formatMP } from '@/lib/money';
import { stepHref } from './setup-shell';
import { StartTournamentButton } from './start-tournament-button';

/** Setup step 5 (§7.2, §3.5): the checklist with "Fix" links, a summary and START. */
export function ReviewStep({
  tournament,
  readiness,
  counts,
  totalPurse,
  canStart,
}: {
  tournament: TournamentDetail;
  readiness: ReadyToStartResult;
  counts: RosterCounts;
  totalPurse: number;
  canStart: boolean;
}) {
  const setup = tournament.status === 'DRAFT' || tournament.status === 'READY';
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Pre-flight checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {readiness.checks.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <span className="flex items-start gap-2">
                  {c.ok ? (
                    <CheckCircle2
                      aria-label="Passed"
                      className="mt-0.5 size-5 shrink-0 text-lime"
                    />
                  ) : (
                    <XCircle aria-label="Failed" className="mt-0.5 size-5 shrink-0 text-blood" />
                  )}
                  <span className="text-sm">{c.message}</span>
                </span>
                {!c.ok && setup ? (
                  <Link
                    href={stepHref(tournament.id, c.fixStep)}
                    className="shrink-0 text-sm font-semibold text-lime hover:underline"
                  >
                    Fix
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <aside className="grid gap-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>{counts.captains} captains (teams)</p>
            <p>{counts.soldiers} soldiers in the pool</p>
            <p>
              Squads of {tournament.settings.minPlayersPerTeam}–
              {tournament.settings.maxPlayersPerTeam}, captain included
            </p>
            <p>Total purse in play: {formatMP(totalPurse)}</p>
          </CardContent>
        </Card>
        {setup && canStart ? (
          <StartTournamentButton
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            ready={readiness.ok}
          />
        ) : null}
      </aside>
    </div>
  );
}
