import type { Permission, TournamentRole } from './schemas/domain';

/**
 * The PLAN.md §2.4 permission table (plus captain / soldier rights from §2.1). Shared so services
 * enforce it (`requireRole`) and the UI hides actions the role can't do (§7.3).
 */
export const PERMISSIONS: Record<Permission, readonly TournamentRole[]> = {
  'tournament:view': ['OWNER', 'CO_ADMIN', 'AUCTIONEER', 'CAPTAIN', 'SOLDIER'],
  'tournament:view-admin': ['OWNER', 'CO_ADMIN', 'AUCTIONEER'],
  'settings:edit': ['OWNER', 'CO_ADMIN'],
  'people:manage': ['OWNER', 'CO_ADMIN'],
  'people:approve': ['OWNER', 'CO_ADMIN'],
  'participants:reset-password': ['OWNER', 'CO_ADMIN'],
  'stage:advance': ['OWNER', 'CO_ADMIN'],
  'auction:control': ['OWNER', 'CO_ADMIN', 'AUCTIONEER'],
  'auction:roster': ['OWNER', 'CO_ADMIN'],
  'auction:reset': ['OWNER'],
  'auction:bid': ['CAPTAIN'],
  'announcement:post': ['OWNER', 'CO_ADMIN'],
  'matches:edit': ['OWNER', 'CO_ADMIN'],
  'admin:override': ['OWNER', 'CO_ADMIN'],
  'webhooks:manage': ['OWNER', 'CO_ADMIN'],
  'organisers:manage': ['OWNER'],
  'tournament:delete': ['OWNER'],
  'tournament:transfer': ['OWNER'],
  'team:edit-own': ['CAPTAIN'],
  'profile:edit-own': ['CAPTAIN', 'SOLDIER'],
};

/** True if any of `roles` grants `permission`. */
export function can(roles: readonly TournamentRole[], permission: Permission): boolean {
  const allowed = PERMISSIONS[permission];
  return roles.some((r) => allowed.includes(r));
}

export const ORGANISER_ROLE_NAMES: readonly TournamentRole[] = ['OWNER', 'CO_ADMIN', 'AUCTIONEER'];

export function isOrganiserRole(role: TournamentRole): boolean {
  return ORGANISER_ROLE_NAMES.includes(role);
}
