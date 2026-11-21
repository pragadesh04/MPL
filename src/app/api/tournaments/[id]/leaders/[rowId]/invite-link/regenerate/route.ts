import { regenerateRoute } from '@/features/identity/server/person-routes';

/** POST …/leaders/:lid/invite-link/regenerate — bump link_version; the old link dies. */
export const POST = regenerateRoute('LEADER');
