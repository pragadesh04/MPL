'use client';

import { Inbox } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MpAmount } from '@/components/ui/mp-amount';
import type { MyRequest } from '@/server/services/joining/requests';
import { api, errorMessage } from '../lib/api';
import { LiveRefresh } from './live-refresh';
import { expiryText } from './request-rows';

/**
 * Requests inbox (§2.3 C, §7.1): "Ravi invites you to MPL Season 2 as Captain · 50 MP purse"
 * with Accept / Decline / Decline & block. New requests arrive live on `u:<userId>`.
 */
export function RequestsInbox({ userId, requests }: { userId: string; requests: MyRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (r: MyRequest, action: 'accept' | 'decline' | 'block'): Promise<void> => {
    setBusy(r.id);
    try {
      if (action === 'accept') {
        const res = await api<{ tournamentId: string; kind: 'LEADER' | 'PLAYER' }>(
          `/api/me/requests/${r.id}/accept`,
          { method: 'POST' },
        );
        toast.success(`You joined ${r.tournamentName}`);
        router.push(
          res.kind === 'LEADER'
            ? `/t/${res.tournamentId}/teams/setup`
            : `/t/${res.tournamentId}/people/me`,
        );
      } else {
        await api(`/api/me/requests/${r.id}/decline`, { body: { block: action === 'block' } });
        toast.success(action === 'block' ? 'Declined and blocked' : 'Declined');
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <LiveRefresh userId={userId} />
      {requests.length === 0 ? null : (
        <Card className="border-gold/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox aria-hidden className="size-5 text-gold" /> Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:flex sm:items-center sm:justify-between"
                >
                  <div>
                    <p>
                      <strong>{r.organiserName}</strong> invites you to{' '}
                      <strong className="text-lime">{r.tournamentName}</strong> as{' '}
                      <strong>{r.role === 'LEADER' ? 'Captain' : 'Soldier'}</strong> ·{' '}
                      <MpAmount
                        value={(r.role === 'LEADER' ? r.purse : r.basePrice) ?? 0}
                        size="sm"
                      />{' '}
                      {r.role === 'LEADER' ? 'purse' : 'base price'}
                    </p>
                    <p className="text-xs text-muted">{expiryText(r.expiresAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === r.id}
                      onClick={() => act(r, 'accept')}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy === r.id}
                      onClick={() => act(r, 'decline')}
                    >
                      Decline
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy === r.id}
                      onClick={() => act(r, 'block')}
                    >
                      Decline & block
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
