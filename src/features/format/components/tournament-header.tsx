import { AnnouncementBanner } from '@/components/shell/announcement-banner';
import { StatusPill } from '@/components/ui/status-pill';
import type { TournamentStatus } from '@/lib/schemas/enums';
import { TOURNAMENT_STATUS_PILL } from '../status';
import { ServiceWorkerRegister } from '@/features/public/components/service-worker';
import { LiveRefresh } from './live-refresh';
import { TournamentNav } from './tournament-nav';

/**
 * Header for every Lane C tournament page: announcement banner, name, status pill and the format
 * navigation, plus live refresh on `t:<id>:updates`. Phase 2 (I3) may lift this into a shared
 * `t/[id]/layout.tsx` with role-based navigation for every lane's pages.
 */
export function TournamentHeader({
  tournament,
  isOrganiser,
  title,
}: {
  tournament: { id: string; name: string; status: TournamentStatus; announcement: string | null };
  isOrganiser: boolean;
  /** Page title under the tournament name, e.g. "Matches". */
  title?: string;
}) {
  const pill = TOURNAMENT_STATUS_PILL[tournament.status];
  return (
    <div className="mb-6 space-y-4">
      <LiveRefresh tournamentId={tournament.id} />
      <ServiceWorkerRegister />
      <AnnouncementBanner
        text={tournament.announcement}
        className="-mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-md sm:border"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-widest text-muted uppercase">
            {tournament.name}
          </p>
          {title ? (
            <h1 className="font-display text-3xl tracking-wide sm:text-4xl">{title}</h1>
          ) : null}
        </div>
        <StatusPill tone={pill.tone} live={pill.live}>
          {pill.label}
        </StatusPill>
      </div>
      <TournamentNav tournamentId={tournament.id} isOrganiser={isOrganiser} />
    </div>
  );
}
