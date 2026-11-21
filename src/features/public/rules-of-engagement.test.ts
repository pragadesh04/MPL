import { planFormat } from '@/lib/rules/planFormat';
import {
  DEFAULT_SETTINGS,
  EXAMPLE_BAND_INCREMENTS,
  type TournamentSettings,
} from '@/lib/schemas/settings';
import { raiseText, rulesOfEngagement, unsoldText } from './rules-of-engagement';

const cards = (s: TournamentSettings, teams = 8) => rulesOfEngagement(s, planFormat(teams, s));
const card = (s: TournamentSettings, id: string, teams = 8) =>
  cards(s, teams).find((c) => c.id === id)!;

describe('rulesOfEngagement', () => {
  it('describes the default (reference build) setup', () => {
    const all = cards(DEFAULT_SETTINGS);
    expect(all.map((c) => c.id)).toEqual([
      'purse',
      'squad',
      'opening',
      'raise',
      'timer',
      'unsold',
      'format',
    ]);
    expect(card(DEFAULT_SETTINGS, 'purse').value).toBe('50 MP');
    expect(card(DEFAULT_SETTINGS, 'squad')).toMatchObject({ value: '4–6' });
    expect(card(DEFAULT_SETTINGS, 'opening').detail).toContain('in random order');
    expect(card(DEFAULT_SETTINGS, 'raise')).toMatchObject({ value: '+1 MP' });
    expect(card(DEFAULT_SETTINGS, 'raise').detail).toContain('more than the minimum');
    expect(card(DEFAULT_SETTINGS, 'timer')).toMatchObject({ value: '60s' });
    expect(card(DEFAULT_SETTINGS, 'timer').detail).toBe(
      'Every bid restarts the clock. 2s break, then the next soldier opens automatically.',
    );
    expect(card(DEFAULT_SETTINGS, 'unsold').detail).toContain('1 re-auction round at 50%');
    expect(card(DEFAULT_SETTINGS, 'format')).toMatchObject({ value: 'Groups + knockout' });
    expect(card(DEFAULT_SETTINGS, 'format').detail).toContain('3 points per win');
  });

  it('follows the settings', () => {
    const s: TournamentSettings = {
      ...DEFAULT_SETTINGS,
      minPlayersPerTeam: 5,
      maxPlayersPerTeam: 5,
      timerResetSeconds: 15,
      breakSeconds: 0,
      playerOrder: 'byBasePriceDesc',
      allowCustomBids: false,
    };
    expect(card(s, 'squad').value).toBe('5');
    expect(card(s, 'timer').detail).toBe(
      'Each bid puts the clock back to at least 15s. The next soldier opens straight away.',
    );
    expect(card(s, 'opening').detail).toContain('highest base price first');
    expect(card({ ...s, playerOrder: 'manualQueue' }, 'opening').detail).toContain(
      'organisers’ order',
    );
    expect(card(s, 'raise').detail).toContain('exactly the minimum raise');
    expect(card(s, 'format', 4).value).toBe('League + final');
    expect(card(s, 'format', 2).value).toBe('Final');
    expect(card(s, 'format', 1).detail).toBe('Add at least 2 captains to see the format.');
  });

  it('describes price bands', () => {
    expect(raiseText({ bidIncrements: EXAMPLE_BAND_INCREMENTS, allowCustomBids: true })).toEqual({
      value: 'By price band',
      detail:
        'Minimum raise: +5 from 0 to 99, +10 from 100 to 299, +20 from 300 to 599, +50 from 600 up MP. Captains may bid more than the minimum raise.',
    });
  });

  it('describes every unsold policy', () => {
    const base = { unsoldReauctionRounds: 2, reauctionPricePercent: 40 };
    expect(unsoldText({ ...base, unsoldPolicy: 'REAUCTION_THEN_ALLOCATE' }).detail).toContain(
      '2 re-auction rounds at 40%',
    );
    expect(
      unsoldText({ ...base, unsoldReauctionRounds: 0, unsoldPolicy: 'REAUCTION_THEN_ALLOCATE' }),
    ).toMatchObject({
      value: 'Auto-allocated',
    });
    expect(unsoldText({ ...base, unsoldPolicy: 'RANDOM_SQUAD' }).value).toBe('Random squad');
    expect(unsoldText({ ...base, unsoldPolicy: 'ADMIN_DECIDES' }).value).toBe('Organisers decide');
  });
});
