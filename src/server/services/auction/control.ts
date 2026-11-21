import 'server-only';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema';
import { ruleViolation } from '../../errors';
import { writeAudit } from '../audit';
import { emit, touchState, type AuctionCtx } from './engine';

/**
 * Console controller lock (PLAN §2.4, §7.6): one organiser runs the console at a time. The first
 * organiser to issue a console command when nobody holds control takes it automatically; anyone
 * else must press "Take control" (logged).
 */
export async function takeControl(ctx: AuctionCtx, userId: string): Promise<void> {
  const previous = ctx.state.controllerUserId;
  if (previous === userId) return;
  ctx.state.controllerUserId = userId;
  touchState(ctx);
  await writeAudit(ctx.tx, {
    tournamentId: ctx.tournamentId,
    actorUserId: userId,
    action: 'auction.control_taken',
    before: { controllerUserId: previous },
    after: { controllerUserId: userId },
  });
  emit(ctx, 'control.changed', { controllerUserId: userId });
}

export async function ensureController(ctx: AuctionCtx, userId: string): Promise<void> {
  const controller = ctx.state.controllerUserId;
  if (controller === null) return takeControl(ctx, userId);
  if (controller === userId) return;
  const [row] = await ctx.tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, controller));
  throw ruleViolation(
    'NOT_CONTROLLER',
    `${row?.name ?? 'Another organiser'} is running the auction. Take control first.`,
  );
}
