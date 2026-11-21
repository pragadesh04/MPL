import { formatMP, percentOf, assertMP } from '../money';
import { msUntil, offsetFromSample, smoothOffset } from '../realtime/clock';
import { contrastRatio, readableTextOn } from '../team-color';
import { auctionCommandSchema, placeBidRequestSchema } from './auction';
import { teamColorSchema, teamShortNameSchema } from './domain';
import { DEFAULT_SETTINGS, parseSettings, tournamentSettingsSchema } from './settings';

describe('tournament settings (§3.1, §4.1)', () => {
  it('defaults match the reference build', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      defaultPurse: 50,
      minBasePrice: 1,
      bidIncrements: { type: 'flat', step: 1 },
      allowCustomBids: true,
      bidTimerSeconds: 60,
      timerResetSeconds: 60,
      breakSeconds: 2,
      unsoldPolicy: 'REAUCTION_THEN_ALLOCATE',
      minPlayersPerTeam: 4,
      maxPlayersPerTeam: 6,
      groupCount: null,
      advancePerGroup: 2,
      knockoutBestOf: 3,
      finalBestOf: 5,
      thirdPlaceMatch: false,
    });
  });

  it('fills defaults for old rows and rejects nonsense', () => {
    expect(parseSettings({ defaultPurse: 1000 }).bidTimerSeconds).toBe(60);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(tournamentSettingsSchema.safeParse({ minPlayersPerTeam: 7 }).success).toBe(false);
    expect(tournamentSettingsSchema.safeParse({ defaultPurse: 10.5 }).success).toBe(false);
    expect(
      tournamentSettingsSchema.safeParse({
        bidIncrements: { type: 'bands', bands: [{ from: 5, step: 1 }] },
      }).success,
    ).toBe(false);
  });
});

describe('auction contracts', () => {
  it('validates bids and commands', () => {
    const commandId = '0b3b8d1e-5f2a-4c3d-9e8f-1a2b3c4d5e6f';
    expect(
      placeBidRequestSchema.safeParse({ amount: 5, expectedVersion: 3, commandId }).success,
    ).toBe(true);
    expect(
      placeBidRequestSchema.safeParse({ amount: 2.5, expectedVersion: 3, commandId }).success,
    ).toBe(false);
    expect(
      auctionCommandSchema.safeParse({ type: 'undo', expectedVersion: 1, commandId }).success,
    ).toBe(false);
    expect(
      auctionCommandSchema.safeParse({
        type: 'undo',
        reason: 'typo',
        expectedVersion: 1,
        commandId,
      }).success,
    ).toBe(true);
  });
});

describe('domain helpers', () => {
  it('normalises team colour and short code', () => {
    expect(teamColorSchema.parse('#FF00aa')).toBe('#ff00aa');
    expect(teamShortNameSchema.parse(' rhn ')).toBe('RHN');
    expect(teamColorSchema.safeParse('red').success).toBe(false);
  });

  it('formats Militia Points as integers', () => {
    expect(formatMP(1250)).toBe('1,250 MP');
    expect(percentOf(15, 50)).toBe(7);
    expect(() => assertMP(1.5)).toThrow(RangeError);
    expect(() => assertMP(-1)).toThrow(RangeError);
  });

  it('computes readable text and contrast', () => {
    expect(readableTextOn('#ffffff')).not.toBe('#ffffff');
    expect(readableTextOn('#000000')).toBe('#ffffff');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('keeps a smoothed server clock offset', () => {
    const offset = offsetFromSample(
      '2026-11-21T10:00:01.000Z',
      Date.parse('2026-11-21T10:00:00.000Z'),
    );
    expect(offset).toBe(1000);
    expect(smoothOffset(null, 1000)).toBe(1000);
    expect(smoothOffset(1000, 2000)).toBe(1300);
    expect(msUntil('2026-11-21T10:00:10.000Z', 1000, Date.parse('2026-11-21T10:00:00.000Z'))).toBe(
      9000,
    );
    expect(msUntil(null, 0)).toBe(0);
  });
});
