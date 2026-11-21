'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { MyOrganiserInvite } from '@/server/services/organisers/organisers';
import { api, errorMessage } from '../lib/api';
import { ROLE_LABEL } from '../lib/labels';

/** Pending organiser invites addressed to me (§7.1 dashboard banner). */
export function PendingInvitesBanner({ invites }: { invites: MyOrganiserInvite[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (invites.length === 0) return null;
  const accept = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      const res = await api<{ tournamentId: string }>(`/api/organiser-invites/${id}/accept`, {
        method: 'POST',
      });
      toast.success('You joined the organiser team');
      router.push(`/t/${res.tournamentId}/setup`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };
  return (
    <section aria-label="Organiser invites" className="grid gap-2">
      {invites.map((i) => (
        <div
          key={i.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck aria-hidden className="size-5 text-gold" />
            <span>
              <strong>{i.invitedBy}</strong> invited you to organise{' '}
              <strong>{i.tournamentName}</strong> as {ROLE_LABEL[i.role]}.
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            variant="gold"
            disabled={busy === i.id}
            onClick={() => accept(i.id)}
          >
            Accept
          </Button>
        </div>
      ))}
    </section>
  );
}
