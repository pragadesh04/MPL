'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GavelIcon } from 'lucide-react';
import { saveLiveRules } from '@/app/(app)/t/[id]/command-post/actions';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { StatusPill } from '@/components/ui/status-pill';
import { useAuction } from '../shared/auction-context';
import { SquadCard } from '../shared/display';
import { PHASE_TEXT, auctionPhase } from '../shared/phase';
import type { AuctionViewer, RosterPerson } from '../shared/types';
import { useConsoleActions } from '../console/use-console-actions';
import { ReleaseDialog, type ReleaseTarget } from './release-dialog';
import { rosterRows } from './roster-status';
import { RosterTable } from './roster-table';
import { RulesCard } from './rules-card';

export interface CommandPostProps {
  viewer: AuctionViewer;
  roster: RosterPerson[];
}

const LIVE_STATUSES = new Set(['AUCTION_LIVE', 'AUCTION_PAUSED']);

/**
 * Command post (§7.6a): the organiser roster panel beside the console. Squad / status columns are
 * derived from the live snapshot; the roster prop only lists who is registered.
 */
export function CommandPost({ viewer, roster }: CommandPostProps) {
  const { snapshot, command, info, live } = useAuction();
  const { pending, run } = useConsoleActions();
  const [release, setRelease] = useState<ReleaseTarget | null>(null);
  const rows = rosterRows(roster, snapshot);
  const captains = roster.filter((r) => r.kind === 'CAPTAIN').length;
  const phase = auctionPhase(snapshot);
  const teams = [...snapshot.teams].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs tracking-widest text-muted uppercase">Command post</p>
          <h1 className="truncate font-display text-3xl tracking-wide">{info.tournamentName}</h1>
        </div>
        <StatusPill tone={phase === 'LOT' ? 'lime' : 'neutral'} live={phase === 'LOT'}>
          {PHASE_TEXT[phase]}
        </StatusPill>
        <StatusPill tone="gold">{captains} captains</StatusPill>
        <StatusPill tone="sand">{roster.length - captains} soldiers</StatusPill>
        <StatusPill tone={live ? 'success' : 'neutral'}>{live ? 'Live' : 'Polling'}</StatusPill>
        <Button asChild>
          <Link href={`/t/${info.tournamentId}/auction`}>
            <GavelIcon aria-hidden="true" />
            Auction room
          </Link>
        </Button>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <RosterTable
          rows={rows}
          canRoster={viewer.canRoster}
          busy={pending !== null}
          onRelease={setRelease}
        />
        <RulesCard
          tournamentId={info.tournamentId}
          settings={info.settings}
          editable={viewer.canEditLiveSettings && LIVE_STATUSES.has(snapshot.status)}
          onSave={saveLiveRules}
        />
      </div>

      <section aria-labelledby="squads-heading" className="grid gap-3">
        <h2 id="squads-heading" className="font-display text-xl tracking-wide uppercase">
          Squads
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {teams.map((team) => (
            <SquadCard key={team.id} team={team} maxPlayers={info.settings.maxPlayersPerTeam} />
          ))}
        </div>
      </section>

      {viewer.canRoster ? (
        <ReleaseDialog
          target={release}
          pending={pending !== null}
          onOpenChange={(open) => {
            if (!open) setRelease(null);
          }}
          onConfirm={async (target, reason) => {
            const ok = await run('release', () =>
              command({
                type: 'release',
                playerId: target.playerId,
                ...(reason ? { reason } : {}),
              }),
            );
            if (ok) toast.success(`${target.name} released to the pool`);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}
