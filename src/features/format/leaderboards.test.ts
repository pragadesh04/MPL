import { computeLeaderboards, type StatLine } from './leaderboards';
import type { PlayerView } from './types';

const p = (
  id: string,
  soldPrice: number,
  acquiredVia: PlayerView['acquiredVia'] = 'AUCTION',
): PlayerView => ({
  id,
  teamId: 't',
  name: id.toUpperCase(),
  ign: null,
  photoUrl: null,
  soldPrice,
  acquiredVia,
});
const s = (playerId: string, kills: number, deaths: number, mvp = false): StatLine => ({
  playerId,
  kills,
  deaths,
  mvp,
});

const players = [p('a', 10), p('b', 4), p('c', 0, 'AUTO_ALLOCATED'), p('d', 20), p('e', 2)];
const stats = [
  s('a', 20, 5, true),
  s('a', 10, 5),
  s('b', 12, 0, true),
  s('c', 15, 3),
  s('d', 0, 9),
  s('b', 3, 3, true),
];

describe('computeLeaderboards', () => {
  const lb = computeLeaderboards(players, stats);

  it('most kills, with a readable detail line', () => {
    expect(lb.kills.map((r) => [r.player.id, r.value])).toEqual([
      ['a', 30],
      ['b', 15],
      ['c', 15],
    ]);
    expect(lb.kills[0]!.detail).toBe('30 K · 10 D · 2 matches');
    expect(lb.kills[2]!.detail).toBe('15 K · 3 D · 1 match');
  });

  it('best K/D treats 0 deaths as 1; ties go by name', () => {
    // b: 15 kills / 3 deaths, c: 15 / 3, a: 30 / 10.
    expect(lb.kd.map((r) => [r.player.id, r.value])).toEqual([
      ['b', 5],
      ['c', 5],
      ['a', 3],
    ]);
    expect(computeLeaderboards([p('z', 1)], [s('z', 4, 0)]).kd[0]!.value).toBe(4);
  });

  it('MVP count, most expensive and best value (kills per MP, paid soldiers only)', () => {
    expect(lb.mvps.map((r) => [r.player.id, r.value])).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
    expect(lb.expensive.map((r) => r.player.id)).toEqual(['d', 'a', 'b', 'e']);
    expect(lb.value.map((r) => [r.player.id, r.value])).toEqual([
      ['b', 3.75],
      ['a', 3],
    ]);
  });

  it('limits to the top N and copes with no stats', () => {
    expect(computeLeaderboards(players, stats, 1).kills).toHaveLength(1);
    expect(computeLeaderboards(players, [])).toMatchObject({
      kills: [],
      kd: [],
      mvps: [],
      value: [],
    });
  });
});
