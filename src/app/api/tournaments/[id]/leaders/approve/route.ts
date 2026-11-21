import { approveRoute } from '@/features/identity/server/person-routes';

/** POST /api/tournaments/:id/leaders/approve — bulk `{ ids, purse? }` for key sign-ups. */
export const POST = approveRoute('LEADER');
