import { deleteRoute, patchRoute } from '@/features/identity/server/person-routes';

/** PATCH / DELETE /api/tournaments/:id/leaders/:lid — edit or remove a captain before Start. */
export const PATCH = patchRoute('LEADER');
export const DELETE = deleteRoute('LEADER');
