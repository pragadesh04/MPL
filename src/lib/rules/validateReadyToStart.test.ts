import { DEFAULT_SETTINGS } from '../schemas/settings';
import {
  backgroundContrast,
  colorDistance,
  findDuplicatePeople,
  findTooSimilarColor,
  validateReadyToStart,
  type ReadyCaptain,
  type ReadyCheckId,
  type ReadySoldier,
  type ReadyToStartInput,
} from './validateReadyToStart';

let n = 0;
const cap = (over: Partial<ReadyCaptain> = {}): ReadyCaptain => {
  n++;
  const colours = ['#e63946', '#4361ee', '#2a9d4f', '#fcbf49', '#7b2ff7', '#f77f00'];
  return {
    leaderId: `l${n}`,
    name: `Captain ${n}`,
    userId: `u-cap-${n}`,
    approval: 'APPROVED',
    purseTotal: 50,
    ign: `cap${n}`,
    phone: null,
    team: { name: `Team ${n}`, shortName: `T${n}`, color: colours[n % colours.length]! },
    ...over,
  };
};
const sol = (over: Partial<ReadySoldier> = {}): ReadySoldier => {
  n++;
  return {
    playerId: `p${n}`,
    name: `Soldier ${n}`,
    userId: null,
    status: 'POOL',
    basePrice: 1,
    ign: `sol${n}`,
    phone: null,
    ...over,
  };
};

/** 2 captains (min 4, max 6) need 6–10 soldiers. */
function ready(): ReadyToStartInput {
  const c1 = cap({ team: { name: 'Red', shortName: 'RED', color: '#e63946' } });
  const c2 = cap({ team: { name: 'Blue', shortName: 'BLU', color: '#4361ee' } });
  return {
    settings: DEFAULT_SETTINGS,
    captains: [c1, c2],
    soldiers: Array.from({ length: 6 }, () => sol()),
  };
}

const failing = (input: ReadyToStartInput): ReadyCheckId[] =>
  validateReadyToStart(input)
    .checks.filter((c) => !c.ok)
    .map((c) => c.id);

