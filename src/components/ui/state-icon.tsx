import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A quiet icon for empty and status states ("Auction starts soon", "Next soldier in 2…",
 * offline). A thin-bordered circle with a line icon: the plain replacement for the old mascot
 * illustrations (PLAN §7 visual direction).
 */
export function StateIcon({
  icon: Icon,
  size = 'md',
  tone = 'muted',
  className,
}: {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'muted' | 'lime' | 'gold';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface',
        size === 'sm' && 'size-10',
        size === 'md' && 'size-14',
        size === 'lg' && 'size-20',
        tone === 'muted' && 'text-muted',
        tone === 'lime' && 'text-lime',
        tone === 'gold' && 'text-gold',
        className,
      )}
    >
      <Icon
        strokeWidth={1.5}
        className={cn(
          size === 'sm' && 'size-5',
          size === 'md' && 'size-6',
          size === 'lg' && 'size-9',
        )}
      />
    </span>
  );
}
