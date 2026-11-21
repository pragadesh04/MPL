import { TeamChip } from '@/components/ui/team-chip';
import { cn } from '@/lib/utils';
import type { TeamView } from '../types';

/**
 * One side of a match: the team chip (colour + short code + name) once decided, otherwise the
 * placeholder in muted italics ("Group A #1", "Winner of M9", "BYE"), §4.6 / §7.10a.
 */
export function TeamSlot({
  team,
  label,
  size = 'default',
  hideName = false,
  winner = false,
  className,
}: {
  team: TeamView | undefined;
  label: string | null;
  size?: 'sm' | 'default' | 'lg';
  hideName?: boolean;
  winner?: boolean;
  className?: string;
}) {
  if (!team) {
    return (
      <span
        className={cn('truncate text-sm text-muted italic', size === 'sm' && 'text-xs', className)}
      >
        {label ?? 'TBD'}
      </span>
    );
  }
  return (
    <TeamChip
      name={team.name}
      shortName={team.shortName}
      color={team.color}
      size={size}
      hideName={hideName}
      className={cn(winner && 'font-bold', className)}
    />
  );
}
