import type { AuctionSnapshot } from '@/lib/schemas/auction';

/**
 * Ticker data for the big screen (§7.7), derived from the snapshot's squads.
 *
 * The snapshot doesn't carry a sale time, so "latest" is ordered by the id of the winning bid in
 * `recentBids` (newest first); sales whose winning bid has scrolled out of that window come after,
 * most expensive first.
 */

type Team = AuctionSnapshot['teams'][number];

export interface Sale {
  playerId: string;
  name: string;
  price: number;
  team: Team;
}

export function auctionSales(s: AuctionSnapshot): Sale[] {
  const winningBidId = new Map<string, number>();
  for (const b of s.recentBids) {
    const key = `${b.playerId}:${b.teamId}:${b.amount}`;
    if (!winningBidId.has(key)) winningBidId.set(key, b.id);
  }
  const sales = s.teams.flatMap((team) =>
    team.members
      .filter((m) => m.acquiredVia === 'AUCTION')
      .map((m) => ({
        sale: { playerId: m.playerId, name: m.name, price: m.price, team },
        bidId: winningBidId.get(`${m.playerId}:${team.id}:${m.price}`) ?? 0,
      })),
  );
  return sales.sort((a, b) => b.bidId - a.bidId || b.sale.price - a.sale.price).map((x) => x.sale);
}

export function lastSales(s: AuctionSnapshot, count = 5): Sale[] {
  return auctionSales(s).slice(0, count);
}

export function topBuy(s: AuctionSnapshot): Sale | null {
  let best: Sale | null = null;
  for (const sale of auctionSales(s)) if (!best || sale.price > best.price) best = sale;
  return best;
}

/** Teams by MP left, most first (ties keep team order). */
export function purseLeaderboard(s: AuctionSnapshot): Team[] {
  return [...s.teams].sort(
    (a, b) => b.purseRemaining - a.purseRemaining || a.sortOrder - b.sortOrder,
  );
}
