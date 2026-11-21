import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { approveSchema, rejectSchema } from '@/features/identity/schemas';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { parseSettings } from '@/lib/schemas/settings';
import { getDb, withTransaction, type Db } from '../../db/client';
import { leaders, players } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import { writeAudit } from '../audit';
import { notify } from '../notifications/notifications';
import { lockTournament } from '../roster';
import { requireRole } from '../roles';
import { assertSetupEditable } from '../tournaments/tournaments';
import { checkAmounts } from './people';
import { afterRosterChange } from './roster-events';

/**
 * Path B approvals (PLAN §2.3 B, §7.2): organisers approve key sign-ups (purse for captains,
 * base price for soldiers — bulk with one value), reject with a reason, or switch the role.
 */

/** Bulk approve pending rows of one kind with one purse / base price. Returns approved ids. */
export async function approvePending(
  userId: string,
  tournamentId: string,
  kind: ParticipantKind,
  input: z.input<typeof approveSchema>,
  db: Db = getDb(),
): Promise<{ approved: string[] }> {
  const data = approveSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:approve', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const settings = parseSettings(tour.settings);
    let rows: { id: string; userId: string | null }[];
    let amount: number;
    if (kind === 'LEADER') {
      amount = checkAmounts(settings, 'LEADER', data.purse);
      rows = await tx
        .update(leaders)
        .set({
          approval: 'APPROVED',
          purseTotal: amount,
          purseRemaining: amount,
          rejectReason: null,
        })
        .where(
          and(
            eq(leaders.tournamentId, tournamentId),
            inArray(leaders.id, data.ids),
            eq(leaders.approval, 'PENDING'),
          ),
        )
        .returning({ id: leaders.id, userId: leaders.userId });
    } else {
      amount = checkAmounts(settings, 'PLAYER', data.basePrice);
      rows = await tx
        .update(players)
        .set({ status: 'POOL', basePrice: amount, rejectReason: null })
        .where(
          and(
            eq(players.tournamentId, tournamentId),
            inArray(players.id, data.ids),
            eq(players.status, 'PENDING_APPROVAL'),
          ),
        )
        .returning({ id: players.id, userId: players.userId });
    }
    if (rows.length === 0) throw conflict('Nobody selected is waiting for approval');
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.approved',
      after: { kind, ids: rows.map((r) => r.id), amount },
    });
    for (const r of rows) {
      if (!r.userId) continue;
      await notify(
        tx,
        onCommit,
        r.userId,
        'approval.approved',
        { tournamentId, tournamentName: tour.name, kind, amount },
        {
          tournamentId,
          event: { type: 'approval.changed', data: { kind, recordId: r.id, approval: 'APPROVED' } },
        },
      );
    }
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind, ids: rows.map((r) => r.id) },
    });
    return { approved: rows.map((r) => r.id) };
  }, db);
}

/** Reject one pending key sign-up with a reason. */
export async function rejectPending(
  userId: string,
  tournamentId: string,
  kind: ParticipantKind,
  id: string,
  input: z.input<typeof rejectSchema>,
  db: Db = getDb(),
): Promise<void> {
  const { reason } = rejectSchema.parse(input);
  await requireRole(userId, tournamentId, 'people:approve', db);
  await withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const [row] =
      kind === 'LEADER'
        ? await tx
            .update(leaders)
            .set({ approval: 'REJECTED', rejectReason: reason })
            .where(
              and(
                eq(leaders.id, id),
                eq(leaders.tournamentId, tournamentId),
                eq(leaders.approval, 'PENDING'),
              ),
            )
            .returning({ id: leaders.id, userId: leaders.userId })
        : await tx
            .update(players)
            .set({ status: 'REJECTED', rejectReason: reason })
            .where(
              and(
                eq(players.id, id),
                eq(players.tournamentId, tournamentId),
                eq(players.status, 'PENDING_APPROVAL'),
              ),
            )
            .returning({ id: players.id, userId: players.userId });
    if (!row) throw notFound();
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.rejected',
      after: { kind, id },
      reason,
    });
    if (row.userId) {
      await notify(
        tx,
        onCommit,
        row.userId,
        'approval.rejected',
        { tournamentId, tournamentName: tour.name, kind, reason },
        {
          tournamentId,
          event: { type: 'approval.changed', data: { kind, recordId: id, approval: 'REJECTED' } },
        },
      );
    }
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { kind, ids: [id] },
    });
  }, db);
}

