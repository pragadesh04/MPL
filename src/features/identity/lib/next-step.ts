import type { MyTournament } from '@/server/services/tournaments/tournaments';
import { firstName } from './labels';

export interface NextStep {
  text: string;
  href: string | null;
}

/**
 * "The next thing to do" on a dashboard card (§7.1): "Set up your team", "Waiting for Ravi to
 * approve you", "Auction starts soon", … Links point at the owning lane's page.
 */
export function nextStepFor(t: MyTournament): NextStep {
  const owner = firstName(t.ownerName);
  const setup = t.status === 'DRAFT' || t.status === 'READY';
  if (t.pending) {
    return {
      text: `Waiting for ${owner} to approve you as ${t.pending === 'LEADER' ? 'captain' : 'soldier'}`,
      href: null,
    };
  }
  if (t.rejected && t.roles.length === 0) {
    return { text: `${owner} turned down your sign-up`, href: null };
  }
  const organiser = t.roles.some((r) => r === 'OWNER' || r === 'CO_ADMIN');
  if (organiser && setup) {
    return {
      text: t.status === 'READY' ? 'Everything checks out — ready to start' : 'Continue setup',
      href: `/t/${t.id}/setup`,
    };
  }
  if (t.roles.includes('CAPTAIN') && setup) {
    return t.myTeam
      ? { text: 'Team ready · auction starts soon', href: `/t/${t.id}/teams/setup` }
      : { text: 'Set up your team', href: `/t/${t.id}/teams/setup` };
  }
  if (t.roles.includes('SOLDIER') && setup) {
    return { text: 'You’re in! Waiting for the auction', href: `/t/${t.id}/people/me` };
  }
  if (organiser && t.status === 'ALLOCATION') {
    return { text: 'Allocate the leftover soldiers', href: `/t/${t.id}/allocation` };
  }
  if (organiser && t.status === 'GROUP_DRAW') {
    return { text: 'Run the group draw', href: `/t/${t.id}/groups` };
  }
  switch (t.status) {
    case 'AUCTION_LIVE':
    case 'AUCTION_PAUSED':
      return { text: 'The auction is on', href: `/t/${t.id}/auction` };
    case 'ALLOCATION':
      return { text: 'Leftover soldiers are being allocated', href: `/t/${t.id}` };
    case 'GROUP_DRAW':
      return { text: 'Group draw coming up', href: `/t/${t.id}/groups` };
    case 'GROUP_STAGE':
    case 'KNOCKOUT':
      return { text: 'Check the match order', href: `/t/${t.id}/matches` };
    case 'COMPLETED':
      return { text: 'See the champion and stats', href: `/t/${t.id}` };
    case 'CANCELLED':
      return { text: 'Cancelled', href: null };
    default:
      return { text: 'Open', href: `/t/${t.id}` };
  }
}
