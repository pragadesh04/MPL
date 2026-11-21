import type { MyOrganiserInvite } from '@/server/services/organisers/organisers';

/** Pending organiser invites banner (§7.1). Filled in by A3. */
export function PendingInvitesBanner({ invites }: { invites: MyOrganiserInvite[] }) {
  if (invites.length === 0) return null;
  return null;
}
