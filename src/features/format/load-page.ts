import 'server-only';
import { notFound } from 'next/navigation';
import { getSessionUserId } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { getFormatPageData } from '@/server/services/format/data';
import type { FormatPageData } from './types';

/**
 * Load a Lane C page for the logged-in participant. Anyone outside the tournament (or a malformed
 * id) gets the Next.js 404 page, never a hint that the tournament exists (§2.0, §4.6).
 */
export async function loadFormatPage(tournamentId: string): Promise<FormatPageData> {
  try {
    return await getFormatPageData(await getSessionUserId(), tournamentId);
  } catch (err) {
    if (isAppError(err) && (err.code === 'NOT_FOUND' || err.code === 'FORBIDDEN')) notFound();
    throw err;
  }
}
