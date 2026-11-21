'use client';

import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, errorMessage } from '../lib/api';
import { CopyButton, WhatsAppButton } from './share';

/** Participants → Reset password (§2.5, §7.3): a one-time link, valid 30 minutes. */
export function ResetPasswordButton({
  tournamentId,
  userId,
  name,
}: {
  tournamentId: string;
  userId: string;
  name: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Reset password for ${name}`}
        title="Reset password"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api<{ link: string }>(
              `/api/tournaments/${tournamentId}/participants/${userId}/reset-password`,
              { method: 'POST' },
            );
            setLink(res.link);
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeyRound aria-hidden />
      </Button>
      <Dialog open={link !== null} onOpenChange={(o) => !o && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset link for {name}</DialogTitle>
            <DialogDescription>
              One-time link, valid for 30 minutes. Send it to {name} on WhatsApp.
            </DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="grid gap-3">
              <p className="text-xs break-all text-muted">{link}</p>
              <div className="flex gap-2">
                <CopyButton text={link} toastLabel="Reset link copied" />
                <WhatsAppButton
                  text={`Hi ${name}, set a new MPL password here (valid 30 min): ${link}`}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