describe('validateReadyToStart (PLAN §3.5)', () => {
  it('passes a complete tournament and lists every check in order', () => {
    const r = validateReadyToStart(ready());
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual([
      'MIN_CAPTAINS',
      'CAPTAINS_LINKED_AND_TEAMS_READY',
      'TEAM_NAMES_UNIQUE',
      'TEAM_COLOURS_DISTINCT',
      'NONE_PENDING',
      'BASE_PRICES',
      'CAPACITY',
      'SQUAD_SIZE_SANE',
      'NO_DUPLICATE_PEOPLE',
      'PURSES_COVER_BASE_PRICE',
    ]);
  });

  it('needs at least 2 approved captains (rejected / pending ones do not count) and at most 32', () => {
    const input = ready();
    input.captains = [input.captains[0]!, cap({ approval: 'REJECTED' })];
    input.soldiers = input.soldiers.slice(0, 3);
    expect(failing(input)).toContain('MIN_CAPTAINS');

    const many = ready();
    many.captains = Array.from({ length: 33 }, (_, i) =>
      cap({
        team: {
          name: `T${i}`,
          shortName: `T${i}`,
          color: `#${(i * 7919).toString(16).padStart(6, '0').slice(0, 6)}`,
        },
      }),
    );
    const r = validateReadyToStart(many);
    expect(r.checks.find((c) => c.id === 'MIN_CAPTAINS')).toMatchObject({ ok: false });
    expect(r.checks[0]!.message).toMatch(/at most 32/);
  });

  it('flags captains without a linked account or a team', () => {
    const input = ready();
    input.captains[0] = { ...input.captains[0]!, userId: null };
    input.captains[1] = { ...input.captains[1]!, team: null };
    const check = validateReadyToStart(input).checks.find(
      (c) => c.id === 'CAPTAINS_LINKED_AND_TEAMS_READY',
    )!;
    expect(check.ok).toBe(false);
    expect(check.offenders).toEqual([input.captains[0]!.leaderId, input.captains[1]!.leaderId]);
    expect(check.fixStep).toBe('teams');
  });

  it('flags duplicate team names case-insensitively', () => {
    const input = ready();
    input.captains[1] = {
      ...input.captains[1]!,
      team: { name: ' red ', shortName: 'RD2', color: '#4361ee' },
    };
    expect(failing(input)).toEqual(['TEAM_NAMES_UNIQUE']);
  });

  it('flags colours that are too similar and colours too dark to read', () => {
    const similar = ready();
    similar.captains[1] = {
      ...similar.captains[1]!,
      team: { name: 'Crimson', shortName: 'CRM', color: '#e33a48' },
    };
    const c = validateReadyToStart(similar).checks.find((x) => x.id === 'TEAM_COLOURS_DISTINCT')!;
    expect(c.ok).toBe(false);
    expect(c.message).toMatch(/too similar/);

    const dark = ready();
    dark.captains[1] = {
      ...dark.captains[1]!,
      team: { name: 'Night', shortName: 'NGT', color: '#0b0d0a' },
    };
    const d = validateReadyToStart(dark).checks.find((x) => x.id === 'TEAM_COLOURS_DISTINCT')!;
    expect(d.ok).toBe(false);
    expect(d.message).toMatch(/too dark/);
  });

  it('blocks while anyone is pending (captain or soldier)', () => {
    const input = ready();
    input.captains.push(cap({ approval: 'PENDING', team: null }));
    input.soldiers.push(sol({ status: 'PENDING_APPROVAL' }));
    const check = validateReadyToStart(input).checks.find((c) => c.id === 'NONE_PENDING')!;
    expect(check.ok).toBe(false);
    expect(check.offenders).toHaveLength(2);
    expect(check.message).toMatch(/2 people/);
  });

  it('enforces the minimum base price on approved soldiers only', () => {
    const input = ready();
    input.settings = { ...DEFAULT_SETTINGS, minBasePrice: 2 };
    input.soldiers = input.soldiers.map((s, i) => ({ ...s, basePrice: i === 0 ? 1 : 2 }));
    input.soldiers.push(sol({ status: 'REJECTED', basePrice: 0 }));
    const check = validateReadyToStart(input).checks.find((c) => c.id === 'BASE_PRICES')!;
    expect(check.ok).toBe(false);
    expect(check.offenders).toEqual([input.soldiers[0]!.playerId]);
  });

  it('checks the capacity bounds both ways', () => {
    const few = ready();
    few.soldiers = few.soldiers.slice(0, 5);
    expect(failing(few)).toEqual(['CAPACITY']);
    expect(validateReadyToStart(few).checks.find((c) => c.id === 'CAPACITY')!.fixStep).toBe(
      'people',
    );

    const many = ready();
    many.soldiers = Array.from({ length: 11 }, () => sol());
    expect(failing(many)).toEqual(['CAPACITY']);

    const edge = ready();
    edge.soldiers = Array.from({ length: 10 }, () => sol());
    expect(failing(edge)).toEqual([]);
  });

  it('flags min > max squad size (rules step)', () => {
    const input = ready();
    input.settings = { ...DEFAULT_SETTINGS, minPlayersPerTeam: 7, maxPlayersPerTeam: 6 };
    const ids = failing(input);
    expect(ids).toContain('SQUAD_SIZE_SANE');
    expect(
      validateReadyToStart(input).checks.find((c) => c.id === 'SQUAD_SIZE_SANE')!.fixStep,
    ).toBe('rules');
  });

  it('points CAPACITY at the rules step when the bounds themselves are odd', () => {
    const input = ready();
    // min > max: 6 soldiers can't satisfy 12 ≤ s ≤ 10, and it's not a people problem only.
    input.settings = { ...DEFAULT_SETTINGS, minPlayersPerTeam: 7, maxPlayersPerTeam: 6 };
    input.soldiers = Array.from({ length: 11 }, () => sol());
    const check = validateReadyToStart(input).checks.find((c) => c.id === 'CAPACITY')!;
    expect(check.ok).toBe(false);
  });

  it('flags duplicate people by account, IGN and phone across both tabs', () => {
    const input = ready();
    input.soldiers[0] = { ...input.soldiers[0]!, userId: input.captains[0]!.userId };
    input.soldiers[1] = { ...input.soldiers[1]!, ign: 'CAP' + input.captains[1]!.ign!.slice(3) };
    input.soldiers[2] = { ...input.soldiers[2]!, phone: '+91 98765 43210' };
    input.soldiers[3] = { ...input.soldiers[3]!, phone: '9876543210' };
    input.soldiers.push(sol({ status: 'REJECTED', userId: input.captains[0]!.userId }));
    const check = validateReadyToStart(input).checks.find((c) => c.id === 'NO_DUPLICATE_PEOPLE')!;
    expect(check.ok).toBe(false);
    expect(new Set(check.offenders)).toEqual(
      new Set([
        input.captains[0]!.leaderId,
        input.soldiers[0]!.playerId,
        input.captains[1]!.leaderId,
        input.soldiers[1]!.playerId,
        input.soldiers[2]!.playerId,
        input.soldiers[3]!.playerId,
      ]),
    );
  });

  it('every captain must afford the highest base price', () => {
    const input = ready();
    input.soldiers[0] = { ...input.soldiers[0]!, basePrice: 60 };
    input.captains[1] = { ...input.captains[1]!, purseTotal: 60 };
    const check = validateReadyToStart(input).checks.find(
      (c) => c.id === 'PURSES_COVER_BASE_PRICE',
    )!;
    expect(check.ok).toBe(false);
    expect(check.offenders).toEqual([input.captains[0]!.leaderId]);
  });

  it('handles an empty tournament', () => {
    const r = validateReadyToStart({ settings: DEFAULT_SETTINGS, captains: [], soldiers: [] });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'CAPACITY')!.ok).toBe(true);
    expect(r.checks.find((c) => c.id === 'PURSES_COVER_BASE_PRICE')!.message).toMatch(/0 MP/);
  });
});

describe('colour helpers', () => {
  it('measures distance and contrast', () => {
    expect(colorDistance('#ff0000', '#ff0000')).toBe(0);
    expect(colorDistance('#ff0000', '#0000ff')).toBeGreaterThan(100);
    expect(backgroundContrast('#ffffff')).toBeGreaterThan(10);
    expect(backgroundContrast('#12160e')).toBeCloseTo(1, 5);
    expect(colorDistance('#000000', '#010101')).toBeLessThan(1);
  });

  it('finds the first too-similar team', () => {
    const teams = [
      { name: 'Blue', color: '#4361ee' },
      { name: 'Red', color: '#e63946' },
    ];
    expect(findTooSimilarColor('#e33a48', teams)?.name).toBe('Red');
    expect(findTooSimilarColor('#2a9d4f', teams)).toBeUndefined();
  });

  it('ignores short phones and blank IGNs for duplicates', () => {
    expect(
      findDuplicatePeople([
        { id: 'a', userId: null, ign: ' ', phone: '123' },
        { id: 'b', userId: null, ign: '', phone: '123' },
        { id: 'c', userId: null, ign: null, phone: null },
      ]),
    ).toEqual([]);
  });
});
