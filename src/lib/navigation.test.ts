import { describe, expect, it } from 'vitest';
import { activeNavHref, tournamentNavItems } from './navigation';

const T = '00000000-0000-4000-8000-000000000001';
const labels = (...args: Parameters<typeof tournamentNavItems>) =>
  tournamentNavItems(...args).map((i) => i.label);

describe('tournamentNavItems', () => {
  it('shows an owner the setup pages before Start, and no auction or format pages', () => {
    expect(labels(T, ['OWNER'], 'DRAFT')).toEqual([
      'Home',
      'Setup',
      'People',
      'Teams',
      'Audit log',
      'Settings',
    ]);
  });

  it('gives organisers the auction pages once the auction runs', () => {
    const l = labels(T, ['CO_ADMIN'], 'AUCTION_LIVE');
    expect(l).toEqual(expect.arrayContaining(['Auction', 'Command post', 'Squads', 'Stats']));
    expect(l).not.toContain('Setup');
    expect(l).not.toContain('Allocation');
    expect(l).not.toContain('Matches');
  });

  it('adds Allocation from the allocation stage and the format pages from the group draw', () => {
    expect(labels(T, ['OWNER'], 'ALLOCATION')).toContain('Allocation');
    expect(labels(T, ['OWNER'], 'ALLOCATION')).not.toContain('Matches');
    expect(labels(T, ['OWNER'], 'GROUP_STAGE')).toEqual(
      expect.arrayContaining(['Allocation', 'Matches', 'Groups', 'Knockout']),
    );
  });

  it('never shows organiser pages to captains or soldiers', () => {
    for (const role of ['CAPTAIN', 'SOLDIER'] as const) {
      const l = labels(T, [role], 'GROUP_STAGE');
      for (const hidden of [
        'Setup',
        'People',
        'Command post',
        'Allocation',
        'Audit log',
        'Settings',
      ]) {
        expect(l).not.toContain(hidden);
      }
      expect(l).toEqual(expect.arrayContaining(['Home', 'Auction', 'Matches', 'Stats']));
    }
    expect(labels(T, ['CAPTAIN'], 'DRAFT')).toEqual(['Home', 'My team']);
    expect(labels(T, ['SOLDIER'], 'READY')).toEqual(['Home', 'My card']);
  });

  it('lets an auctioneer see organiser pages but not setup management', () => {
    const l = labels(T, ['AUCTIONEER'], 'READY');
    expect(l).toContain('People');
    expect(l).not.toContain('Setup');
    expect(l).not.toContain('Teams');
  });

  it('combines roles (an owner who also plays)', () => {
    const l = labels(T, ['OWNER', 'CAPTAIN'], 'DRAFT');
    expect(l).toEqual(expect.arrayContaining(['Setup', 'My team']));
  });
});

describe('activeNavHref', () => {
  const items = tournamentNavItems(T, ['OWNER', 'CAPTAIN'], 'DRAFT');
  it('matches the home page exactly', () => {
    expect(activeNavHref(items, `/t/${T}`)).toBe(`/t/${T}`);
    expect(activeNavHref(items, `/t/${T}/nowhere`)).toBeNull();
  });
  it('prefers the longest matching link', () => {
    expect(activeNavHref(items, `/t/${T}/teams/setup`)).toBe(`/t/${T}/teams/setup`);
    expect(activeNavHref(items, `/t/${T}/teams`)).toBe(`/t/${T}/teams`);
    expect(activeNavHref(items, `/t/${T}/settings/organisers`)).toBe(`/t/${T}/settings`);
  });
});
