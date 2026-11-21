'use client';

import type { ReactNode } from 'react';
import { RadioTowerIcon, ShieldCheckIcon, ShieldQuestionIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConsoleAccess } from './console-state';

interface ControllerBannerProps {
  access: ConsoleAccess;
  /** The viewer's role may run the console at all. */
  canControl: boolean;
  /** No organiser holds control yet. */
  nobody: boolean;
  disabled: boolean;
  onTakeControl: () => void;
}

/** "You're in control" / "<name> is running the auction · Take control" (§2.4, §7.6). */
export function ControllerBanner({
  access,
  canControl,
  nobody,
  disabled,
  onTakeControl,
}: ControllerBannerProps) {
  if (access.isController) {
    return (
      <Banner tone="lime" icon={<ShieldCheckIcon aria-hidden="true" />}>
        <span className="font-bold tracking-widest uppercase">You&apos;re in control</span>
        <span className="text-muted">Every console command runs under your name.</span>
      </Banner>
    );
  }
  if (nobody) {
    return (
      <Banner tone="neutral" icon={<ShieldQuestionIcon aria-hidden="true" />}>
        <span className="font-bold tracking-widest uppercase">
          Nobody is running the auction yet
        </span>
        <span className="text-muted">
          {canControl
            ? 'Your first console command takes control.'
            : (access.reason ?? 'Waiting for an organiser to take control.')}
        </span>
      </Banner>
    );
  }
  return (
    <Banner tone="amber" icon={<RadioTowerIcon aria-hidden="true" />}>
      <span className="font-bold tracking-widest uppercase">
        {access.controllerName} is running the auction
      </span>
      {canControl ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={disabled}
          onClick={onTakeControl}
        >
          Take control
        </Button>
      ) : (
        <span className="text-muted">{access.reason}</span>
      )}
    </Banner>
  );
}

interface BannerProps {
  tone: 'lime' | 'amber' | 'neutral';
  icon: ReactNode;
  children: ReactNode;
}

function Banner({ tone, icon, children }: BannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-2.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'lime' && 'border-lime/40 bg-lime/10 [&_svg]:text-lime',
        tone === 'amber' && 'border-amber/40 bg-amber/10 [&_svg]:text-amber',
        tone === 'neutral' && 'border-border bg-surface-2 [&_svg]:text-muted',
      )}
    >
      {icon}
      {children}
    </div>
  );
}
