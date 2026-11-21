import { can } from './permissions';
import type { TournamentRole } from './schemas/domain';
import type { TournamentStatus } from './schemas/enums';

/**
 * Role- and stage-based tournament navigation (PLAN §7 app shell, §13.8 I3). One list for every
 * lane's pages, rendered by the shared `t/[id]/layout.tsx`. Pure, so it is unit-tested and the
 * server decides what each role sees. Pages still enforce access themselves; hiding a link is
 * only UX (§7.3).
 */
export interface TournamentNavItem {
  href: string;
  label: string;
  /** Match only the exact path (the tournament home), not sub-paths. */
  exact?: boolean;
}

const SETUP: readonly TournamentStatus[] = ['DRAFT', 'READY'];
const AUCTION: readonly TournamentStatus[] = ['AUCTION_LIVE', 'AUCTION_PAUSED'];
const FORMAT: readonly TournamentStatus[] = ['GROUP_DRAW', 'GROUP_STAGE', 'KNOCKOUT', 'COMPLETED'];

export function isSetupStatus(status: TournamentStatus): boolean {
  return SETUP.includes(status);
}
export function isAuctionStatus(status: TournamentStatus): boolean {
  return AUCTION.includes(status);
}
/** The auction has happened or is happening (anything after Start, except cancelled-in-setup). */
export function hasAuctionStarted(status: TournamentStatus, startedAt?: Date | null): boolean {
  if (status === 'CANCELLED') return Boolean(startedAt);
  return !SETUP.includes(status);
}
export function isFormatStatus(status: TournamentStatus): boolean {
  return FORMAT.includes(status);
}

export function tournamentNavItems(
  tournamentId: string,
  roles: readonly TournamentRole[],
  status: TournamentStatus,
  startedAt?: Date | null,
): TournamentNavItem[] {
  const base = `/t/${tournamentId}`;
  const organiser = can(roles, 'tournament:view-admin');
  const manager = can(roles, 'people:manage');
  const captain = roles.includes('CAPTAIN');
  const soldier = roles.includes('SOLDIER');
  const started = hasAuctionStarted(status, startedAt);
  const items: TournamentNavItem[] = [{ href: base, label: 'Home', exact: true }];

  if (manager && isSetupStatus(status)) items.push({ href: `${base}/setup`, label: 'Setup' });
  if (organiser) items.push({ href: `${base}/people`, label: 'People' });
  if (manager && isSetupStatus(status)) items.push({ href: `${base}/teams`, label: 'Teams' });
  if (captain) items.push({ href: `${base}/teams/setup`, label: 'My team' });
  if (soldier) items.push({ href: `${base}/people/me`, label: 'My card' });

  if (started) items.push({ href: `${base}/auction`, label: 'Auction' });
  if (organiser && started) items.push({ href: `${base}/command-post`, label: 'Command post' });
  if (organiser && (status === 'ALLOCATION' || isFormatStatus(status))) {
    items.push({ href: `${base}/allocation`, label: 'Allocation' });
  }

  if (isFormatStatus(status)) {
    items.push(
      { href: `${base}/matches`, label: 'Matches' },
      { href: `${base}/groups`, label: 'Groups' },
      { href: `${base}/knockout`, label: 'Knockout' },
    );
  }
  if (started) {
    items.push(
      { href: `${base}/teams-overview`, label: 'Squads' },
      { href: `${base}/stats`, label: 'Stats' },
    );
  }
  if (organiser) items.push({ href: `${base}/audit`, label: 'Audit log' });
  if (organiser) items.push({ href: `${base}/settings`, label: 'Settings' });
  return items;
}

/** Which item is active for `pathname`: the longest matching href wins (so /teams/setup beats /teams). */
export function activeNavHref(
  items: readonly TournamentNavItem[],
  pathname: string,
): string | null {
  let best: TournamentNavItem | null = null;
  for (const item of items) {
    const hit = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.href ?? null;
}
