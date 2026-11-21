'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { InitialsAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MpAmount } from '@/components/ui/mp-amount';
import { StatusPill } from '@/components/ui/status-pill';
import { formatKey } from '@/lib/rules/keys';
import type { JoinRequestStatus } from '@/lib/schemas/enums';
import type { OutgoingRequest } from '@/server/services/joining/requests';
import { api, errorMessage } from '../lib/api';

const TONE: Record<JoinRequestStatus, 'amber' | 'success' | 'blood' | 'neutral'> = {
  PENDING: 'amber',
  ACCEPTED: 'success',
  DECLINED: 'blood',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
};
const LABEL: Record<JoinRequestStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export function expiryText(expiresAt: Date | string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `expires in ${d}d ${h}h` : `expires in ${h}h`;
}

/** "Requests sent" row (§7.2): Player ID, card, role, sent time, expiry, status, Cancel. */
export function RequestRow({
  tournamentId,
  request: r,
  canCancel,
}: {
  tournamentId: string;
  request: OutgoingRequest;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <InitialsAvatar name={r.player.displayName} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {r.player.displayName}{' '}
          <span className="font-normal text-muted">
            {r.player.ign ? `${r.player.ign} · ` : ''}
            {formatKey(r.player.playerCode, 'PLAYER_CODE')}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusPill tone={TONE[r.status]}>{LABEL[r.status]}</StatusPill>
          <span>{r.role === 'LEADER' ? 'Captain' : 'Soldier'}</span>
          <MpAmount value={(r.role === 'LEADER' ? r.purse : r.basePrice) ?? 0} size="sm" />
          <span>
            sent {new Date(r.createdAt).toLocaleDateString()} by {r.sentBy}
          </span>
          {r.status === 'PENDING' ? <span>· {expiryText(r.expiresAt)}</span> : null}
        </div>
      </div>
      {r.status === 'PENDING' && canCancel ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/tournaments/${tournamentId}/requests/${r.id}`, { method: 'DELETE' });
              toast.success('Request cancelled');
              router.refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <X aria-hidden /> Cancel
        </Button>
      ) : null}
    </li>
  );
}
