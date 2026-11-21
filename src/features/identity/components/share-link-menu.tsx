'use client';

import { Copy, Link2Off, MessageCircle, QrCode, RefreshCw, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ParticipantKind } from '@/lib/schemas/enums';
import { api, errorMessage } from '../lib/api';
import { copyText, QrDialog, whatsappUrl } from './share';

/**
 * Share menu on BOTH captain and soldier rows (§2.2, §7.2): Copy link · WhatsApp · QR ·
 * Regenerate · Unlink. The link is fetched when needed (organisers with people:manage only).
 */
export function ShareLinkMenu({
  tournamentId,
  tournamentName,
  kind,
  rowId,
  name,
  claimed,
}: {
  tournamentId: string;
  tournamentName: string;
  kind: ParticipantKind;
  rowId: string;
  name: string;
  claimed: boolean;
}) {
  const router = useRouter();
  const [qr, setQr] = useState<string | null>(null);
  const base = `/api/tournaments/${tournamentId}/${kind === 'LEADER' ? 'leaders' : 'players'}/${rowId}`;
  const role = kind === 'LEADER' ? 'Captain' : 'Soldier';

  const getLink = async (): Promise<string | null> => {
    try {
      return (await api<{ link: string }>(`${base}/invite-link`)).link;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    }
  };
  const message = (link: string): string =>
    `Hi ${name}! You're invited to ${tournamentName} on MPL as ${role}. Open your personal link to join: ${link}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="secondary" aria-label={`Share link for ${name}`}>
            <Share2 aria-hidden /> Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              const link = await getLink();
              if (link) await copyText(link, 'Personal link copied');
            }}
          >
            <Copy aria-hidden /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              // Open the window synchronously (popup blockers), then point it at WhatsApp.
              const win = window.open('about:blank', '_blank');
              const link = await getLink();
              if (link && win) win.location.href = whatsappUrl(message(link));
              else win?.close();
            }}
          >
            <MessageCircle aria-hidden /> WhatsApp
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={async () => {
              const link = await getLink();
              if (link) setQr(link);
            }}
          >
            <QrCode aria-hidden /> QR code
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              try {
                const { link } = await api<{ link: string }>(`${base}/invite-link/regenerate`, {
                  method: 'POST',
                });
                await copyText(link, 'New link copied. The old link no longer works.');
                router.refresh();
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <RefreshCw aria-hidden /> Regenerate
          </DropdownMenuItem>
          {claimed ? (
            <DropdownMenuItem
              className="text-blood"
              onSelect={async () => {
                try {
                  await api(`${base}/unlink`, { method: 'POST' });
                  toast.success(`${name}'s spot is free again`);
                  router.refresh();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Link2Off aria-hidden /> Unlink account
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <QrDialog
        open={qr !== null}
        onOpenChange={(o) => !o && setQr(null)}
        title={`${name}'s personal link`}
        description={`Scan to join ${tournamentName} as ${role}`}
        value={qr ?? ''}
      />
    </>
  );
}
