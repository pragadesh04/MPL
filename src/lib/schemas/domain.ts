import { z } from 'zod';
import { membershipRoleSchema } from './enums';

/**
 * Shared domain types used across lanes (PLAN.md §2, §4, §5). Contracts: SHARED + FROZEN after
 * Phase 0. Lanes add fields only through integration notes.
 */

// ─── Ids & codes ──────────────────────────────────────────────────────────────────────────

export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/**
 * Unambiguous alphabet for organiser keys and Player IDs: no 0/O/1/I/L (§2.3).
 * 31 characters → 31^6 ≈ 887M combinations.
 */
export const KEY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const KEY_LENGTH = 6;

/** Normalised (stored) form: 6 chars from KEY_ALPHABET, upper case, no dash / '#'. */
export const storedKeySchema = z
  .string()
  .length(KEY_LENGTH)
  .regex(new RegExp(`^[${KEY_ALPHABET}]{${KEY_LENGTH}}$`));

// ─── Roles & permissions (§2.1, §2.4) ─────────────────────────────────────────────────────

/** A user's role(s) in ONE tournament. Captain and soldier are never both held (§2.1). */
export const TOURNAMENT_ROLES = ['OWNER', 'CO_ADMIN', 'AUCTIONEER', 'CAPTAIN', 'SOLDIER'] as const;
export const tournamentRoleSchema = z.enum(TOURNAMENT_ROLES);
export type TournamentRole = z.infer<typeof tournamentRoleSchema>;

export const ORGANISER_ROLES = membershipRoleSchema.options;

/**
 * Permission names for `requireRole` / `can`. The table that maps them to roles is
 * `PERMISSIONS` in `src/lib/permissions.ts` (shared so the UI can hide actions too).
 */
export const PERMISSION_NAMES = [
  /** Any participant: tournament home, matches hub, teams, own auction view (§4.6). */
  'tournament:view',
  /** Organisers (incl. auctioneers): full roster, audit log, pending people. */
  'tournament:view-admin',
  'settings:edit',
  /** Add captains / soldiers, personal links, organiser key, Player ID requests. */
  'people:manage',
  /** Approve / reject key sign-ups, switch role, set purses and base prices. */
  'people:approve',
  'participants:reset-password',
  /** Start tournament, run allocation, group draw, generate knockout. */
  'stage:advance',
  /** Auction console: next / sold / unsold / pause / undo / fallback bid / new round. */
  'auction:control',
  /** Release a soldier, auction again, assign an unsold soldier. */
  'auction:roster',
  'auction:reset',
  /** Captain bidding for their own team. */
  'auction:bid',
  'announcement:post',
  'matches:edit',
  /** Purse fix, rename team, reassign soldier (always audit-logged). */
  'admin:override',
  'webhooks:manage',
  'organisers:manage',
  'tournament:delete',
  'tournament:transfer',
  /** Captain: create / edit own team before Start. */
  'team:edit-own',
  /** Captain / soldier: edit own profile snapshot before Start. */
  'profile:edit-own',
] as const;
export const permissionSchema = z.enum(PERMISSION_NAMES);
export type Permission = z.infer<typeof permissionSchema>;

// ─── Matches (§4.4, §4.6) ─────────────────────────────────────────────────────────────────

/**
 * Where a match slot's team comes from until it is decided.
 * GROUP_POS: ref = '<groupId>:<position 1-based>' (shown "Group A #1").
 * WINNER_OF / LOSER_OF: ref = '<matchId>' (shown "Winner of M9").
 */
export const matchSourceSchema = z.object({
  type: z.enum(['GROUP_POS', 'WINNER_OF', 'LOSER_OF']),
  ref: z.string().min(1),
});
export type MatchSource = z.infer<typeof matchSourceSchema>;

export const MINI_MILITIA_MAPS = [
  'Catacombs',
  'Outpost',
  'High Tower',
  'Bunkers',
  'Snow Blind',
  'Sidewinder',
  'Crossroads',
  'Overlook',
] as const;

// ─── Team colours ─────────────────────────────────────────────────────────────────────────

/** Stored team colour: lowercase `#rrggbb` (DB check `teams_color_ck`). */
export const teamColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

export const teamShortNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,4}$/)
  .transform((s) => s.toUpperCase());
