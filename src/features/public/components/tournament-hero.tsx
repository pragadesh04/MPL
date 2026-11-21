import { StatusPill } from '@/components/ui/status-pill';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { cn } from '@/lib/utils';
import { TOURNAMENT_STATUS_PILL } from '@/features/format/status';
import type { HomeCounts } from '@/features/format/types';

const AFTER_AUCTION: readonly TournamentStatus[] = [
  'ALLOCATION',
  'GROUP_DRAW',
  'GROUP_STAGE',
  'KNOCKOUT',
  'COMPLETED',
];

/** Status pills (§7, §12): `GROUP STAGE` · `AUCTION COMPLETE` · `8 CAPTAINS` · `29 SOLDIERS`. */
export function StatusPills({ status, counts }: { status: TournamentStatus; counts: HomeCounts }) {
  const pill = TOURNAMENT_STATUS_PILL[status];
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <StatusPill tone={pill.tone} live={pill.live}>
        {pill.label}
      </StatusPill>
      {AFTER_AUCTION.includes(status) ? (
        <StatusPill tone="gold">Auction complete</StatusPill>
      ) : null}
      <StatusPill tone="sand">{counts.captains} captains</StatusPill>
      <StatusPill tone="neutral">{counts.soldiers} soldiers</StatusPill>
    </div>
  );
}

/** Hero with the tournament name and the jetpack mascots (§7 tournament home). */
export function TournamentHero({
  name,
  status,
  counts,
  large = false,
}: {
  name: string;
  status: TournamentStatus;
  counts: HomeCounts;
  large?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-surface/70 px-6 py-10 text-center">
      <p className="mb-2 text-xs font-semibold tracking-[0.3em] text-muted uppercase">
        Mini Militia Premier League
      </p>
      <h1
        className={cn(
          'font-display tracking-wide text-balance',
          large ? 'text-7xl' : 'text-4xl sm:text-6xl',
        )}
      >
        {name}
      </h1>
      <div className="mt-5">
        <StatusPills status={status} counts={counts} />
      </div>
    </section>
  );
}
