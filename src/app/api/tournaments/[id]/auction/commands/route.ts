import { auctionCommandSchema } from '@/lib/schemas/auction';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { runAuctionCommand } from '@/server/services/auction/commands';

export const runtime = 'nodejs';

/**
 * POST /api/tournaments/:id/auction/commands — console and roster commands
 * (`next`, `sold`, `unsold`, `pause`, `resume`, `undo`, `take-control`, `start-round`, `release`,
 * `auction-again`, `assign`, `reset`). Answers with the fresh snapshot.
 */
export const POST = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const command = await parseJson(req, auctionCommandSchema);
  return json(await runAuctionCommand(await getSessionUserId(), id, command));
});
