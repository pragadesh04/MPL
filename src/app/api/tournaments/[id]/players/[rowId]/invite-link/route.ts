import { inviteLinkRoute } from '@/features/identity/server/person-routes';

/** GET …/players/:pid/invite-link — the soldier's personal share URL. */
export const GET = inviteLinkRoute('PLAYER');
