import 'server-only';
import {
  approveSchema,
  rejectSchema,
  updateLeaderSchema,
  updatePlayerSchema,
} from '@/features/identity/schemas';
import { approvePending, rejectPending, switchRole } from '@/server/services/people/approvals';
import { getSessionUserId, requireSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import {
  getPersonLink,
  listRoster,
  regeneratePersonLink,
  removePerson,
  unlinkPerson,
  updateLeader,
  updatePlayer,
  type PersonKind,
} from '@/server/services/people/people';

/**
 * Route Handler factories shared by the captain (`leaders/…`) and soldier (`players/…`) routes,
 * so both kinds behave identically. Each route file just picks the kind.
 */
type ListParams = { id: string };
type RowParams = { id: string; rowId: string };

export const listRoute = (kind: PersonKind) =>
  handle<ListParams>(async (_req, { params }) => {
    const { id } = await params;
    const roster = await listRoster(await getSessionUserId(), id);
    return json(kind === 'LEADER' ? { leaders: roster.captains } : { players: roster.soldiers });
  });

export const patchRoute = (kind: PersonKind) =>
  handle<RowParams>(async (req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    if (kind === 'LEADER') {
      await updateLeader(userId, id, rowId, await parseJson(req, updateLeaderSchema));
    } else {
      await updatePlayer(userId, id, rowId, await parseJson(req, updatePlayerSchema));
    }
    return json({ ok: true });
  });

export const deleteRoute = (kind: PersonKind) =>
  handle<RowParams>(async (_req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    await removePerson(userId, id, kind, rowId);
    return json({ ok: true });
  });

export const inviteLinkRoute = (kind: PersonKind) =>
  handle<RowParams>(async (_req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    return json(await getPersonLink(userId, id, kind, rowId));
  });

export const regenerateRoute = (kind: PersonKind) =>
  handle<RowParams>(async (_req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    return json(await regeneratePersonLink(userId, id, kind, rowId));
  });

export const approveRoute = (kind: PersonKind) =>
  handle<ListParams>(async (req, { params }) => {
    const userId = await requireSessionUserId();
    const { id } = await params;
    return json(await approvePending(userId, id, kind, await parseJson(req, approveSchema)));
  });

export const rejectRoute = (kind: PersonKind) =>
  handle<RowParams>(async (req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    await rejectPending(userId, id, kind, rowId, await parseJson(req, rejectSchema));
    return json({ ok: true });
  });

export const switchRoleRoute = (kind: PersonKind) =>
  handle<RowParams>(async (_req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    return json(await switchRole(userId, id, kind, rowId));
  });

export const unlinkRoute = (kind: PersonKind) =>
  handle<RowParams>(async (_req, { params }) => {
    const userId = await requireSessionUserId();
    const { id, rowId } = await params;
    await unlinkPerson(userId, id, kind, rowId);
    return json({ ok: true });
  });
