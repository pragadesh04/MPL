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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ConfirmDialogBase {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
}

interface UndoDialogProps extends ConfirmDialogBase {
  /** Resolves true when the undo went through (the dialog then closes). */
  onConfirm: (reason: string) => Promise<boolean>;
}

/** Undo last sale (§3.3, §7.6): confirm with a reason, which goes into the audit log. */
export function UndoDialog({ open, onOpenChange, pending, onConfirm }: UndoDialogProps) {
  const [reason, setReason] = useState('');
  const id = useId();
  const trimmed = reason.trim();

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!trimmed) return;
    if (await onConfirm(trimmed)) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Undo last sale</DialogTitle>
            <DialogDescription>
              Refunds the squad and puts the soldier back at the front of the pool.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={500}
              placeholder="Wrong team entered, captain disconnected…"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!trimmed || pending}>
              Undo sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ResetDialogProps extends ConfirmDialogBase {
  tournamentName: string;
  onConfirm: (confirmName: string) => Promise<boolean>;
}

/** Reset auction (owner only, §3.3): type the tournament name exactly to arm the button. */
export function ResetDialog({
  open,
  onOpenChange,
  pending,
  tournamentName,
  onConfirm,
}: ResetDialogProps) {
  const [typed, setTyped] = useState('');
  const id = useId();
  const matches = typed === tournamentName;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!matches) return;
    if (await onConfirm(typed)) {
      setTyped('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-blood">Reset auction</DialogTitle>
            <DialogDescription>
              Clears every bid, sale and the auction state, and refunds all purses. Captains,
              soldiers and teams stay. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>
              Type <span className="font-bold text-foreground">{tournamentName}</span> to confirm
            </Label>
            <Input
              id={`${id}-name`}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              Reset auction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '1 – 9', action: 'Fallback bid for team N' },
  { keys: 'S', action: 'Sold now' },
  { keys: 'U', action: 'Mark unsold' },
  { keys: 'Space', action: 'Pause / resume' },
  { keys: 'N', action: 'Next soldier' },
  { keys: 'Ctrl + Z', action: 'Undo last sale' },
  { keys: '?', action: 'This cheat sheet' },
];

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Keyboard cheat sheet (`?`). */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Field shortcuts</DialogTitle>
          <DialogDescription>Keys work while no field or dialog has focus.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="contents">
              <dt>
                <kbd className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 font-numeric text-xs">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-muted">{s.action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
