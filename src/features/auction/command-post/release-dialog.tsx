'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ReleaseTarget {
  playerId: string;
  name: string;
  teamName: string;
  price: number;
}

interface ReleaseDialogProps {
  target: ReleaseTarget | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the release went through (the dialog then closes). */
  onConfirm: (target: ReleaseTarget, reason: string | undefined) => Promise<boolean>;
}

/** Release (§3.3): refund the squad, soldier back to the waiting pool. Optional reason. */
export function ReleaseDialog({ target, pending, onOpenChange, onConfirm }: ReleaseDialogProps) {
  const [reason, setReason] = useState('');
  const id = useId();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!target) return;
    const trimmed = reason.trim();
    if (await onConfirm(target, trimmed || undefined)) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Release {target?.name}</DialogTitle>
            <DialogDescription>
              {target
                ? `${target.teamName} gets ${target.price} MP back and ${target.name} returns to the waiting pool.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-reason`}>Reason (optional)</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              Release soldier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
