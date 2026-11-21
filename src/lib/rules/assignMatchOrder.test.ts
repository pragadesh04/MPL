import {
  assignMatchOrder,
  orderBlock,
  REORDER_MESSAGES,
  reorderWithinStage,
  type OrderableMatch,
  type ReorderableMatch,
} from './assignMatchOrder';

const g = (id: string, groupName: string, matchday: number): OrderableMatch => ({
  id,
  stage: 'GROUP',
  isBye: false,
  groupName,
  matchday,
});
const ko = (id: string, round: number, slot: number, isBye = false): OrderableMatch => ({
  id,
  stage: 'KNOCKOUT',
  isBye,
  round,
  slot,
});

const numbers = (
  res: { id: string; matchNumber: number | null }[],
): Record<string, number | null> => Object.fromEntries(res.map((r) => [r.id, r.matchNumber]));

describe('assignMatchOrder', () => {
  it('interleaves groups match by match within each matchday', () => {
    const input = [
      g('a1', 'A', 1),
      g('a2', 'A', 1),
      g('a3', 'A', 2),
      g('b1', 'B', 1),
      g('b2', 'B', 1),
      g('b3', 'B', 2),
    ];
    expect(numbers(assignMatchOrder(input))).toEqual({ a1: 1, b1: 2, a2: 3, b2: 4, a3: 5, b3: 6 });
  });

  it('returns every match in input order', () => {
    const input = [g('b1', 'B', 1), g('a1', 'A', 1)];
    expect(assignMatchOrder(input).map((r) => r.id)).toEqual(['b1', 'a1']);
  });

  it('knockout comes after the group stage: rounds in order, top to bottom', () => {
    const input = [ko('f', 2, 0), ko('s2', 1, 1), ko('s1', 1, 0), g('a1', 'A', 1)];
    expect(numbers(assignMatchOrder(input))).toEqual({ a1: 1, s1: 2, s2: 3, f: 4 });
  });

  it('byes get no number and the 3rd-place match comes before the final', () => {
    const input: OrderableMatch[] = [
      ko('q0', 1, 0, true),
      ko('q1', 1, 1),
      ko('q2', 1, 2, true),
      ko('q3', 1, 3),
      ko('s0', 2, 0),
      ko('s1', 2, 1),
      ko('f', 3, 0),
      { id: 'tp', stage: 'THIRD_PLACE', isBye: false, round: 3, slot: 1 },
    ];
    expect(numbers(assignMatchOrder(input, 13))).toEqual({
      q0: null,
      q1: 13,
      q2: null,
      q3: 14,
      s0: 15,
      s1: 16,
      tp: 17,
      f: 18,
    });
  });

  it('tolerates missing optional fields', () => {
    const input: OrderableMatch[] = [
      { id: 'x', stage: 'GROUP', isBye: false },
      { id: 'y', stage: 'GROUP', isBye: false, groupName: null, matchday: null },
      { id: 'k', stage: 'KNOCKOUT', isBye: false },
      { id: 'k2', stage: 'KNOCKOUT', isBye: false, round: null, slot: null },
    ];
    expect(numbers(assignMatchOrder(input))).toEqual({ x: 1, y: 2, k: 3, k2: 4 });
  });

  it('handles an empty list', () => {
    expect(assignMatchOrder([])).toEqual([]);
  });
});

describe('reorderWithinStage', () => {
  const m = (
    id: string,
    matchNumber: number | null,
    stage: ReorderableMatch['stage'] = 'GROUP',
    status: ReorderableMatch['status'] = 'SCHEDULED',
    round: number | null = null,
  ): ReorderableMatch => ({ id, matchNumber, stage, status, round });

  const all: ReorderableMatch[] = [
    m('g1', 1, 'GROUP', 'DONE'),
    m('g2', 2),
    m('g3', 3, 'GROUP', 'LIVE'),
    m('g4', 4),
    m('g5', 5),
    m('s1', 6, 'KNOCKOUT', 'SCHEDULED', 1),
    m('s2', 7, 'KNOCKOUT', 'SCHEDULED', 1),
    m('tp', 8, 'THIRD_PLACE', 'SCHEDULED', 2),
    m('f', 9, 'KNOCKOUT', 'SCHEDULED', 2),
    m('bye', null, 'KNOCKOUT', 'DONE', 1),
  ];

  it('hands the unplayed numbers out again in the new order', () => {
    expect(reorderWithinStage(all, ['g5', 'g2', 'g4'])).toEqual({
      ok: true,
      numbers: [
        { id: 'g5', matchNumber: 2 },
        { id: 'g2', matchNumber: 4 },
        { id: 'g4', matchNumber: 5 },
      ],
    });
  });

  it('allows swaps within a knockout round', () => {
    const res = reorderWithinStage(all, ['s2', 's1', 'tp', 'f']);
    expect(res).toEqual({
      ok: true,
      numbers: [
        { id: 's2', matchNumber: 6 },
        { id: 's1', matchNumber: 7 },
        { id: 'tp', matchNumber: 8 },
        { id: 'f', matchNumber: 9 },
      ],
    });
  });

  it.each([
    [[], 'UNKNOWN_MATCH'],
    [['nope', 'g2'], 'UNKNOWN_MATCH'],
    [['bye'], 'UNKNOWN_MATCH'],
    [['g1', 'g2', 'g4', 'g5'], 'ALREADY_PLAYED'],
    [['g3'], 'ALREADY_PLAYED'],
    [['g2', 'g4', 'g5', 's1'], 'MIXED_STAGES'],
    [['g2', 'g4'], 'NOT_ALL_INCLUDED'],
    [['g2', 'g4', 'g4'], 'NOT_ALL_INCLUDED'],
    [['s1', 's2', 'f', 'tp'], 'BREAKS_ROUND_ORDER'],
    [['f', 's1', 's2', 'tp'], 'BREAKS_ROUND_ORDER'],
  ] as const)('refuses %j: %s', (ids, reason) => {
    expect(reorderWithinStage(all, [...ids])).toEqual({ ok: false, reason });
    expect(REORDER_MESSAGES[reason]).toBeTruthy();
  });

  it('treats knockout and 3rd place as one stage block', () => {
    expect(orderBlock('GROUP')).toBe('GROUP');
    expect(orderBlock('KNOCKOUT')).toBe('KNOCKOUT');
    expect(orderBlock('THIRD_PLACE')).toBe('KNOCKOUT');
  });

  it('works when rounds are missing', () => {
    const ms = [m('a', 1, 'KNOCKOUT'), m('b', 2, 'KNOCKOUT')];
    expect(reorderWithinStage(ms, ['b', 'a'])).toMatchObject({ ok: true });
  });
});
