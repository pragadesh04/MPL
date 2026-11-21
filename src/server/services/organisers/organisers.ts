import 'server-only';
import { getDb, type Db } from '../../db/client';

/** Organiser team (PLAN §2.4). Filled in by A3. */

export interface MyOrganiserInvite {
  token: string | null;
  tournamentName: string;
  role: 'CO_ADMIN' | 'AUCTIONEER';
  invitedBy: string;
}

export async function listMyOrganiserInvites(
  userId: string,
  db: Db = getDb(),
): Promise<MyOrganiserInvite[]> {
  void userId;
  void db;
  return [];
}
