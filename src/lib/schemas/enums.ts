import { z } from 'zod';

/**
 * Every status / kind value used in the database, as `const` tuples.
 * `src/server/db/schema.ts` builds its Postgres enums from these, and the Zod schemas below
 * are built from the same tuples, so the database, the API and the UI can never disagree.
 * PLAN.md §1 (lifecycle) and §5 (data model).
 */

export const TOURNAMENT_STATUSES = [
  'DRAFT',
  'READY',
  'AUCTION_LIVE',
  'AUCTION_PAUSED',
  'ALLOCATION',
  'GROUP_DRAW',
  'GROUP_STAGE',
  'KNOCKOUT',
  'COMPLETED',
  'CANCELLED',
] as const;
export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);
export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;

/** Statuses that count as "active" for the one-active-tournament-per-owner rule. */
export const INACTIVE_TOURNAMENT_STATUSES = [
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly TournamentStatus[];
/** Joining (all three paths) and profile edits are only allowed in these statuses (§2.3). */
export const JOINABLE_TOURNAMENT_STATUSES = [
  'DRAFT',
  'READY',
] as const satisfies readonly TournamentStatus[];

export const MEMBERSHIP_ROLES = ['OWNER', 'CO_ADMIN', 'AUCTIONEER'] as const;
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const JOIN_SOURCES = ['ADDED_BY_ORGANISER', 'ORGANISER_KEY', 'PLAYER_ID_REQUEST'] as const;
export const joinSourceSchema = z.enum(JOIN_SOURCES);
export type JoinSource = z.infer<typeof joinSourceSchema>;

export const LEADER_APPROVALS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const leaderApprovalSchema = z.enum(LEADER_APPROVALS);
export type LeaderApproval = z.infer<typeof leaderApprovalSchema>;

export const LEADER_INVITE_STATUSES = [
  'NOT_OPENED',
  'OPENED',
  'ACCOUNT_LINKED',
  'TEAM_READY',
] as const;
export const leaderInviteStatusSchema = z.enum(LEADER_INVITE_STATUSES);
export type LeaderInviteStatus = z.infer<typeof leaderInviteStatusSchema>;

export const PLAYER_INVITE_STATUSES = ['NOT_OPENED', 'OPENED', 'ACCOUNT_LINKED'] as const;
export const playerInviteStatusSchema = z.enum(PLAYER_INVITE_STATUSES);
export type PlayerInviteStatus = z.infer<typeof playerInviteStatusSchema>;

export const PLAYER_STATUSES = [
  'PENDING_APPROVAL',
  'REJECTED',
  'POOL',
  'ON_BLOCK',
  'SOLD',
  'UNSOLD',
  'ALLOCATED',
] as const;
export const playerStatusSchema = z.enum(PLAYER_STATUSES);
export type PlayerStatus = z.infer<typeof playerStatusSchema>;

/** Soldier statuses that mean "in a squad" (`team_id` is set exactly for these). */
export const IN_SQUAD_PLAYER_STATUSES = [
  'SOLD',
  'ALLOCATED',
] as const satisfies readonly PlayerStatus[];

/**
 * How a soldier reached a squad. PLAN §5 lists AUCTION / AUTO_ALLOCATED; RANDOM_SQUAD
 * (unsoldPolicy, §3.1) and ADMIN_PICK ("Assign", §3.3) back the badges in §7.6a.
 */
export const ACQUIRED_VIA = ['AUCTION', 'AUTO_ALLOCATED', 'RANDOM_SQUAD', 'ADMIN_PICK'] as const;
export const acquiredViaSchema = z.enum(ACQUIRED_VIA);
export type AcquiredVia = z.infer<typeof acquiredViaSchema>;

export const PARTICIPANT_KINDS = ['LEADER', 'PLAYER'] as const;
export const participantKindSchema = z.enum(PARTICIPANT_KINDS);
export type ParticipantKind = z.infer<typeof participantKindSchema>;

export const JOIN_REQUEST_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const joinRequestStatusSchema = z.enum(JOIN_REQUEST_STATUSES);
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>;

export const MATCH_STAGES = ['GROUP', 'KNOCKOUT', 'THIRD_PLACE'] as const;
export const matchStageSchema = z.enum(MATCH_STAGES);
export type MatchStage = z.infer<typeof matchStageSchema>;

export const MATCH_STATUSES = ['SCHEDULED', 'LIVE', 'DONE'] as const;
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const MATCH_SLOTS = ['A', 'B'] as const;
export const matchSlotSchema = z.enum(MATCH_SLOTS);
export type MatchSlot = z.infer<typeof matchSlotSchema>;

export const WEBHOOK_KINDS = ['DISCORD', 'GENERIC'] as const;
export const webhookKindSchema = z.enum(WEBHOOK_KINDS);
export type WebhookKind = z.infer<typeof webhookKindSchema>;

export const WEBHOOK_DELIVERY_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export const webhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;
