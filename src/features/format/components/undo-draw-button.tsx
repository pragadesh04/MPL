'use client';

import { Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { apiRequest, errorMessage } from '../client-api';

/** Undo the group draw (only while no match has started), so the organiser can redraw. */
export function UndoDrawButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function undo(): Promise<void> {
    setBusy(true);
    try {
      await apiRequest('DELETE', `/api/tournaments/${tournamentId}/groups/draw`);
      toast.success('Draw undone. You can draw again.');
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Undo2 aria-hidden /> Undo draw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undo the group draw?</DialogTitle>
          <DialogDescription>
            Every group, fixture and the knockout tree are removed and the tournament goes back to
            the draw. This is logged. It’s only possible while no match has started.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Keep the draw
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={busy} onClick={undo}>
            Undo draw
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
