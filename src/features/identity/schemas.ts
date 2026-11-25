import { z } from 'zod';
import { normalizeKey } from '@/lib/rules/keys';
import { idSchema, teamColorSchema, teamShortNameSchema } from '@/lib/schemas/domain';
import { participantKindSchema } from '@/lib/schemas/enums';
import { tournamentSettingsSchema } from '@/lib/schemas/settings';

/**
 * Lane A input contracts (forms + Route Handlers + services use the same schemas; the server
 * always re-parses). They live here, not in src/lib/schemas, because that folder is frozen for
 * lanes (PLAN §13.1). Integration may move them (see docs/lanes/LANE-A.md).
 */

// ─── Building blocks ──────────────────────────────────────────────────────────────────────

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(20, 'At most 20 characters')
  .regex(/^[A-Za-z0-9_]+$/, 'Letters, numbers and _ only');

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'At most 128 characters');

export const displayNameSchema = z.string().trim().min(2, 'At least 2 characters').max(40);
export const ignSchema = z.string().trim().min(1, 'Required').max(24);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional()
  .refine((s) => s == null || /^\+?[0-9 ()-]{7,20}$/.test(s), 'Enter a valid phone number');

export const photoUrlSchema = z
  .string()
  .trim()
  .transform((s) => (s === '' ? null : s))
  .nullable()
  .optional()
  .refine((s) => s == null || /^https:\/\/\S+$/.test(s), 'Must be an https:// link');

/** Organiser key in any user form ("rv7-k2p", "RV7K2P") → stored form. */
export const organiserKeyInputSchema = z.string().transform((s, ctx) => {
  const key = normalizeKey(s);
  if (!key) {
    ctx.addIssue({ code: 'custom', message: 'Keys look like RV7-K2P' });
    return z.NEVER;
  }
  return key;
});

/** Player ID in any user form ("#4k9qx7") → stored form. */
export const playerCodeInputSchema = z.string().transform((s, ctx) => {
  const code = normalizeKey(s);
  if (!code) {
    ctx.addIssue({ code: 'custom', message: 'Player IDs look like #4K9QX7' });
    return z.NEVER;
  }
  return code;
});

const mpInput = z.coerce.number().int('Whole MP only').nonnegative('Must be 0 or more');

// ─── A1 Accounts ──────────────────────────────────────────────────────────────────────────

export const registerPlayerSchema = z.object({
  accountType: z.literal('PLAYER'),
  displayName: displayNameSchema,
  ign: ignSchema,
  username: usernameSchema,
  password: passwordSchema,
  phone: phoneSchema,
  photoUrl: photoUrlSchema,
  organiserKey: z
    .string()
    .optional()
    .transform((s) => (s && s.trim() !== '' ? s : undefined))
    .pipe(organiserKeyInputSchema.optional()),
  requestedRole: participantKindSchema.optional(),
});
export type RegisterPlayerInput = z.input<typeof registerPlayerSchema>;

export const registerOrganiserSchema = z.object({
  accountType: z.literal('ORGANISER'),
  displayName: displayNameSchema,
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterOrganiserInput = z.input<typeof registerOrganiserSchema>;

export const registerSchema = z.discriminatedUnion('accountType', [
  registerPlayerSchema,
  registerOrganiserSchema,
]);

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Required').max(64),
  password: z.string().min(1, 'Required').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  displayName: displayNameSchema,
  ign: ignSchema.nullable().optional(),
  phone: phoneSchema,
  photoUrl: photoUrlSchema,
});

// ─── A2 Tournaments ───────────────────────────────────────────────────────────────────────

export const tournamentNameSchema = z.string().trim().min(3, 'At least 3 characters').max(60);

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  copySettingsFrom: idSchema.optional(),
});

export const updateBasicsSchema = z.object({
  name: tournamentNameSchema,
  logoUrl: photoUrlSchema,
});

export const updateSettingsSchema = z.object({
  settings: tournamentSettingsSchema,
  /** Required for changes after Start that aren't in EDITABLE_AFTER_START (logged override). */
  reason: z.string().trim().max(200).optional(),
});

export const confirmNameSchema = z.object({ confirmName: z.string().trim().min(1) });

export const registrationSchema = z.object({
  registrationOpen: z.boolean(),
  maxRegistrations: z.number().int().positive().max(10_000).nullable(),
});

// ─── A3 Organiser team ────────────────────────────────────────────────────────────────────

export const invitableRoleSchema = z.enum(['CO_ADMIN', 'AUCTIONEER']);
export type InvitableRole = z.infer<typeof invitableRoleSchema>;

export const createOrganiserInviteSchema = z.object({
  emailOrUsername: z.string().trim().min(3).max(120),
  role: invitableRoleSchema,
});

export const changeMemberRoleSchema = z.object({ role: invitableRoleSchema });

export const transferOwnershipSchema = z.object({
  toUserId: idSchema,
  confirmName: z.string().trim().min(1),
});

// ─── A4 People (path A) ───────────────────────────────────────────────────────────────────

const personBase = {
  name: displayNameSchema,
  ign: optionalText(24),
  phone: phoneSchema,
};

export const addPersonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LEADER'), ...personBase, purse: mpInput.optional() }),
  z.object({ type: z.literal('PLAYER'), ...personBase, basePrice: mpInput.optional() }),
]);
export type AddPersonInput = z.input<typeof addPersonSchema>;

export const importPeopleSchema = z.object({
  rows: z.array(addPersonSchema).min(1).max(200),
});

export const updateLeaderSchema = z.object({
  ...personBase,
  purse: mpInput,
});
export const updatePlayerSchema = z.object({
  ...personBase,
  basePrice: mpInput,
});

// ─── A5 Path B (organiser key) ────────────────────────────────────────────────────────────

export const joinWithKeySchema = z.object({ role: participantKindSchema });

export const approveSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
  /** Captains: purse (defaults to settings.defaultPurse). */
  purse: mpInput.optional(),
  /** Soldiers: base price (defaults to settings.minBasePrice). */
  basePrice: mpInput.optional(),
});

export const rejectSchema = z.object({ reason: z.string().trim().min(1).max(200) });

// ─── A6 Path C (Player ID requests) ───────────────────────────────────────────────────────

export const sendRequestSchema = z.object({
  playerCode: playerCodeInputSchema,
  role: participantKindSchema,
  purse: mpInput.optional(),
  basePrice: mpInput.optional(),
});

export const declineRequestSchema = z.object({ block: z.boolean().optional() });

export const markReadSchema = z.object({
  ids: z.array(z.number().int().positive()).max(200).optional(),
});

// ─── A7 Teams ─────────────────────────────────────────────────────────────────────────────

export const teamNameSchema = z.string().trim().min(2, 'At least 2 characters').max(30);

export const teamSetupSchema = z.object({
  name: teamNameSchema,
  shortName: teamShortNameSchema,
  color: teamColorSchema,
  secondaryColor: teamColorSchema.nullable().optional(),
  emoji: z
    .string()
    .trim()
    .max(16)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional(),
  logoUrl: photoUrlSchema,
  motto: optionalText(80),
});
export type TeamSetupInput = z.input<typeof teamSetupSchema>;

export const updateSnapshotSchema = z.object({
  name: displayNameSchema,
  ign: optionalText(24),
  phone: phoneSchema,
  photoUrl: photoUrlSchema,
});

// ─── A8 Password resets ───────────────────────────────────────────────────────────────────

export const consumeResetSchema = z.object({ password: passwordSchema });
