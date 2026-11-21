import { gamesToWin, MATCH_SCORE_MESSAGES, scoreMatch } from './matchScore';

const g = (killsA: number, killsB: number) => ({ killsA, killsB });

describe('scoreMatch', () => {
  it('gamesToWin', () => {
    expect([1, 3, 5, 7].map(gamesToWin)).toEqual([1, 2, 3, 4]);
  });

  it('decides at the majority for either side', () => {
    expect(scoreMatch([g(20, 1)], 1)).toEqual({ winsA: 1, winsB: 0, decided: 'A', problem: null });
    expect(scoreMatch([g(1, 20), g(20, 2), g(3, 20)], 3)).toEqual({
      winsA: 1,
      winsB: 2,
      decided: 'B',
      problem: null,
    });
  });

  it('is undecided with no or too few games', () => {
    expect(scoreMatch([], 3)).toEqual({ winsA: 0, winsB: 0, decided: null, problem: null });
    expect(scoreMatch([g(20, 2)], 5).decided).toBeNull();
  });

  it('flags tied games, games after the decision and too many games', () => {
    expect(scoreMatch([g(20, 2), g(7, 7)], 3).problem).toEqual({
      reason: 'TIED_GAME',
      gameIndex: 1,
    });
    expect(scoreMatch([g(20, 2), g(20, 2), g(1, 20)], 3).problem).toEqual({
      reason: 'ALREADY_DECIDED',
      gameIndex: 2,
    });
    expect(scoreMatch([g(1, 20), g(20, 1), g(1, 20), g(20, 1)], 3).problem).toEqual({
      reason: 'TOO_MANY_GAMES',
      gameIndex: 3,
    });
    // Only the first problem is reported.
    expect(scoreMatch([g(5, 5), g(5, 5)], 3).problem).toEqual({
      reason: 'TIED_GAME',
      gameIndex: 0,
    });
    expect(Object.keys(MATCH_SCORE_MESSAGES)).toHaveLength(3);
  });
});
