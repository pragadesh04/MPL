import { unlinkRoute } from '@/features/identity/server/person-routes';

/** POST …/leaders/:lid/unlink — free a wrongly claimed captain spot (logged). */
export const POST = unlinkRoute('LEADER');
