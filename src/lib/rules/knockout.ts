import type { MatchSource } from '../schemas/domain';
import type { TournamentSettings } from '../schemas/settings';
import type { StandingRow } from './computeStandings';

/** Owner: Lane C (C1, C3). PLAN §4.4. */

export interface KnockoutSeed {
  /** 1 = best. */
  seed: number;
  /** Known once the group is finished; null while it's still a placeholder. */
  teamId: string | null;
  /** Always set: where the seed comes from, e.g. { type: 'GROUP_POS', ref: '<groupId>:1' }. */
  source: MatchSource;
  groupId: string | null;
}

export interface SeedGroup {
  groupId: string;
  name: string;
  /** Final standings; empty while the group is still being played (placeholders only). */
  standings: StandingRow[];
}

// ─── Shape helpers ────────────────────────────────────────────────────────────────────────

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export interface KnockoutShape {
  /** Bracket size (power of two). */
  size: number;
  rounds: number;
  byes: number;
  /**
   * True when both semi-finals are real matches, so a 3rd-place match is possible. Byes only ever
   * sit in round 1 and every round-1 match has at most one, so only a 3-team bracket fails this.
   */
  semisArePlayable: boolean;
}

export function knockoutShape(qualified: number): KnockoutShape {
  if (qualified < 2) return { size: 1, rounds: 0, byes: 0, semisArePlayable: false };
  const size = nextPowerOfTwo(qualified);
  const rounds = Math.log2(size);
  return {
    size,
    rounds,
    byes: size - qualified,
    semisArePlayable: rounds >= 3 || (rounds === 2 && qualified === 4),
  };
}

/**
 * Standard bracket order: seed numbers top to bottom, paired (1 v size, …). Seeds 1 and 2 land in
 * opposite halves, 1–4 in different quarters, and so on: size 8 → [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** `Final`, `Semi-final`, `Quarter-final`, `Round of 16`, then `Round N` (1 = the final). */
export function roundName(roundsFromFinal: number, totalRounds: number): string {
  switch (roundsFromFinal) {
    case 1:
      return 'Final';
    case 2:
      return 'Semi-final';
    case 3:
      return 'Quarter-final';
    case 4:
      return 'Round of 16';
    default:
      return `Round ${totalRounds - roundsFromFinal + 1}`;
  }
}

export const THIRD_PLACE_NAME = '3rd place';

// ─── Seeding ──────────────────────────────────────────────────────────────────────────────

/**
 * Qualified = groupCount × advancePerGroup; group winners get byes first; winners face runners-up
 * from another group (A1 v B2, B1 v A2); teams from the same group go into opposite halves.
 *
 * Seeds are tiered by finishing position (all winners in group order, then all runners-up, …), so
 * winners hold the best seeds and the byes. Within each later tier the teams are permuted over the
 * tier's seed numbers so that, under the standard bracket order:
 *   1. no two teams from the same group meet in round 1, and
 *   2. each runner-up sits in the opposite half to its own group winner.
 * When that is impossible (one group, so every team shares it) the plain tier order is used
 * (A1 v A2 in the final, or A1 v A4 / A2 v A3 in the semis). The result depends only on the group order, never
 * on results, so the tree drawn at the group draw keeps its shape when the teams are filled in.
 *
 * `advancePerGroup` must be the EFFECTIVE value from `planFormat`; with one group at least 2 advance.
 */
export function seedKnockout(
  groups: SeedGroup[],
  settings: Pick<TournamentSettings, 'advancePerGroup'>,
): KnockoutSeed[] {
  const g = groups.length;
  if (g === 0) return [];
  const advance = g === 1 ? Math.max(2, settings.advancePerGroup) : settings.advancePerGroup;
  const qualified = g * advance;
  const { size } = knockoutShape(qualified);
  const order = bracketOrder(size);
  const position = new Map(order.map((seed, i) => [seed, i]));
  const half = (seed: number): number => (position.get(seed)! < size / 2 ? 0 : 1);
  const opponent = (seed: number): number => size + 1 - seed;

  /** seed number → index of the group the seed comes from. */
  const groupOfSeed = new Map<number, number>();
  /** seed number → finishing position in its group (1-based). */
  const posOfSeed = new Map<number, number>();
  for (let gi = 0; gi < g; gi++) {
    groupOfSeed.set(gi + 1, gi);
    posOfSeed.set(gi + 1, 1);
  }

  for (let pos = 2; pos <= advance; pos++) {
    const tierSeeds = Array.from({ length: g }, (_, i) => (pos - 1) * g + i + 1);
    const placed = assignTier(tierSeeds, g, pos, groupOfSeed, opponent, half);
    for (const [seed, gi] of placed) {
      groupOfSeed.set(seed, gi);
      posOfSeed.set(seed, pos);
    }
  }

  return Array.from({ length: qualified }, (_, i) => {
    const seed = i + 1;
    const group = groups[groupOfSeed.get(seed)!]!;
    const pos = posOfSeed.get(seed)!;
    return {
      seed,
      teamId: group.standings[pos - 1]?.teamId ?? null,
      source: { type: 'GROUP_POS', ref: `${group.groupId}:${pos}` },
      groupId: group.groupId,
    };
  });
}

