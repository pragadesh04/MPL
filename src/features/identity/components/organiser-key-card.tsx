'use client';

import { KeyRound, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatKey } from '@/lib/rules/keys';
import { api, errorMessage } from '../lib/api';
import { CopyButton, QrButton, WhatsAppButton } from './share';

/** The organiser key card (§7.1, §7.2 People → "Share organiser key"). */
export function OrganiserKeyCard({
  organiserKey,
  appUrl,
  children,
}: {
  organiserKey: string;
  appUrl: string;
  /** Extra controls (registration toggle, counter) on the People page. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const display = formatKey(organiserKey, 'ORGANISER_KEY');
  const link = `${appUrl}/register?key=${organiserKey}`;
  const message = `Join my Mini Militia tournament on MPL: ${link} (organiser key ${display})`;

  const regenerate = async (): Promise<void> => {
    setBusy(true);
    try {
      await api('/api/me/organiser-key/regenerate', { method: 'POST' });
      toast.success('New key ready. The old key no longer works.');
      setConfirming(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-5 text-lime" /> Organiser key
        </CardTitle>
        <CardDescription>
          Players enter this key when they sign up. It always points to your active tournament.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p
          className="font-display text-5xl tracking-[0.2em] text-lime"
          aria-label={`Organiser key ${display.split('').join(' ')}`}
        >
          {display}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={display} label="Copy key" toastLabel="Key copied" />
          <CopyButton text={link} label="Copy link" toastLabel="Link copied" />
          <WhatsAppButton text={message} />
          <QrButton title={`Organiser key ${display}`} description="Scan to sign up" value={link} />
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            <RefreshCw aria-hidden /> Regenerate
          </Button>
        </div>
        {children}
      </CardContent>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate your organiser key?</DialogTitle>
            <DialogDescription>
              {display} stops working at once. People who already signed up stay in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="destructive" type="button" disabled={busy} onClick={regenerate}>
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
