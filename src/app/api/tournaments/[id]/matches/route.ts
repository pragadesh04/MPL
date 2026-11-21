import { z } from 'zod';
import { idSchema } from '@/lib/schemas/domain';
import { matchStageSchema, matchStatusSchema } from '@/lib/schemas/enums';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseQuery } from '@/server/http';
import { getMatchesHub } from '@/server/services/matches/hub';

const querySchema = z.object({
  view: z.enum(['list', 'tree']).default('list'),
  stage: matchStageSchema.optional(),
  team: idSchema.optional(),
  group: idSchema.optional(),
  status: matchStatusSchema.optional(),
  q: z.string().max(60).optional(),
});

/** GET /api/tournaments/:id/matches?view=list|tree&stage=&team=&group=&status=&q= (§5 API). */
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const q = parseQuery(req, querySchema);
  return json(
    await getMatchesHub(await getSessionUserId(), id, {
      view: q.view,
      filters: { stage: q.stage, teamId: q.team, groupId: q.group, status: q.status, search: q.q },
    }),
  );
});
