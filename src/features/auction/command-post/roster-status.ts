import type { AuctionSnapshot } from '@/lib/schemas/auction';
import { ACQUIRED_LABEL } from '../shared/phase';
import type { RosterPerson } from '../shared/types';

type Team = AuctionSnapshot['teams'][number];

/**
 * Live squad / status for one roster row. The roster prop is only the initial list; who is in
 * which squad, the pool and the unsold list come from the live snapshot so the table never lags.
 */
export type RosterLiveStatus =
  | { kind: 'CAPTAIN'; team: Team | null }
  | { kind: 'SQUAD'; team: Team; price: number; badge: string | null }
  | { kind: 'ON_BLOCK' }
  | { kind: 'POOL' }
  | { kind: 'UNSOLD' }
  | { kind: 'OTHER'; label: string };

export interface RosterRow extends RosterPerson {
  live: RosterLiveStatus;
}

const STATUS_TEXT: Record<string, string> = {
  POOL: 'In pool',
  ON_BLOCK: 'On the block',
  UNSOLD: 'Unsold',
  SOLD: 'In a squad',
  ALLOCATED: 'In a squad',
  PENDING: 'Pending',
};

export function liveStatus(person: RosterPerson, s: AuctionSnapshot): RosterLiveStatus {
  if (person.kind === 'CAPTAIN') {
    return { kind: 'CAPTAIN', team: s.teams.find((t) => t.id === person.teamId) ?? null };
  }
  for (const team of s.teams) {
    const member = team.members.find((m) => m.playerId === person.id);
    if (member) {
      return {
        kind: 'SQUAD',
        team,
        price: member.price,
        badge: ACQUIRED_LABEL[member.acquiredVia] || null,
      };
    }
  }
  if (s.current?.playerId === person.id) return { kind: 'ON_BLOCK' };
  const pooled = s.pool.find((p) => p.id === person.id);
  if (pooled) return pooled.status === 'ON_BLOCK' ? { kind: 'ON_BLOCK' } : { kind: 'POOL' };
  if (s.unsold.some((p) => p.id === person.id)) return { kind: 'UNSOLD' };
  return { kind: 'OTHER', label: STATUS_TEXT[person.status] ?? person.status };
}

export function rosterRows(roster: RosterPerson[], s: AuctionSnapshot): RosterRow[] {
  return roster.map((p) => ({ ...p, live: liveStatus(p, s) }));
}

export type RosterFilter = 'ALL' | 'CAPTAIN' | 'SOLDIER';

/** Search by name, IGN or username (case-insensitive) and filter by role. */
export function filterRoster(rows: RosterRow[], query: string, filter: RosterFilter): RosterRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter !== 'ALL' && r.kind !== filter) return false;
    if (!q) return true;
    return [r.name, r.ign, r.username].some((v) => v?.toLowerCase().includes(q));
  });
}
