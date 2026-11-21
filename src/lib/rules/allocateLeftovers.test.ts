import { allocateLeftovers, type AllocationTeam } from './allocateLeftovers';
import { afterRoundEnds, resolveUnsoldLot } from './unsoldPolicy';

const team = (
  teamId: string,
  squadSize: number,
  purseRemaining: number,
  sortOrder: number,
): AllocationTeam => ({ teamId, squadSize, purseRemaining, sortOrder });

describe('allocateLeftovers', () => {
  it('gives the soldier to the team with the fewest players (§3.4 example)', () => {
    // You spent everything on A and have 2 players; the others are full except one slot each.
    const teams = [team('you', 2, 0, 0), team('t2', 5, 10, 1), team('t3', 5, 4, 2)];
    const result = allocateLeftovers([{ playerId: 'B', basePrice: 3 }], teams, {
      maxPlayersPerTeam: 6,
    });
    expect(result).toEqual({
      steps: [{ step: 1, playerId: 'B', teamId: 'you', reason: 'Fewest players: 2' }],
      unplaced: [],
    });
  });

  it('places the strongest (highest base price) soldiers first', () => {
    const teams = [team('a', 2, 10, 0), team('b', 3, 10, 1)];
    const { steps } = allocateLeftovers(
      [
        { playerId: 'weak', basePrice: 1 },
        { playerId: 'strong', basePrice: 9 },
      ],
      teams,
      { maxPlayersPerTeam: 6 },
    );
    expect(steps.map((s) => [s.playerId, s.teamId])).toEqual([
      ['strong', 'a'],
      ['weak', 'a'],
    ]);
    expect(steps[1]?.reason).toBe('Fewest players: 3 · lowest MP left: 10 · team order');
  });

  it('breaks a squad-size tie by lowest MP left', () => {
    const teams = [team('rich', 3, 30, 0), team('poor', 3, 2, 1)];
    const { steps } = allocateLeftovers([{ playerId: 'x', basePrice: 1 }], teams, {
      maxPlayersPerTeam: 6,
    });
    expect(steps[0]).toMatchObject({
      teamId: 'poor',
      reason: 'Fewest players: 3 · lowest MP left: 2',
    });
  });

  it('breaks a full tie by team order', () => {
    const teams = [team('second', 3, 5, 2), team('first', 3, 5, 1)];
    const { steps } = allocateLeftovers([{ playerId: 'x', basePrice: 1 }], teams, {
      maxPlayersPerTeam: 6,
    });
    expect(steps[0]).toMatchObject({
      teamId: 'first',
      reason: 'Fewest players: 3 · lowest MP left: 5 · team order',
    });
  });

  it('skips full teams and reports soldiers nobody has room for', () => {
    const teams = [team('full', 4, 0, 0), team('one-left', 3, 0, 1)];
    const result = allocateLeftovers(
      [
        { playerId: 'p1', basePrice: 5 },
        { playerId: 'p2', basePrice: 4 },
      ],
      teams,
      { maxPlayersPerTeam: 4 },
    );
    expect(result.steps).toEqual([
      { step: 1, playerId: 'p1', teamId: 'one-left', reason: 'Fewest players: 3' },
    ]);
    expect(result.unplaced).toEqual(['p2']);
  });

  it('keeps input order for equal base prices and does not mutate its inputs', () => {
    const teams = [team('a', 1, 0, 0), team('b', 1, 0, 1)];
    const soldiers = [
      { playerId: 'first', basePrice: 2 },
      { playerId: 'second', basePrice: 2 },
    ];
    const { steps } = allocateLeftovers(soldiers, teams, { maxPlayersPerTeam: 6 });
    expect(steps.map((s) => [s.playerId, s.teamId])).toEqual([
      ['first', 'a'],
      ['second', 'b'],
    ]);
    expect(teams[0]?.squadSize).toBe(1);
    expect(soldiers[0]?.playerId).toBe('first');
  });

  it('handles nothing to allocate', () => {
    expect(allocateLeftovers([], [team('a', 1, 0, 0)], { maxPlayersPerTeam: 6 })).toEqual({
      steps: [],
      unplaced: [],
    });
  });
});

describe('resolveUnsoldLot', () => {
  const teams = [team('b', 2, 0, 2), team('a', 6, 0, 1), team('c', 3, 0, 3)];

  it('goes to the unsold list with REAUCTION_THEN_ALLOCATE and ADMIN_DECIDES', () => {
    for (const unsoldPolicy of ['REAUCTION_THEN_ALLOCATE', 'ADMIN_DECIDES'] as const) {
      expect(
        resolveUnsoldLot({
          settings: { unsoldPolicy, maxPlayersPerTeam: 6 },
          teams,
          random: () => 0,
        }),
      ).toEqual({ type: 'UNSOLD_LIST', reason: 'NO_BIDS' });
    }
  });

  it('sends the soldier to a random squad with space under RANDOM_SQUAD', () => {
    const settings = { unsoldPolicy: 'RANDOM_SQUAD' as const, maxPlayersPerTeam: 6 };
    // Eligible in team order: b (2), c (3). 'a' is full.
    expect(resolveUnsoldLot({ settings, teams, random: () => 0 })).toEqual({
      type: 'RANDOM_SQUAD',
      teamId: 'b',
    });
    expect(resolveUnsoldLot({ settings, teams, random: () => 0.99 })).toEqual({
      type: 'RANDOM_SQUAD',
      teamId: 'c',
    });
    expect(resolveUnsoldLot({ settings, teams, random: () => 1 })).toEqual({
      type: 'RANDOM_SQUAD',
      teamId: 'c',
    });
  });

  it('reports "No space" when every squad is full, whatever the policy', () => {
    const full = [team('a', 6, 0, 1)];
    expect(
      resolveUnsoldLot({
        settings: { unsoldPolicy: 'RANDOM_SQUAD', maxPlayersPerTeam: 6 },
        teams: full,
        random: () => 0,
      }),
    ).toEqual({ type: 'UNSOLD_LIST', reason: 'NO_SPACE' });
  });
});

describe('afterRoundEnds', () => {
  const reauction = { unsoldPolicy: 'REAUCTION_THEN_ALLOCATE' as const, unsoldReauctionRounds: 1 };

  it('completes when nobody is unsold', () => {
    expect(afterRoundEnds({ settings: reauction, round: 1, unsoldCount: 0 })).toEqual({
      type: 'COMPLETE',
    });
  });

  it('runs the re-auction rounds, then allocates', () => {
    expect(afterRoundEnds({ settings: reauction, round: 1, unsoldCount: 3 })).toEqual({
      type: 'REAUCTION_ROUND',
      round: 2,
    });
    expect(afterRoundEnds({ settings: reauction, round: 2, unsoldCount: 3 })).toEqual({
      type: 'ALLOCATE',
    });
  });

  it('allocates straight away with zero re-auction rounds', () => {
    const none = { ...reauction, unsoldReauctionRounds: 0 };
    expect(afterRoundEnds({ settings: none, round: 1, unsoldCount: 2 })).toEqual({
      type: 'ALLOCATE',
    });
  });

  it('waits for an organiser under RANDOM_SQUAD and ADMIN_DECIDES', () => {
    for (const unsoldPolicy of ['RANDOM_SQUAD', 'ADMIN_DECIDES'] as const) {
      expect(
        afterRoundEnds({
          settings: { unsoldPolicy, unsoldReauctionRounds: 1 },
          round: 1,
          unsoldCount: 2,
        }),
      ).toEqual({ type: 'WAIT_FOR_ADMIN' });
    }
  });
});
