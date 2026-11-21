'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '../lib/api';
import { FormError } from './form-field';

/** Accept an organiser invite link (§2.4). */
export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api<{ tournamentId: string }>(
              `/api/organiser-invites/${encodeURIComponent(token)}/accept`,
              { method: 'POST' },
            );
            router.push(`/t/${res.tournamentId}/setup`);
            router.refresh();
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Accept invite
      </Button>
    </div>
  );
}
