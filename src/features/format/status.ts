import type { StatusPillTone } from '@/components/ui/status-pill';
import type { MatchStatus, TournamentStatus } from '@/lib/schemas/enums';

/** Tournament status → pill text and tone (§7 pill badges). */
export const TOURNAMENT_STATUS_PILL: Record<
  TournamentStatus,
  { label: string; tone: StatusPillTone; live?: boolean }
> = {
  DRAFT: { label: 'Setting up', tone: 'neutral' },
  READY: { label: 'Ready to start', tone: 'info' },
  AUCTION_LIVE: { label: 'Auction live', tone: 'lime', live: true },
  AUCTION_PAUSED: { label: 'Auction paused', tone: 'amber' },
  ALLOCATION: { label: 'Allocation', tone: 'amber' },
  GROUP_DRAW: { label: 'Group draw', tone: 'gold' },
  GROUP_STAGE: { label: 'Group stage', tone: 'lime', live: true },
  KNOCKOUT: { label: 'Knockout', tone: 'blood', live: true },
  COMPLETED: { label: 'Completed', tone: 'gold' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const MATCH_STATUS_PILL: Record<
  MatchStatus,
  { label: string; tone: StatusPillTone; live?: boolean }
> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  LIVE: { label: 'Live', tone: 'blood', live: true },
  DONE: { label: 'Final', tone: 'success' },
};

/** Format phases where the matches hub has something to show. */
export function hasFormat(status: TournamentStatus): boolean {
  return status === 'GROUP_STAGE' || status === 'KNOCKOUT' || status === 'COMPLETED';
}
