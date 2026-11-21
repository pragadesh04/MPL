import 'server-only';
import type { Db } from '../db/client';
import { auditLog } from '../db/schema';

/**
 * Append to the tournament audit log (PLAN §1 "Rule", §3.3). Call it inside the same transaction
 * as the change it records, so the log and the data can never disagree. Every admin override,
 * sale, undo, release, assign, allocation, reset, take-control and unlink must be logged.
 *
 * Action names: dotted, past tense, e.g. 'auction.sold', 'auction.undo', 'people.unlinked',
 * 'settings.override', 'team.renamed'.
 */
export interface AuditEntry {
  tournamentId: string;
  actorUserId: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

export async function writeAudit(tx: Db, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    tournamentId: entry.tournamentId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
