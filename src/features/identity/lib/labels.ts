import type { StatusPillTone } from '@/components/ui/status-pill';
import type { TournamentRole } from '@/lib/schemas/domain';
import type { TournamentStatus } from '@/lib/schemas/enums';

export const ROLE_LABEL: Record<TournamentRole, string> = {
  OWNER: 'Owner',
  CO_ADMIN: 'Co-admin',
  AUCTIONEER: 'Auctioneer',
  CAPTAIN: 'Captain',
  SOLDIER: 'Soldier',
};

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: 'Setup',
  READY: 'Ready to start',
  AUCTION_LIVE: 'Auction live',
  AUCTION_PAUSED: 'Auction paused',
  ALLOCATION: 'Allocation',
  GROUP_DRAW: 'Group draw',
  GROUP_STAGE: 'Group stage',
  KNOCKOUT: 'Knockout',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONE: Record<TournamentStatus, StatusPillTone> = {
  DRAFT: 'sand',
  READY: 'lime',
  AUCTION_LIVE: 'blood',
  AUCTION_PAUSED: 'amber',
  ALLOCATION: 'amber',
  GROUP_DRAW: 'gold',
  GROUP_STAGE: 'gold',
  KNOCKOUT: 'gold',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
