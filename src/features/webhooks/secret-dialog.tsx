'use client';

import * as React from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SecretDialogProps {
  secret: string | null;
  onClose: () => void;
}

/** Shows a new GENERIC webhook's signing secret exactly once. */
export function SecretDialog({ secret, onClose }: SecretDialogProps): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);

  const copy = async (): Promise<void> => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Copy it now and store it with your receiver. You won’t see it again; to get a new one,
            delete this webhook and add it again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-lime-dim bg-input p-3">
          <code className="min-w-0 flex-1 font-numeric text-sm break-all text-lime">{secret}</code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void copy()}
            aria-label={copied ? 'Secret copied' : 'Copy secret'}
          >
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Verify each request: <code className="font-numeric">X-MPL-Signature</code> = sha256=
          HMAC-SHA256 (secret, <code className="font-numeric">X-MPL-Timestamp</code> + &quot;.&quot;
          + raw body), and reject old timestamps.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I’ve saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
