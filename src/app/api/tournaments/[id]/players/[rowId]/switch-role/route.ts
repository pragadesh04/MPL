import { switchRoleRoute } from '@/features/identity/server/person-routes';

/** POST …/players/:pid/switch-role — soldier → captain before Start. */
export const POST = switchRoleRoute('PLAYER');
