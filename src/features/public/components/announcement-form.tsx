'use client';

import { Megaphone, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { apiRequest, errorMessage } from '@/features/format/client-api';

interface Values {
  text: string;
}

/** Post / clear the one-line announcement banner (§7, owner / co-admin). Updates live everywhere. */
export function AnnouncementForm({
  tournamentId,
  current,
}: {
  tournamentId: string;
  current: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const form = useForm<Values>({ values: { text: current ?? '' } });

  async function save(text: string | null): Promise<void> {
    setBusy(true);
    try {
      await apiRequest('PUT', `/api/tournaments/${tournamentId}/announcement`, { text });
      toast.success(text ? 'Announcement posted' : 'Announcement cleared');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface/60 p-3"
      onSubmit={form.handleSubmit((v) => save(v.text.trim() || null))}
    >
      <div className="grid min-w-60 flex-1 gap-1">
        <Label htmlFor="announcement">Announcement banner</Label>
        <Input
          id="announcement"
          maxLength={200}
          placeholder="The match schedule will be released tomorrow. Stay connected!"
          {...form.register('text')}
        />
      </div>
      <Button type="submit" disabled={busy}>
        <Megaphone aria-hidden /> Post
      </Button>
      {current ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => save(null)}>
          <X aria-hidden /> Clear
        </Button>
      ) : null}
    </form>
  );
}
