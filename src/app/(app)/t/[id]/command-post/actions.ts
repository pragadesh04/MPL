'use server';

import type { ActionResult } from '@/lib/schemas/api';
import type { TournamentSettings } from '@/lib/schemas/settings';
import { getSessionUserId } from '@/server/auth/session';
import { action } from '@/server/http';
import {
  updateLiveAuctionSettings,
  type LiveSettingsPatch,
} from '@/server/services/auction/live-settings';

/** Rules card "Save rules" after Start: timer, timer reset, break, unsoldPolicy only. */
export async function saveLiveRules(
  tournamentId: string,
  patch: LiveSettingsPatch,
): Promise<ActionResult<TournamentSettings>> {
  return action(async () =>
    updateLiveAuctionSettings(await getSessionUserId(), tournamentId, patch),
  );
}
