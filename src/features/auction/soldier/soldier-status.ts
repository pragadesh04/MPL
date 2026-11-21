import type { AuctionSnapshot } from '@/lib/schemas/auction';

/**
 * Where a soldier stands in the live auction (§7.5), derived from the snapshot only:
 * a squad member → drafted / assigned; the lot on the block → live; the waiting pool; the unsold
 * list; otherwise not in this auction's lists (yet).
 */

type Team = AuctionSnapshot['teams'][number];
type Member = Team['members'][number];
type Listed = AuctionSnapshot['pool'][number];

export type SoldierStatus =
  | { kind: 'IN_SQUAD'; team: Team; member: Member }
  | {
      kind: 'ON_BLOCK';
      player: Listed;
      currentBid: number | null;
      nextBid: number;
      leader: Team | null;
      endsAt: string | null;
      paused: boolean;
    }
  | { kind: 'POOL'; player: Listed }
  | { kind: 'UNSOLD'; player: Listed }
  | { kind: 'UNKNOWN' };

export function soldierStatus(s: AuctionSnapshot, playerId: string): SoldierStatus {
  for (const team of s.teams) {
    const member = team.members.find((m) => m.playerId === playerId);
    if (member) return { kind: 'IN_SQUAD', team, member };
  }
  const inPool = s.pool.find((p) => p.id === playerId);
  if (s.current && s.current.playerId === playerId && inPool) {
    return {
      kind: 'ON_BLOCK',
      player: inPool,
      currentBid: s.current.currentBid,
      nextBid: s.current.nextBid,
      leader: s.teams.find((t) => t.id === s.current?.currentTeamId) ?? null,
      endsAt: s.current.endsAt,
      paused: s.status === 'AUCTION_PAUSED',
    };
  }
  if (inPool) return { kind: 'POOL', player: inPool };
  const unsold = s.unsold.find((p) => p.id === playerId);
  if (unsold) return { kind: 'UNSOLD', player: unsold };
  return { kind: 'UNKNOWN' };
}
