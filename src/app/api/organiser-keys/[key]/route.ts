import { clientIp, handle, json } from '@/server/http';
import { previewOrganiserKey } from '@/server/services/joining/organiserKey';

/** GET /api/organiser-keys/:key — public preview (organiser, active tournament, open?). */
export const GET = handle<{ key: string }>(async (req, { params }) => {
  const { key } = await params;
  return json(await previewOrganiserKey(key, clientIp(req)));
});
