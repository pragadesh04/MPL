import { MpAmount } from '@/components/ui/mp-amount';
import { OpenSlot } from '@/components/ui/open-slot';
import { teamStyle } from '@/lib/team-color';
import { cn } from '@/lib/utils';

export interface TeamPreviewData {
  name: string;
  shortName: string;
  color: string;
  emoji?: string | null;
  motto?: string | null;
}

/**
 * Squad card as it will look in the auction / teams views (§7.4 live preview, §12 look):
 * team-colour top bar, short code + name (never colour alone), captain, open slots.
 */
export function TeamCardPreview({
  team,
  captainName,
  purse,
  slots = 3,
  className,
}: {
  team: TeamPreviewData;
  captainName: string;
  purse?: number;
  slots?: number;
  className?: string;
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(team.color);
  return (
    <div
      style={valid ? teamStyle(team.color.toLowerCase()) : undefined}
      className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}
    >
      <div className={cn('h-2', valid ? 'bg-team' : 'bg-surface-2')} />
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-12 items-center justify-center rounded-lg text-2xl',
              valid ? 'bg-team text-on-team' : 'bg-surface-2',
            )}
            aria-hidden
          >
            {team.emoji || team.shortName.slice(0, 1) || '?'}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="border-team text-team rounded-sm border px-1.5 font-display text-xs tracking-wider">
                {team.shortName || '???'}
              </span>
              <span className="truncate font-display text-xl tracking-wide">
                {team.name || 'Your team name'}
              </span>
            </p>
            {team.motto ? (
              <p className="truncate text-sm text-muted italic">“{team.motto}”</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>
            Captain <strong>{captainName}</strong>
          </span>
          {purse !== undefined ? <MpAmount value={purse} size="sm" /> : null}
        </div>
        <div className="grid gap-1.5">
          {Array.from({ length: slots }, (_, i) => (
            <OpenSlot key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Big-screen banner preview (1080p "leading team" strip). */
export function TeamBannerPreview({ team }: { team: TeamPreviewData }) {
  const valid = /^#[0-9a-f]{6}$/i.test(team.color);
  return (
    <div
      style={valid ? teamStyle(team.color.toLowerCase()) : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-4 py-3',
        valid ? 'bg-team text-on-team' : 'bg-surface-2',
      )}
    >
      <span className="text-2xl" aria-hidden>
        {team.emoji || '★'}
      </span>
      <span className="font-display text-2xl tracking-widest">{team.shortName || '???'}</span>
      <span className="truncate font-display text-lg tracking-wide">
        {team.name || 'Team name'}
      </span>
    </div>
  );
}
