import { Badge } from '@/components/ui/badge';
import { StatusPill } from '@/components/ui/status-pill';
import type { JoinSource, LeaderInviteStatus } from '@/lib/schemas/enums';
import { teamStyle } from '@/lib/team-color';

const CHIP: Record<
  LeaderInviteStatus,
  { label: string; tone: 'neutral' | 'amber' | 'info' | 'success' }
> = {
  NOT_OPENED: { label: 'Link not opened', tone: 'neutral' },
  OPENED: { label: 'Opened', tone: 'amber' },
  ACCOUNT_LINKED: { label: 'Account linked', tone: 'info' },
  TEAM_READY: { label: 'Team ready', tone: 'success' },
};

/** Row tracking chip (§2.2, §7.2): grey / amber / blue / green (+ team colour when ready). */
export function InviteStatusChip({
  status,
  teamColor,
}: {
  status: LeaderInviteStatus;
  teamColor?: string | null;
}) {
  const chip = CHIP[status];
  if (status === 'TEAM_READY' && teamColor) {
    return (
      <span style={teamStyle(teamColor)} className="inline-flex items-center gap-1.5">
        <span aria-hidden className="bg-team size-2.5 rounded-full ring-1 ring-border" />
        <StatusPill tone="success">{chip.label}</StatusPill>
      </span>
    );
  }
  return <StatusPill tone={chip.tone}>{chip.label}</StatusPill>;
}

const SOURCE: Record<JoinSource, string> = {
  ADDED_BY_ORGANISER: 'Link',
  ORGANISER_KEY: 'Key',
  PLAYER_ID_REQUEST: 'Request',
};

export function SourceBadge({ source }: { source: JoinSource }) {
  return (
    <Badge variant="outline" title="How they joined">
      {SOURCE[source]}
    </Badge>
  );
}
