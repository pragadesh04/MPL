import { unlinkRoute } from '@/features/identity/server/person-routes';

/** POST …/players/:pid/unlink — free a wrongly claimed soldier spot (logged). */
export const POST = unlinkRoute('PLAYER');
