'use client';

import { FileUp } from 'lucide-react';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { addPersonSchema } from '../schemas';
import { api, errorMessage } from '../lib/api';
import { FormError } from './form-field';

const FIELDS = ['type', 'name', 'ign', 'amount'] as const;
type Field = (typeof FIELDS)[number];
const FIELD_LABEL: Record<Field, string> = {
  type: 'Type (captain / soldier)',
  name: 'Name',
  ign: 'IGN',
  amount: 'Purse / base price',
};

function guess(header: string): Field | '' {
  const h = header.toLowerCase();
  if (/type|role|kind/.test(h)) return 'type';
  if (/ign|in.?game|gamer/.test(h)) return 'ign';
  if (/purse|price|base|mp|amount/.test(h)) return 'amount';
  if (/name/.test(h)) return 'name';
  return '';
}

function toKind(raw: string | undefined, fallback: 'LEADER' | 'PLAYER'): 'LEADER' | 'PLAYER' {
  const v = (raw ?? '').trim().toLowerCase();
  if (/^(c|captain|leader|l)$/.test(v)) return 'LEADER';
  if (/^(s|soldier|player|p)$/.test(v)) return 'PLAYER';
  return fallback;
}

/** CSV import with column mapping and a validation preview (§7.2 step 3). */
export function ImportPeopleDialog({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, Field | ''>>({});
  const [fallback, setFallback] = useState<'LEADER' | 'PLAYER'>('PLAYER');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (file: File): void => {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hs = res.meta.fields ?? [];
        setHeaders(hs);
        setData(res.data.slice(0, 200));
        setMapping(Object.fromEntries(hs.map((h) => [h, guess(h)])));
      },
      error: (err) => setError(err.message),
    });
  };

  const rows = useMemo(() => {
    const col = (f: Field): string | undefined => headers.find((h) => mapping[h] === f);
    return data.map((r) => {
      const get = (f: Field): string => {
        const h = col(f);
        return h ? (r[h] ?? '').trim() : '';
      };
      const kind = toKind(get('type'), fallback);
      const amount = get('amount');
      const candidate = {
        type: kind,
        name: get('name'),
        ign: get('ign'),
        ...(amount ? (kind === 'LEADER' ? { purse: amount } : { basePrice: amount }) : {}),
      };
      const parsed = addPersonSchema.safeParse(candidate);
      return {
        candidate,
        ok: parsed.success,
        issue: parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid'),
      };
    });
  }, [data, headers, mapping, fallback]);
  const valid = rows.filter((r) => r.ok);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ added: unknown[] }>(
        `/api/tournaments/${tournamentId}/people/import`,
        {
          body: { rows: valid.map((r) => r.candidate) },
        },
      );
      toast.success(`Imported ${res.added.length} people, each with a personal link`);
      setOpen(false);
      setData([]);
      setHeaders([]);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <FileUp aria-hidden /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import captains and soldiers</DialogTitle>
          <DialogDescription>
            Upload a CSV (export from Excel or Google Sheets). Each row gets a personal link.
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-foreground"
        />
        <FormError message={error} />
        {headers.length > 0 ? (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {headers.map((h) => (
                <label key={h} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{h}</span>
                  <select
                    value={mapping[h] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [h]: e.target.value as Field | '' }))
                    }
                    className="h-9 rounded-md border border-border bg-input px-2"
                  >
                    <option value="">Ignore</option>
                    {FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              Rows without a type are
              <select
                value={fallback}
                onChange={(e) => setFallback(e.target.value as 'LEADER' | 'PLAYER')}
                className="h-9 rounded-md border border-border bg-input px-2"
              >
                <option value="PLAYER">Soldiers</option>
                <option value="LEADER">Captains</option>
              </select>
            </label>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-xs uppercase">
                  <tr>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">IGN</th>
                    <th className="px-2 py-1">MP</th>
                    <th className="px-2 py-1">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">
                        {r.candidate.type === 'LEADER' ? 'Captain' : 'Soldier'}
                      </td>
                      <td className="px-2 py-1">{r.candidate.name}</td>
                      <td className="px-2 py-1">{r.candidate.ign}</td>
                      <td className="px-2 py-1">
                        {'purse' in r.candidate
                          ? r.candidate.purse
                          : 'basePrice' in r.candidate
                            ? r.candidate.basePrice
                            : '–'}
                      </td>
                      <td className={r.ok ? 'px-2 py-1 text-lime' : 'px-2 py-1 text-blood'}>
                        {r.ok ? 'OK' : r.issue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" disabled={busy || valid.length === 0} onClick={submit}>
            Import {valid.length} {valid.length === 1 ? 'person' : 'people'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
