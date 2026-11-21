import { listRoute } from '@/features/identity/server/person-routes';

/** GET /api/tournaments/:id/leaders — captains for organisers. */
export const GET = listRoute('LEADER');
