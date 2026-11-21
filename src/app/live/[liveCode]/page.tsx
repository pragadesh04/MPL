import { and, eq } from 'drizzle-orm';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { isFormatStatus } from '@/lib/navigation';
import { getReadDb } from '@/server/db/client';
import { tournaments } from '@/server/db/schema';

export const metadata = { title: 'Big screen' };

/**
 * `/live/[liveCode]`: the one link for the projector (§7.7). It sends the screen to Lane B's
 * auction view until the format starts, and to Lane C's groups / bracket / champion view from
 * the group draw on. No login; organisers can switch the live screen off (then 404).
 */
export default async function LivePage({ params }: PageProps<'/live/[liveCode]'>) {
  await connection();
  const { liveCode } = await params;
  const [row] = await getReadDb()
    .select({ status: tournaments.status })
    .from(tournaments)
    .where(and(eq(tournaments.liveCode, liveCode), eq(tournaments.liveScreenEnabled, true)))
    .limit(1);
  if (!row) notFound();
  redirect(
    isFormatStatus(row.status)
      ? `/live/${encodeURIComponent(liveCode)}/format`
      : `/live/${encodeURIComponent(liveCode)}/auction`,
  );
}
