import type { MatchStage } from '../schemas/enums';

/** Owner: Lane C (C1, C2, C3). PLAN §4.6. */

export interface OrderableMatch {
  id: string;
  stage: MatchStage;
  isBye: boolean;
  /** Group stage. */
  groupName?: string | null;
  matchday?: number | null;
  /** Knockout. */
  round?: number | null;
  slot?: number | null;
}

/**
 * Running order M1, M2… : group stage matchday by matchday with groups interleaved (A-MD1,
 * B-MD1, A-MD2…); knockout round by round, top half then bottom half; the 3rd-place match comes
 * before the final. Byes get no number. `startAt` continues numbering after earlier stages.
 *
 * Within a matchday the groups take turns match by match (A's 1st, B's 1st, A's 2nd, B's 2nd…), so
 * with two or more groups no team ever plays two matches in a row. A group's matches inside one
 * matchday keep their input order. The result lists every input match, in input order.
 */
export function assignMatchOrder(
  matches: OrderableMatch[],
  startAt = 1,
): { id: string; matchNumber: number | null }[] {
  const playable = matches.filter((m) => !m.isBye);

  // Group stage: rank each match within its (matchday, group), then interleave the groups.
  const seen = new Map<string, number>();
  const group = playable
    .filter((m) => m.stage === 'GROUP')
    .map((m) => {
      const matchday = m.matchday ?? 0;
      const groupName = m.groupName ?? '';
      const k = `${matchday}|${groupName}`;
      const turn = seen.get(k) ?? 0;
      seen.set(k, turn + 1);
      return { id: m.id, keys: [matchday, turn], groupName };
    })
    // (matchday, turn, group) is unique, so the order is total.
    .sort((a, b) => compare(a.keys, b.keys) || a.groupName.localeCompare(b.groupName));

  // Knockout: rounds in order, top to bottom; 3rd place just before the final.
  const knockout = playable
    .filter((m) => m.stage === 'KNOCKOUT')
    .map((m) => ({ id: m.id, keys: [m.round ?? 0, m.slot ?? 0] }))
    .sort((a, b) => compare(a.keys, b.keys));
  const finalRound = Math.max(0, ...knockout.map((m) => m.keys[0]!));
  const beforeFinal = knockout.filter((m) => m.keys[0]! < finalRound);
  const finals = knockout.filter((m) => m.keys[0] === finalRound);
  const thirdPlace = playable.filter((m) => m.stage === 'THIRD_PLACE');

  const numbered = new Map<string, number>();
  [...group, ...beforeFinal, ...thirdPlace, ...finals].forEach((m, i) =>
    numbered.set(m.id, startAt + i),
  );
  return matches.map((m) => ({ id: m.id, matchNumber: numbered.get(m.id) ?? null }));
}

/** Lexicographic comparison of equal-length number tuples. */
function compare(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - y[i]!;
    if (d !== 0) return d;
  }
  return 0;
}

export interface ReorderableMatch {
  id: string;
  matchNumber: number | null;
  stage: MatchStage;
  status: 'SCHEDULED' | 'LIVE' | 'DONE';
  /** Knockout round (1 = first); ignored for group matches. */
  round?: number | null;
}

export type ReorderBlockReason =
  'UNKNOWN_MATCH' | 'MIXED_STAGES' | 'NOT_ALL_INCLUDED' | 'ALREADY_PLAYED' | 'BREAKS_ROUND_ORDER';

export type ReorderResult =
  | { ok: true; numbers: { id: string; matchNumber: number }[] }
  | { ok: false; reason: ReorderBlockReason };

/** Human text for each reorder refusal (the UI shows it, the API returns it). */
export const REORDER_MESSAGES: Record<ReorderBlockReason, string> = {
  UNKNOWN_MATCH: 'One of those matches does not exist or has no number.',
  MIXED_STAGES: 'Matches can only be reordered within one stage.',
  NOT_ALL_INCLUDED: 'Send every unplayed match of the stage, each once.',
  ALREADY_PLAYED: 'Only unplayed matches can be moved.',
  BREAKS_ROUND_ORDER: 'A knockout match cannot come before the round that feeds it.',
};

/** Knockout rank for the order check: rounds in order, 3rd place just before the final. */
function knockoutRank(m: ReorderableMatch, finalRound: number): number {
  const round = m.round ?? 0;
  return m.stage === 'THIRD_PLACE' ? finalRound - 0.5 : round;
}

/**
 * The order is kept per stage (§4.6): the knockout and 3rd-place matches share one stage block.
 * Group matches stay in the group block, so a knockout match can never come before the group stage.
 */
export const orderBlock = (stage: MatchStage): 'GROUP' | 'KNOCKOUT' =>
  stage === 'GROUP' ? 'GROUP' : 'KNOCKOUT';

/**
 * Organisers reorder UNPLAYED matches within one stage (§4.6, §7.10a). `orderedIds` lists every
 * unplayed (SCHEDULED) match of that stage in the new order. The match numbers those matches held
 * are handed out again in the new order, so played / live matches and the other stage keep their
 * numbers and the stage's block of numbers never moves. In the knockout, matches may only swap
 * within a round (the new order must keep rounds ascending, 3rd place before the final), so a
 * match never comes before the matches that decide its teams.
 */
export function reorderWithinStage(
  matches: ReorderableMatch[],
  orderedIds: string[],
): ReorderResult {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const chosen = orderedIds
    .map((id) => byId.get(id))
    .filter((m): m is ReorderableMatch => m !== undefined && m.matchNumber !== null);
  if (chosen.length === 0 || chosen.length !== orderedIds.length) {
    return { ok: false, reason: 'UNKNOWN_MATCH' };
  }
  if (chosen.some((m) => m.status !== 'SCHEDULED')) return { ok: false, reason: 'ALREADY_PLAYED' };
  const block = orderBlock(chosen[0]!.stage);
  if (chosen.some((m) => orderBlock(m.stage) !== block)) {
    return { ok: false, reason: 'MIXED_STAGES' };
  }
  const unplayed = matches.filter(
    (m) => m.matchNumber !== null && m.status === 'SCHEDULED' && orderBlock(m.stage) === block,
  );
  if (unplayed.length !== chosen.length || new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, reason: 'NOT_ALL_INCLUDED' };
  }
  if (block === 'KNOCKOUT') {
    const finalRound = Math.max(...matches.map((m) => m.round ?? 0));
    const ranks = chosen.map((m) => knockoutRank(m, finalRound));
    if (ranks.some((r, i) => i > 0 && r < ranks[i - 1]!)) {
      return { ok: false, reason: 'BREAKS_ROUND_ORDER' };
    }
  }
  const slots = unplayed.map((m) => m.matchNumber!).sort((a, b) => a - b);
  return { ok: true, numbers: chosen.map((m, i) => ({ id: m.id, matchNumber: slots[i]! })) };
}
