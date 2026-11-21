import { announcementRequestSchema } from '@/features/format/schemas';
import { getSessionUserId } from '@/server/auth/session';
import { handle, json, parseJson } from '@/server/http';
import { setAnnouncement } from '@/server/services/announcements/announcement';

/** PUT /api/tournaments/:id/announcement — `{ text }` posts the banner, `{ text: null }` clears it. */
export const PUT = handle<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { text } = await parseJson(req, announcementRequestSchema);
  return json(await setAnnouncement(await getSessionUserId(), id, text));
});
