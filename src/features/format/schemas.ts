import { z } from 'zod';
import { idSchema } from '@/lib/schemas/domain';

/**
 * Request bodies for Lane C endpoints (format, matches, announcements). Lane-owned so the client
 * forms and the Route Handlers validate with the same schema.
 */

/** POST /api/tournaments/:id/groups/draw */
export const drawRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('RANDOM') }),
  z.object({
    mode: z.literal('MANUAL'),
    /** In group order (A, B, …); each team exactly once. */
    groups: z.array(z.array(idSchema)).min(1),
  }),
]);
export type DrawRequest = z.infer<typeof drawRequestSchema>;

const kills = z.number().int().min(0).max(999);

/** One game of a match: kills per team. A tied game can't be saved (replayed instead). */
export const gameInputSchema = z
  .object({
    map: z.string().trim().max(40).nullable().optional(),
    killsA: kills,
    killsB: kills,
  })
  .refine((g) => g.killsA !== g.killsB, {
    message: 'A tied game can’t be saved: replay it',
    path: ['killsB'],
  });
export type GameInput = z.infer<typeof gameInputSchema>;

export const playerStatInputSchema = z.object({
  playerId: idSchema,
  kills: kills.default(0),
  deaths: kills.default(0),
  mvp: z.boolean().default(false),
});
export type PlayerStatInput = z.infer<typeof playerStatInputSchema>;

/** PATCH /api/tournaments/:id/matches/:mid */
export const matchPatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark-live') }),
  z.object({ action: z.literal('unmark-live') }),
  z.object({
    action: z.literal('schedule'),
    /** ISO date-time, or null to clear. */
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  z.object({
    action: z.literal('result'),
    games: z.array(gameInputSchema).max(7),
    playerStats: z.array(playerStatInputSchema).max(40).optional(),
    /** Must be true to save an edit that changes the winner of a decided knockout match. */
    confirmCascade: z.boolean().optional(),
  }),
]);
export type MatchPatch = z.infer<typeof matchPatchSchema>;

/** PATCH /api/tournaments/:id/matches/order */
export const reorderRequestSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(512),
});

/** PUT /api/tournaments/:id/announcement */
export const announcementRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .max(200, 'Keep it to one line (200 characters)')
    .nullable()
    .transform((t) => (t ? t : null)),
});
export type AnnouncementRequest = z.infer<typeof announcementRequestSchema>;
