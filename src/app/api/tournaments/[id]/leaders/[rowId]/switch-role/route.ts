import { switchRoleRoute } from '@/features/identity/server/person-routes';

/** POST …/leaders/:lid/switch-role — captain → soldier before Start. */
export const POST = switchRoleRoute('LEADER');
