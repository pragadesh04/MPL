import { inviteLinkRoute } from '@/features/identity/server/person-routes';

/** GET …/leaders/:lid/invite-link — the captain's personal share URL. */
export const GET = inviteLinkRoute('LEADER');
