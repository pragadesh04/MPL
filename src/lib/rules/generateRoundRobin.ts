/** Owner: Lane C (C1). PLAN §4.3 — circle method, matchdays, rest day for odd groups. */

export interface Fixture {
  teamAId: string;
  teamBId: string;
}

export interface Matchday {
  /** 1-based. */
  matchday: number;
  fixtures: Fixture[];
  /** The team resting this matchday in an odd-sized group, else null. */
  restingTeamId: string | null;
}

/**
 * No team plays twice in a matchday. `legs = 2` adds the return fixtures (home and away).
 *
 * Circle method: the first team stays put while the others rotate one place per matchday. An
 * odd-sized group gets a phantom team; whoever meets it rests. The fixed team alternates sides
 * (A on odd matchdays, B on even ones) so "home" isn't always the same team. Leg 2 repeats leg 1
 * with sides swapped, numbered after it.
 */
export function generateRoundRobin(teamIds: string[], legs: 1 | 2): Matchday[] {
  if (teamIds.length < 2) return [];
  // Indexes into teamIds; PHANTOM pads an odd group (meeting it = resting).
  const PHANTOM = -1;
  const ring = teamIds.map((_, i) => i);
  if (ring.length % 2 === 1) ring.push(PHANTOM);
  const n = ring.length;
  const firstLeg: Matchday[] = [];

  for (let round = 0; round < n - 1; round++) {
    const fixtures: Fixture[] = [];
    let restingTeamId: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      let a = ring[i]!;
      let b = ring[n - 1 - i]!;
      if (i === 0 && round % 2 === 1) [a, b] = [b, a];
      if (a === PHANTOM || b === PHANTOM) {
        restingTeamId = teamIds[a === PHANTOM ? b : a]!;
        continue;
      }
      fixtures.push({ teamAId: teamIds[a]!, teamBId: teamIds[b]! });
    }
    firstLeg.push({ matchday: round + 1, fixtures, restingTeamId });
    // Rotate everyone except ring[0] one step clockwise.
    ring.splice(1, 0, ring.pop()!);
  }

  if (legs === 1) return firstLeg;
  const secondLeg = firstLeg.map((md) => ({
    matchday: md.matchday + firstLeg.length,
    fixtures: md.fixtures.map((f) => ({ teamAId: f.teamBId, teamBId: f.teamAId })),
    restingTeamId: md.restingTeamId,
  }));
  return [...firstLeg, ...secondLeg];
}
