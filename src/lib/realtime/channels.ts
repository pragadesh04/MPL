/**
 * Ably channel names (PLAN §6.3). Shared by the server publisher, the token capability builder
 * and the browser. Never build channel names by hand anywhere else.
 */

/** `t:<id>:auction` — lot.opened, bid.placed, lot.closed, auction.paused/resumed, control.changed, allocation.step */
export const auctionChannel = (tournamentId: string): string => `t:${tournamentId}:auction`;

/** `t:<id>:updates` — people.updated, team.updated, groups.updated, match.updated, tournament.status */
export const updatesChannel = (tournamentId: string): string => `t:${tournamentId}:updates`;

/** `t:<id>:presence` — Ably presence for captains and organisers (online dots). */
export const presenceChannel = (tournamentId: string): string => `t:${tournamentId}:presence`;

/** `u:<userId>` — personal inbox: request.received/cancelled, approval.changed, notification.new */
export const userChannel = (userId: string): string => `u:${userId}`;

export type ChannelKind = 'auction' | 'updates' | 'presence' | 'user';

/** Parse a channel name back into its kind and id, or null if it isn't one of ours. */
export function parseChannel(name: string): { kind: ChannelKind; id: string } | null {
  const t = /^t:([0-9a-f-]{36}):(auction|updates|presence)$/i.exec(name);
  if (t?.[1] && t[2]) return { kind: t[2] as 'auction' | 'updates' | 'presence', id: t[1] };
  const u = /^u:([0-9a-f-]{36})$/i.exec(name);
  if (u?.[1]) return { kind: 'user', id: u[1] };
  return null;
}
