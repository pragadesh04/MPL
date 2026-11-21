import { PERMISSION_NAMES } from './schemas/domain';
import { can, isOrganiserRole, PERMISSIONS } from './permissions';

describe('PERMISSIONS (PLAN §2.4)', () => {
  it('covers every permission name', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...PERMISSION_NAMES].sort());
  });

  it('matches the §2.4 table for the organiser team', () => {
    expect(can(['OWNER'], 'auction:reset')).toBe(true);
    expect(can(['CO_ADMIN'], 'auction:reset')).toBe(false);
    expect(can(['CO_ADMIN'], 'stage:advance')).toBe(true);
    expect(can(['AUCTIONEER'], 'auction:control')).toBe(true);
    expect(can(['AUCTIONEER'], 'auction:roster')).toBe(false);
    expect(can(['AUCTIONEER'], 'tournament:view-admin')).toBe(true);
    expect(can(['CO_ADMIN'], 'organisers:manage')).toBe(false);
    expect(can(['OWNER'], 'tournament:transfer')).toBe(true);
  });

  it('gives captains and soldiers only their own rights', () => {
    expect(can(['CAPTAIN'], 'auction:bid')).toBe(true);
    expect(can(['SOLDIER'], 'auction:bid')).toBe(false);
    expect(can(['SOLDIER'], 'tournament:view')).toBe(true);
    expect(can(['SOLDIER'], 'tournament:view-admin')).toBe(false);
    expect(can([], 'tournament:view')).toBe(false);
    expect(can(['SOLDIER', 'CO_ADMIN'], 'matches:edit')).toBe(true);
  });

  it('knows which roles are organiser roles', () => {
    expect(isOrganiserRole('AUCTIONEER')).toBe(true);
    expect(isOrganiserRole('CAPTAIN')).toBe(false);
  });
});
