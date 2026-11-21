/**
 * Owner: Lane C (C3). PLAN §4.3, §4.5: a match is won by the most games (best of 1/3/5/7); a game
 * level on kills is replayed and can't be saved. The result modal and the results service both use
 * this, so the button and the server always agree.
 */

export type MatchScoreProblem = 'TOO_MANY_GAMES' | 'ALREADY_DECIDED' | 'TIED_GAME';

export interface MatchScore {
  winsA: number;
  winsB: number;
  /** Side that reached the majority, or null while undecided. */
  decided: 'A' | 'B' | null;
  /** First problem found, with the 0-based game it is about; null when the games are valid. */
  problem: { reason: MatchScoreProblem; gameIndex: number } | null;
}

export const MATCH_SCORE_MESSAGES: Record<MatchScoreProblem, string> = {
  TOO_MANY_GAMES: 'More games than the best-of allows.',
  ALREADY_DECIDED: 'The match was already decided before this game.',
  TIED_GAME: 'A tied game can’t be saved: replay it.',
};

/** Games needed to win a best-of-N match. */
export const gamesToWin = (bestOf: number): number => Math.ceil(bestOf / 2);

export function scoreMatch(
  games: readonly { killsA: number; killsB: number }[],
  bestOf: number,
): MatchScore {
  const need = gamesToWin(bestOf);
  let winsA = 0;
  let winsB = 0;
  let problem: MatchScore['problem'] = null;
  games.forEach((g, gameIndex) => {
    if (problem) return;
    if (gameIndex >= bestOf) problem = { reason: 'TOO_MANY_GAMES', gameIndex };
    else if (winsA === need || winsB === need) problem = { reason: 'ALREADY_DECIDED', gameIndex };
    else if (g.killsA === g.killsB) problem = { reason: 'TIED_GAME', gameIndex };
    else if (g.killsA > g.killsB) winsA++;
    else winsB++;
  });
  return { winsA, winsB, decided: winsA === need ? 'A' : winsB === need ? 'B' : null, problem };
}
