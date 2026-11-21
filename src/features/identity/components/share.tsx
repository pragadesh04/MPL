'use client';

import { Check, Copy, MessageCircle, QrCode, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

/** `https://wa.me/?text=…` — opens WhatsApp with the message ready to send (no email, §2.5). */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyText(text: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error('Couldn’t copy — long-press to copy instead');
  }
}

export function CopyButton({
  text,
  label = 'Copy',
  toastLabel,
  size = 'sm',
  variant = 'secondary',
}: {
  text: string;
  label?: string;
  toastLabel?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'secondary' | 'outline' | 'ghost';
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      aria-label={size === 'icon' ? label : undefined}
      onClick={async () => {
        await copyText(text, toastLabel);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {size === 'icon' ? null : label}
    </Button>
  );
}

export function WhatsAppButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'default' }) {
  return (
    <Button asChild size={size} variant="secondary">
      <a href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden /> WhatsApp
      </a>
    </Button>
  );
}

/** Large scannable QR (dark on light, theme tokens only). */
export function QrCode2({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <div className="rounded-lg bg-foreground p-4 text-background">
      <QRCodeSVG value={value} size={size} fgColor="currentColor" bgColor="transparent" level="M" />
    </div>
  );
}

export function QrDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <QrCode2 value={value} />
          <p className="max-w-full text-center text-xs break-all text-muted">{value}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function QrButton(props: { title: string; description?: string; value: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <QrCode aria-hidden /> QR
      </Button>
      <QrDialog open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}

/** Native share sheet when available, otherwise copy. */
export function NativeShareButton({
  title,
  text,
  url,
}: {
  title: string;
  text: string;
  url?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        if (typeof navigator !== 'undefined' && 'share' in navigator) {
          try {
            await navigator.share({ title, text, url });
            return;
          } catch {
            // cancelled → fall through to copy
          }
        }
        await copyText(url ? `${text} ${url}` : text);
      }}
    >
      <Share2 aria-hidden /> Share
    </Button>
  );
}
