import { z } from 'zod';

/**
 * Tournament settings stored in `tournaments.settings` (jsonb). PLAN.md §3.1 (auction) and
 * §4.1 (format). Defaults follow the reference build (§12, decision 17).
 *
 * Not in here, on purpose:
 * - `teamCount`: derived from the number of approved captains, never entered.
 * - `registrationOpen` / `maxRegistrations`: real columns on `tournaments`.
 *
 * Always read settings through `parseSettings()` so old rows pick up new defaults.
 */

export const UNSOLD_POLICIES = ['REAUCTION_THEN_ALLOCATE', 'RANDOM_SQUAD', 'ADMIN_DECIDES'] as const;
export const unsoldPolicySchema = z.enum(UNSOLD_POLICIES);
export type UnsoldPolicy = z.infer<typeof unsoldPolicySchema>;

export const PLAYER_ORDERS = ['random', 'byBasePriceDesc', 'manualQueue'] as const;
export const playerOrderSchema = z.enum(PLAYER_ORDERS);
export type PlayerOrder = z.infer<typeof playerOrderSchema>;

const mp = z.number().int().nonnegative();
const positiveMp = z.number().int().positive();

/** One price band: from `from` MP (inclusive) upwards the minimum raise is `step`. */
export const bidBandSchema = z.object({ from: mp, step: positiveMp });
export type BidBand = z.infer<typeof bidBandSchema>;

/**
 * Minimum raise. Flat (default `+1`) or a step table by price band, e.g. the §3.1 example for a
 * 1,000 MP purse: [{from:0,step:5},{from:100,step:10},{from:300,step:20},{from:600,step:50}].
 */
export const bidIncrementsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flat'), step: positiveMp }),
  z.object({
    type: z.literal('bands'),
    bands: z
      .array(bidBandSchema)
      .min(1)
      .refine((b) => b[0]?.from === 0, 'The first band must start at 0')
      .refine(
        (b) => b.every((band, i) => i === 0 || band.from > (b[i - 1]?.from ?? -1)),
        'Bands must be in ascending order',
      ),
  }),
]);
export type BidIncrements = z.infer<typeof bidIncrementsSchema>;

export const EXAMPLE_BAND_INCREMENTS: BidIncrements = {
  type: 'bands',
  bands: [
    { from: 0, step: 5 },
    { from: 100, step: 10 },
    { from: 300, step: 20 },
    { from: 600, step: 50 },
  ],
};

const BEST_OF = z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]);
export type BestOf = z.infer<typeof BEST_OF>;

export const tournamentSettingsSchema = z
  .object({
    // §3.1 auction
    minPlayersPerTeam: z.number().int().min(1).max(20).default(4),
    maxPlayersPerTeam: z.number().int().min(2).max(20).default(6),
    defaultPurse: mp.max(1_000_000).default(50),
    minBasePrice: positiveMp.default(1),
    bidIncrements: bidIncrementsSchema.default({ type: 'flat', step: 1 }),
    allowCustomBids: z.boolean().default(true),
    bidTimerSeconds: z.number().int().min(5).max(600).default(60),
    timerResetSeconds: z.number().int().min(1).max(600).default(60),
    breakSeconds: z.number().int().min(0).max(120).default(2),
    unsoldPolicy: unsoldPolicySchema.default('REAUCTION_THEN_ALLOCATE'),
    unsoldReauctionRounds: z.number().int().min(0).max(5).default(1),
    reauctionPricePercent: z.number().int().min(10).max(100).default(50),
    playerOrder: playerOrderSchema.default('random'),
    allowAuctioneerBids: z.boolean().default(true),
    // §4.1 format
    /** null = auto: ceil(teams / 4). Each group needs ≥ 3 teams. */
    groupCount: z.number().int().min(1).max(16).nullable().default(null),
    advancePerGroup: z.number().int().min(1).max(8).default(2),
    roundRobinLegs: z.union([z.literal(1), z.literal(2)]).default(1),
    groupMatchBestOf: BEST_OF.default(1),
    knockoutBestOf: BEST_OF.default(3),
    finalBestOf: BEST_OF.default(5),
    pointsForWin: z.number().int().min(1).max(10).default(3),
    thirdPlaceMatch: z.boolean().default(false),
  })
  .refine((s) => s.minPlayersPerTeam <= s.maxPlayersPerTeam, {
    message: 'Minimum squad size must not exceed the maximum',
    path: ['minPlayersPerTeam'],
  })
  .refine((s) => s.timerResetSeconds <= s.bidTimerSeconds, {
    message: 'Timer reset must not exceed the bid timer',
    path: ['timerResetSeconds'],
  });

export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>;
export type TournamentSettingsInput = z.input<typeof tournamentSettingsSchema>;

export const DEFAULT_SETTINGS: TournamentSettings = tournamentSettingsSchema.parse({});

/** Parse stored jsonb (fills defaults for keys added later). Throws on invalid data. */
export function parseSettings(raw: unknown): TournamentSettings {
  return tournamentSettingsSchema.parse(raw ?? {});
}

/**
 * After Start, only these stay editable without an admin override (§1, §7.6a, CLAUDE.md).
 * Any other change is a logged override.
 */
export const EDITABLE_AFTER_START = [
  'bidTimerSeconds',
  'timerResetSeconds',
  'breakSeconds',
  'unsoldPolicy',
] as const satisfies readonly (keyof TournamentSettings)[];
export type EditableAfterStartKey = (typeof EDITABLE_AFTER_START)[number];
