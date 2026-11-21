import { listRoute } from '@/features/identity/server/person-routes';

/** GET /api/tournaments/:id/players — soldiers for organisers. */
export const GET = listRoute('PLAYER');
