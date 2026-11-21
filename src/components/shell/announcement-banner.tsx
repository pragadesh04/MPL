import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnnouncementBannerProps {
  /** One line posted by an organiser (§7). Nothing renders when empty. */
  text: string | null | undefined;
  className?: string;
}

/**
 * The announcement banner slot (§7, §7.6a). Shown on the tournament home, auction room,
 * dashboard and big screen. Lane C owns posting / clearing and live updates; this only renders.
 */
export function AnnouncementBanner({ text, className }: AnnouncementBannerProps) {
  if (!text?.trim()) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 border-b border-amber/40 bg-amber/10 px-4 py-2 text-sm font-semibold text-amber',
        className,
      )}
    >
      <Megaphone aria-hidden className="size-4 shrink-0" />
      <p className="truncate">{text}</p>
    </div>
  );
}
