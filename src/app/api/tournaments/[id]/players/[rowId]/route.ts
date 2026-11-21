import { deleteRoute, patchRoute } from '@/features/identity/server/person-routes';

/** PATCH / DELETE /api/tournaments/:id/players/:pid — edit or remove a soldier before Start. */
export const PATCH = patchRoute('PLAYER');
export const DELETE = deleteRoute('PLAYER');
