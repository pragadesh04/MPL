'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, errorMessage } from '../lib/api';
import { FormError, FormField } from './form-field';

export interface CopySource {
  id: string;
  name: string;
}

/**
 * "New tournament" with "Copy settings from…" (§7.1). Disabled while one is active, with the
 * tooltip "Complete or cancel <name> first". The server enforces the rule (409) regardless.
 */
export function NewTournamentButton({
  activeName,
  copySources,
}: {
  activeName: string | null;
  copySources: CopySource[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (activeName) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            <Button type="button" disabled>
              <Plus aria-hidden /> New tournament
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Complete or cancel {activeName} first</TooltipContent>
      </Tooltip>
    );
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/api/tournaments', {
        body: { name, ...(copyFrom ? { copySettingsFrom: copyFrom } : {}) },
      });
      router.push(`/t/${created.id}/setup`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New tournament
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New tournament</DialogTitle>
              <DialogDescription>
                You can change everything until you press Start.
              </DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            <FormField id="tournament-name" label="Name">
              <Input
                id="tournament-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="MPL Season 3"
                required
                minLength={3}
                maxLength={60}
              />
            </FormField>
            {copySources.length > 0 ? (
              <FormField
                id="copy-from"
                label="Copy settings from…"
                hint="Rules, increments and format. People are never copied."
              >
                <select
                  id="copy-from"
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  className="h-10 rounded-md border border-border bg-input px-3 text-sm"
                >
                  <option value="">Default settings</option>
                  {copySources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={busy || name.trim().length < 3}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
