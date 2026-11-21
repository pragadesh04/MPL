'use client';

import { Button } from '@/components/ui/button';
import { MpAmount } from '@/components/ui/mp-amount';
import { TeamChip } from '@/components/ui/team-chip';
import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';
import { OnlineDot } from '../shared/display';
import type { TeamBidState } from '../shared/phase';

type Team = AuctionSnapshot['teams'][number];

/**
 * `bidBlockMessage` speaks to the captain ("Your squad is full"). On the console tile the same
 * reason reads better in the third person, so it is keyed on the rule's reason code; other
 * reasons use the captain-facing text unchanged.
 */
export function tileReason(state: TeamBidState): string | null {
  switch (state.code) {
    case null:
      return null;
    case 'SQUAD_FULL':
      return 'Squad full';
    case 'ALREADY_LEADING':
      return 'Leading';
    case 'CANT_AFFORD':
      return state.nextBid === null ? "Can't afford" : `Can't afford ${state.nextBid} MP`;
    default:
      return state.reason;
  }
}

interface TeamStripProps {
  teams: Team[];
  maxPlayers: number;
  bidStates: Record<string, TeamBidState>;
  leadingTeamId: string | null;
  online: ReadonlySet<string>;
  presenceAvailable: boolean;
  captainUserIds: Record<string, string | null>;
  showFallback: boolean;
  canAct: boolean;
  /** Why fallback bids are unavailable for this viewer (not the controller, read-only role). */
  readOnlyReason: string | null;
  busy: boolean;
  onBid: (teamId: string, amount: number) => void;
}

/** One tile per team (§7.6): MP left, squad n/max, captain online dot, fallback "Bid for them". */
export function TeamStrip({
  teams,
  maxPlayers,
  bidStates,
  leadingTeamId,
  online,
  presenceAvailable,
  captainUserIds,
  showFallback,
  canAct,
  readOnlyReason,
  busy,
  onBid,
}: TeamStripProps) {
  return (
    <section aria-label="Teams">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
        {teams.map((team, i) => {
          const state = bidStates[team.id];
          const captain = captainUserIds[team.id] ?? null;
          const leading = team.id === leadingTeamId;
          const nextBid = state?.nextBid ?? null;
          const reason = !canAct ? readOnlyReason : state ? tileReason(state) : null;
          const reasonId = `team-${team.id}-reason`;
          return (
            <li
              key={team.id}
              style={teamStyle(team.color)}
              className={cn(
                'flex flex-col overflow-hidden rounded-lg border bg-surface',
                leading ? 'border-team shadow-glow' : 'border-border',
              )}
            >
              <div className="bg-team h-1.5" aria-hidden="true" />
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  {i < 9 ? (
                    <kbd
                      className="rounded-sm border border-border bg-surface-2 px-1.5 font-numeric text-xs text-muted"
                      title={`Press ${i + 1} to bid for ${team.name}`}
                    >
                      {i + 1}
                    </kbd>
                  ) : null}
                  <TeamChip
                    name={team.name}
                    shortName={team.shortName}
                    color={team.color}
                    size="sm"
                    className="min-w-0 flex-1"
                  />
                  <OnlineDot
                    online={captain !== null && online.has(captain)}
                    available={presenceAvailable && captain !== null}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <dt className="text-muted">MP left</dt>
                    <dd>
                      <MpAmount value={team.purseRemaining} size="sm" />
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-muted">Squad</dt>
                    <dd className="tabular font-numeric text-sm font-semibold">
                      {team.squadSize}/{maxPlayers}
                    </dd>
                  </div>
                </dl>
                {leading ? (
                  <p className="text-team text-[0.625rem] font-bold tracking-widest uppercase">
                    Leading
                  </p>
                ) : null}
                {showFallback ? (
                  <div className="mt-auto grid gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!canAct || busy || !state?.canBid || nextBid === null}
                      aria-describedby={reason ? reasonId : undefined}
                      aria-label={`Bid for ${team.name}${nextBid !== null ? `: ${nextBid} MP` : ''}`}
                      onClick={() => {
                        if (nextBid !== null) onBid(team.id, nextBid);
                      }}
                    >
                      Bid for them{nextBid !== null && state?.canBid ? ` · ${nextBid}` : ''}
                    </Button>
                    {reason ? (
                      <p id={reasonId} className="text-[0.6875rem] leading-tight text-muted">
                        {reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
