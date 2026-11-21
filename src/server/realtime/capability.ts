import {
  auctionChannel,
  presenceChannel,
  updatesChannel,
  userChannel,
} from '@/lib/realtime/channels';
import type { TournamentRole } from '@/lib/schemas/domain';

/**
 * Ably token capability builder (PLAN §6.3). Pure, so it is unit-tested without Ably.
 * Clients NEVER get `publish`: subscribe everywhere, plus `presence` on `t:<id>:presence` for
 * captains and organisers only.
 */
export type CapabilityOp = 'subscribe' | 'presence' | 'history';
export type Capability = Record<string, CapabilityOp[]>;

export interface TournamentAccessSummary {
  tournamentId: string;
  roles: readonly TournamentRole[];
}

const PRESENCE_ROLES: readonly TournamentRole[] = ['OWNER', 'CO_ADMIN', 'AUCTIONEER', 'CAPTAIN'];

/** Capability for a logged-in user: their inbox plus every tournament they take part in. */
export function buildUserCapability(
  userId: string,
  tournaments: readonly TournamentAccessSummary[],
): Capability {
  const cap: Capability = { [userChannel(userId)]: ['subscribe'] };
  for (const t of tournaments) {
    if (t.roles.length === 0) continue;
    cap[auctionChannel(t.tournamentId)] = ['subscribe'];
    cap[updatesChannel(t.tournamentId)] = ['subscribe'];
    cap[presenceChannel(t.tournamentId)] = t.roles.some((r) => PRESENCE_ROLES.includes(r))
      ? ['subscribe', 'presence']
      : ['subscribe'];
  }
  return cap;
}

/** Capability for a big-screen viewer of one tournament (only while live_screen_enabled). */
export function buildLiveScreenCapability(tournamentId: string): Capability {
  return {
    [auctionChannel(tournamentId)]: ['subscribe'],
    [updatesChannel(tournamentId)]: ['subscribe'],
    [presenceChannel(tournamentId)]: ['subscribe'],
  };
}
