import 'server-only';
import { getDb, type Db } from '../../db/client';

/** Path C: Player ID requests (PLAN §2.3 C). Filled in by A6. */

export interface MyRequest {
  id: string;
  tournamentId: string;
  tournamentName: string;
  organiserName: string;
  role: 'LEADER' | 'PLAYER';
  purse: number | null;
  basePrice: number | null;
  expiresAt: Date;
  createdAt: Date;
}

export async function listMyRequests(userId: string, db: Db = getDb()): Promise<MyRequest[]> {
  void userId;
  void db;
  return [];
}
