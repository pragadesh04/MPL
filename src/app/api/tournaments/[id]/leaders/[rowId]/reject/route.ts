import { rejectRoute } from '@/features/identity/server/person-routes';

/** POST …/leaders/:lid/reject — `{ reason }`. */
export const POST = rejectRoute('LEADER');
