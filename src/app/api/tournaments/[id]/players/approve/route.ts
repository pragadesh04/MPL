import { approveRoute } from '@/features/identity/server/person-routes';

/** POST /api/tournaments/:id/players/approve — bulk `{ ids, basePrice? }` for key sign-ups. */
export const POST = approveRoute('PLAYER');
