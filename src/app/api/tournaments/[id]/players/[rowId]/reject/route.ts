import { rejectRoute } from '@/features/identity/server/person-routes';

/** POST …/players/:pid/reject — `{ reason }`. */
export const POST = rejectRoute('PLAYER');
