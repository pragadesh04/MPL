import type { MyTournament } from '@/server/services/tournaments/tournaments';
import { formatKeyInput } from './hooks';
import { nextStepFor } from './next-step';
import { safeNextPath } from './next-path';
import { suggestShortName } from './palette';

describe('formatKeyInput', () => {
  it('upper-cases, strips junk and inserts the dash after 3', () => {
    expect(formatKeyInput('rv7k2p')).toBe('RV7-K2P');
    expect(formatKeyInput('rv7')).toBe('RV7');
    expect(formatKeyInput('r v 7 - k 2 p x y')).toBe('RV7-K2P');
  });
});

describe('suggestShortName', () => {
  it.each([
    ['Red Rhinos', 'RRH'],
    ['Blue Hawks United', 'BHU'],
    ['Hawks', 'HAW'],
    ['', ''],
  ])('%s → %s', (name, code) => expect(suggestShortName(name)).toBe(code));
});

describe('safeNextPath', () => {
  it('allows only same-site relative paths', () => {
    expect(safeNextPath('/t/abc/setup')).toBe('/t/abc/setup');
    expect(safeNextPath('//evil.com')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard');
    expect(safeNextPath('https://evil.com')).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
  });
});

describe('nextStepFor', () => {
  const base: MyTournament = {
    id: 't1',
    name: 'Cup',
    status: 'DRAFT',
    ownerName: 'Ravi Kumar',
    roles: [],
    pending: null,
    rejected: null,
    myTeam: null,
    createdAt: new Date(),
  };
  it('explains pending, captain, soldier and organiser states', () => {
    expect(nextStepFor({ ...base, pending: 'LEADER' }).text).toBe(
      'Waiting for Ravi to approve you as captain',
    );
    expect(nextStepFor({ ...base, rejected: 'PLAYER' }).text).toMatch(/turned down/);
    expect(nextStepFor({ ...base, roles: ['CAPTAIN'] })).toEqual({
      text: 'Set up your team',
      href: '/t/t1/teams/setup',
    });
    expect(nextStepFor({ ...base, roles: ['SOLDIER'] }).href).toBe('/t/t1/people/me');
    expect(nextStepFor({ ...base, roles: ['OWNER'], status: 'READY' }).href).toBe('/t/t1/setup');
    expect(nextStepFor({ ...base, roles: ['SOLDIER'], status: 'AUCTION_LIVE' }).href).toBe(
      '/t/t1/auction',
    );
    expect(nextStepFor({ ...base, roles: ['CAPTAIN'], status: 'CANCELLED' }).href).toBeNull();
  });
});
