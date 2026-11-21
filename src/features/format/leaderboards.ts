import type { PlayerView } from './types';

/**
 * Stats leaderboards (PLAN §7.13): most kills, best K/D, MVP count, most expensive soldier and
 * best-value buy (kills per MP). Computed from per-match soldier stats; nothing is stored.
 */
export interface StatLine {
  playerId: string;
  kills: number;
  deaths: number;
  mvp: boolean;
}

export interface LeaderRow {
  player: PlayerView;
  /** The number ranked on, e.g. kills, K/D (2 dp) or kills per MP (2 dp). */
  value: number;
  /** Small print, e.g. "42 K · 18 D · 6 matches". */
  detail: string;
}

export interface Leaderboards {
  kills: LeaderRow[];
  kd: LeaderRow[];
  mvps: LeaderRow[];
  expensive: LeaderRow[];
  value: LeaderRow[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeLeaderboards(
  players: readonly PlayerView[],
  stats: readonly StatLine[],
  top = 10,
): Leaderboards {
  const totals = new Map<
    string,
    { kills: number; deaths: number; mvps: number; matches: number }
  >();
  for (const s of stats) {
    const t = totals.get(s.playerId) ?? { kills: 0, deaths: 0, mvps: 0, matches: 0 };
    t.kills += s.kills;
    t.deaths += s.deaths;
    t.mvps += s.mvp ? 1 : 0;
    t.matches += 1;
    totals.set(s.playerId, t);
  }
  const withStats = players.flatMap((player) => {
    const t = totals.get(player.id);
    return t ? [{ player, ...t }] : [];
  });
  const line = (t: { kills: number; deaths: number; matches: number }): string =>
    `${t.kills} K · ${t.deaths} D · ${t.matches} match${t.matches === 1 ? '' : 'es'}`;
  const rank = <T>(rows: T[], key: (r: T) => number, tie: (r: T) => string): T[] =>
    [...rows].sort((a, b) => key(b) - key(a) || tie(a).localeCompare(tie(b))).slice(0, top);

  return {
    kills: rank(
      withStats.filter((r) => r.kills > 0),
      (r) => r.kills,
      (r) => r.player.name,
    ).map((r) => ({
      player: r.player,
      value: r.kills,
      detail: line(r),
    })),
    kd: rank(
      withStats.filter((r) => r.kills > 0),
      (r) => r.kills / Math.max(1, r.deaths),
      (r) => r.player.name,
    ).map((r) => ({
      player: r.player,
      value: round2(r.kills / Math.max(1, r.deaths)),
      detail: line(r),
    })),
    mvps: rank(
      withStats.filter((r) => r.mvps > 0),
      (r) => r.mvps,
      (r) => r.player.name,
    ).map((r) => ({
      player: r.player,
      value: r.mvps,
      detail: line(r),
    })),
    expensive: rank(
      players.filter((p) => p.acquiredVia === 'AUCTION' && p.soldPrice > 0),
      (p) => p.soldPrice,
      (p) => p.name,
    ).map((p) => ({ player: p, value: p.soldPrice, detail: 'Bought in the auction' })),
    // Kills per MP spent; free (allocated) soldiers have no price to divide by, so they're left out.
    value: rank(
      withStats.filter((r) => r.kills > 0 && r.player.soldPrice > 0),
      (r) => r.kills / r.player.soldPrice,
      (r) => r.player.name,
    ).map((r) => ({
      player: r.player,
      value: round2(r.kills / r.player.soldPrice),
      detail: `${r.kills} kills for ${r.player.soldPrice} MP`,
    })),
  };
}