/**
 * Captain ⇄ soldier before Start. The approval state carries over (pending stays pending;
 * approved gets the default purse / min base price). A captain's team is removed with the row.
 */
export async function switchRole(
  userId: string,
  tournamentId: string,
  kind: ParticipantKind,
  id: string,
  db: Db = getDb(),
): Promise<{ kind: ParticipantKind; id: string }> {
  await requireRole(userId, tournamentId, 'people:approve', db);
  return withTransaction(async (tx, onCommit) => {
    const tour = await lockTournament(tx, tournamentId);
    assertSetupEditable(tour.status);
    const settings = parseSettings(tour.settings);
    let newId: string;
    let target: { userId: string | null; pending: boolean };
    if (kind === 'LEADER') {
      const [row] = await tx
        .select()
        .from(leaders)
        .where(and(eq(leaders.id, id), eq(leaders.tournamentId, tournamentId)))
        .for('update');
      if (!row) throw notFound();
      if (row.approval === 'REJECTED') throw badRequest('Rejected sign-ups can’t switch role');
      const pending = row.approval === 'PENDING';
      await tx.delete(leaders).where(eq(leaders.id, id));
      const [inserted] = await tx
        .insert(players)
        .values({
          tournamentId,
          userId: row.userId,
          name: row.name,
          ign: row.ign,
          phone: row.phone,
          photoUrl: row.photoUrl,
          source: row.source,
          inviteStatus: row.userId ? 'ACCOUNT_LINKED' : 'NOT_OPENED',
          lastActivityAt: row.lastActivityAt,
          status: pending ? 'PENDING_APPROVAL' : 'POOL',
          basePrice: pending ? 0 : settings.minBasePrice,
        })
        .returning({ id: players.id });
      newId = inserted!.id;
      target = { userId: row.userId, pending };
    } else {
      const [row] = await tx
        .select()
        .from(players)
        .where(and(eq(players.id, id), eq(players.tournamentId, tournamentId)))
        .for('update');
      if (!row) throw notFound();
      if (row.status === 'REJECTED') throw badRequest('Rejected sign-ups can’t switch role');
      const pending = row.status === 'PENDING_APPROVAL';
      await tx.delete(players).where(eq(players.id, id));
      const purse = pending ? 0 : settings.defaultPurse;
      const [inserted] = await tx
        .insert(leaders)
        .values({
          tournamentId,
          userId: row.userId,
          name: row.name,
          ign: row.ign,
          phone: row.phone,
          photoUrl: row.photoUrl,
          source: row.source,
          inviteStatus: row.userId ? 'ACCOUNT_LINKED' : 'NOT_OPENED',
          lastActivityAt: row.lastActivityAt,
          approval: pending ? 'PENDING' : 'APPROVED',
          purseTotal: purse,
          purseRemaining: purse,
        })
        .returning({ id: leaders.id });
      newId = inserted!.id;
      target = { userId: row.userId, pending };
    }
    const newKind: ParticipantKind = kind === 'LEADER' ? 'PLAYER' : 'LEADER';
    await writeAudit(tx, {
      tournamentId,
      actorUserId: userId,
      action: 'people.role_switched',
      before: { kind, id },
      after: { kind: newKind, id: newId },
    });
    if (target.userId) {
      await notify(
        tx,
        onCommit,
        target.userId,
        'role.switched',
        { tournamentId, tournamentName: tour.name, kind: newKind },
        { tournamentId },
      );
    }
    await afterRosterChange(tx, tournamentId, onCommit, {
      type: 'people.updated',
      data: { ids: [id, newId] },
    });
    return { kind: newKind, id: newId };
  }, db);
}
