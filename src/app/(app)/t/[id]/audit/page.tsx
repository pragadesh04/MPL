import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalTime } from '@/features/format/components/local-time';
import { TournamentHeader } from '@/features/format/components/tournament-header';
import { loadFormatPage } from '@/features/format/load-page';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getAuditLog } from '@/server/services/stats/stats';

export const metadata = { title: 'Audit log' };

function summary(v: Record<string, unknown> | null): string {
  if (!v) return '';
  const text = JSON.stringify(v);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * Audit-log viewer (§7.13): organisers (owner, co-admin, auctioneer) see every logged change,
 * newest first, filtered by action and actor. Everyone else gets 404.
 */
export default async function AuditPage({ params, searchParams }: PageProps<'/t/[id]/audit'>) {
  const { id } = await params;
  const sp = await searchParams;
  const action = typeof sp.action === 'string' ? sp.action : '';
  const actor = typeof sp.actor === 'string' ? sp.actor : '';
  let log;
  try {
    log = await getAuditLog(await getSessionUserId(), id, { action, actor });
  } catch (err) {
    if (isAppError(err) && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN')) notFound();
    throw err;
  }
  const data = await loadFormatPage(id);

  return (
    <>
      <TournamentHeader
        tournament={data.tournament}
        isOrganiser={data.viewer.isOrganiser}
        title="Audit log"
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="grid gap-1 text-sm">
          Action
          <select
            name="action"
            defaultValue={action}
            className="h-10 rounded-md border border-border bg-input px-2"
          >
            <option value="">All actions</option>
            {log.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Actor
          <Input name="actor" defaultValue={actor} placeholder="Name…" className="w-56" />
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {log.entries.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-muted">
          Nothing logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-surface-2/60 text-left text-xs font-bold tracking-widest text-muted uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  When
                </th>
                <th scope="col" className="px-3 py-2">
                  Action
                </th>
                <th scope="col" className="px-3 py-2">
                  By
                </th>
                <th scope="col" className="px-3 py-2">
                  Change
                </th>
                <th scope="col" className="px-3 py-2">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((e) => (
                <tr key={e.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted">
                    <LocalTime iso={e.createdAt} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-lime">{e.action}</td>
                  <td className="px-3 py-2">{e.actorName ?? 'System'}</td>
                  <td className="max-w-xl px-3 py-2 font-mono text-xs break-all text-muted">
                    {e.before ? <span className="block">before {summary(e.before)}</span> : null}
                    {e.after ? (
                      <span className="block text-foreground">after {summary(e.after)}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted">{e.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