/** Place the `pos`-th team of every group on the tier's seed numbers (see `seedKnockout`). */
function assignTier(
  tierSeeds: number[],
  groupCount: number,
  pos: number,
  groupOfSeed: ReadonlyMap<number, number>,
  opponent: (seed: number) => number,
  half: (seed: number) => number,
): Map<number, number> {
  const placed = new Map<number, number>();
  const fits = (gi: number, seed: number): boolean => {
    const opp = opponent(seed);
    if ((placed.get(opp) ?? groupOfSeed.get(opp)) === gi) return false;
    return pos !== 2 || half(seed) !== half(gi + 1);
  };
  const place = (gi: number): boolean => {
    if (gi === groupCount) return true;
    for (const seed of tierSeeds) {
      if (placed.has(seed) || !fits(gi, seed)) continue;
      placed.set(seed, gi);
      if (place(gi + 1)) return true;
      placed.delete(seed);
    }
    return false;
  };
  // Backtracking always succeeds with 2+ groups (checked for every valid format, ≤ 10 groups);
  // with one group every team shares it, so the plain tier order is used.
  return place(0) ? placed : new Map(tierSeeds.map((seed, gi) => [seed, gi] as const));
}

// ─── Bracket ──────────────────────────────────────────────────────────────────────────────

export interface BracketSlot {
  teamId: string | null;
  /** Placeholder until decided: GROUP_POS for round 1, WINNER_OF / LOSER_OF (ref = match key) later. */
  source: MatchSource | null;
}

export interface BracketMatch {
  /** Local key, e.g. 'R1-0'; the service maps keys to match ids (and refs in sources). */
  key: string;
  stage: 'KNOCKOUT' | 'THIRD_PLACE';
  /** 1 = first round. */
  round: number;
  /** Top to bottom within the round, 0-based. */
  slot: number;
  roundName: string;
  bestOf: number;
  teamA: BracketSlot;
  teamB: BracketSlot;
  isBye: boolean;
  nextKey: string | null;
  nextSlot: 'A' | 'B' | null;
}

export const bracketKey = (round: number, slot: number): string => `R${round}-${slot}`;
export const THIRD_PLACE_KEY = 'TP';

/**
 * size = nextPowerOfTwo(seeds), byes = size − seeds; bye matches resolve at once.
 *
 * Round 1 follows the standard bracket order (seed k v seed size+1−k). A missing seed is a bye: the
 * real team is always slot A, and its slot in round 2 is filled straight away (team and source
 * copied from the bye match, so labels read "Group A #1" rather than pointing at a match that is
 * never played). Later slots are WINNER_OF placeholders whose `ref` is the feeder's KEY. The 3rd-place
 * match (when enabled and both semi-finals are real) takes the semi-final losers, LOSER_OF.
 */
export function generateBracket(
  seeds: KnockoutSeed[],
  settings: Pick<TournamentSettings, 'thirdPlaceMatch' | 'knockoutBestOf' | 'finalBestOf'>,
): BracketMatch[] {
  const shape = knockoutShape(seeds.length);
  if (shape.rounds === 0) return [];
  const { size, rounds } = shape;
  const bySeed = new Map(seeds.map((s) => [s.seed, s]));
  const order = bracketOrder(size);
  const bestOf = (round: number): number =>
    round === rounds ? settings.finalBestOf : settings.knockoutBestOf;
  const link = (round: number, slot: number): Pick<BracketMatch, 'nextKey' | 'nextSlot'> =>
    round === rounds
      ? { nextKey: null, nextSlot: null }
      : {
          nextKey: bracketKey(round + 1, Math.floor(slot / 2)),
          nextSlot: slot % 2 === 0 ? 'A' : 'B',
        };

  const out: BracketMatch[] = [];
  let previous: BracketMatch[] = [];
  for (let slot = 0; slot < size / 2; slot++) {
    // The better seed is always first in a pair and always exists, so a bye is always slot B.
    const a = bySeed.get(order[slot * 2]!)!;
    const b = bySeed.get(order[slot * 2 + 1]!);
    const match: BracketMatch = {
      key: bracketKey(1, slot),
      stage: 'KNOCKOUT',
      round: 1,
      slot,
      roundName: roundName(rounds, rounds),
      bestOf: bestOf(1),
      teamA: { teamId: a.teamId, source: a.source },
      teamB: { teamId: b?.teamId ?? null, source: b?.source ?? null },
      isBye: !b,
      ...link(1, slot),
    };
    previous.push(match);
  }
  out.push(...previous);

  for (let round = 2; round <= rounds; round++) {
    const current: BracketMatch[] = [];
    for (let slot = 0; slot < previous.length / 2; slot++) {
      const feed = (feeder: BracketMatch): BracketSlot =>
        feeder.isBye
          ? { ...feeder.teamA }
          : { teamId: null, source: { type: 'WINNER_OF', ref: feeder.key } };
      current.push({
        key: bracketKey(round, slot),
        stage: 'KNOCKOUT',
        round,
        slot,
        roundName: roundName(rounds - round + 1, rounds),
        bestOf: bestOf(round),
        teamA: feed(previous[slot * 2]!),
        teamB: feed(previous[slot * 2 + 1]!),
        isBye: false,
        ...link(round, slot),
      });
    }
    out.push(...current);
    previous = current;
  }

  if (settings.thirdPlaceMatch && shape.semisArePlayable) {
    const semis = out.filter((m) => m.round === rounds - 1);
    out.push({
      key: THIRD_PLACE_KEY,
      stage: 'THIRD_PLACE',
      round: rounds,
      slot: 1,
      roundName: THIRD_PLACE_NAME,
      bestOf: settings.knockoutBestOf,
      teamA: { teamId: null, source: { type: 'LOSER_OF', ref: semis[0]!.key } },
      teamB: { teamId: null, source: { type: 'LOSER_OF', ref: semis[1]!.key } },
      isBye: false,
      nextKey: null,
      nextSlot: null,
    });
  }
  return out;
}
