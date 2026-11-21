import { Crosshair, Trophy } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** "I'm a player" / "I'm organising a tournament" cards at the top of sign-up (§7.0). */
export function AccountTypeCards({
  active,
  keyParam,
}: {
  active: 'PLAYER' | 'ORGANISER';
  keyParam?: string;
}) {
  const cards = [
    {
      type: 'PLAYER' as const,
      href: keyParam ? `/register?key=${encodeURIComponent(keyParam)}` : '/register',
      title: "I'm a player",
      help: 'Captain or soldier',
      Icon: Crosshair,
    },
    {
      type: 'ORGANISER' as const,
      href: '/register/organiser',
      title: "I'm organising a tournament",
      help: 'Run the auction and the bracket',
      Icon: Trophy,
    },
  ];
  return (
    <nav aria-label="Account type" className="grid grid-cols-2 gap-3">
      {cards.map(({ type, href, title, help, Icon }) => (
        <Link
          key={type}
          href={href}
          aria-current={active === type ? 'page' : undefined}
          className={cn(
            'flex flex-col gap-1 rounded-lg border p-3 transition-colors',
            active === type
              ? 'border-lime bg-lime/10 shadow-glow'
              : 'border-border bg-surface hover:border-lime-dim',
          )}
        >
          <Icon
            aria-hidden
            className={cn('size-5', active === type ? 'text-lime' : 'text-muted')}
          />
          <span className="leading-tight font-semibold">{title}</span>
          <span className="text-xs text-muted">{help}</span>
        </Link>
      ))}
    </nav>
  );
}
