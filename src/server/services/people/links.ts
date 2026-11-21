import 'server-only';
import { z } from 'zod';
import { decryptJson, encryptJson } from '../../auth/crypto';
import { env } from '../../env';

/**
 * Personal invite links (PLAN §2.2, §9 item 13): AES-256-GCM over `{ k, id, tid, v }` with
 * INVITE_LINK_SECRET, URL-safe Base64. A changed or invented token fails to decrypt; `v` must
 * equal the row's `link_version` (Regenerate bumps it). Every rejection is the same 404.
 */
const payloadSchema = z.object({
  k: z.enum(['L', 'P']),
  id: z.uuid(),
  tid: z.uuid(),
  v: z.number().int().positive(),
});
export type InvitePayload = z.infer<typeof payloadSchema>;

export function encodeInviteToken(payload: InvitePayload): string {
  return encryptJson(payload, env().INVITE_LINK_SECRET);
}

export function decodeInviteToken(token: string): InvitePayload | null {
  if (token.length > 512) return null;
  const parsed = payloadSchema.safeParse(decryptJson(token, env().INVITE_LINK_SECRET));
  return parsed.success ? parsed.data : null;
}

export function inviteUrl(token: string): string {
  return `${env().PUBLIC_APP_URL}/i/${token}`;
}

export function personalLink(
  kind: 'LEADER' | 'PLAYER',
  id: string,
  tournamentId: string,
  linkVersion: number,
): string {
  return inviteUrl(
    encodeInviteToken({ k: kind === 'LEADER' ? 'L' : 'P', id, tid: tournamentId, v: linkVersion }),
  );
}
