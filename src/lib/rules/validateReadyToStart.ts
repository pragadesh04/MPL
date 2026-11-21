import type { LeaderApproval, PlayerStatus } from '../schemas/enums';
import type { TournamentSettings } from '../schemas/settings';

/** Owner: Lane A (A9). PLAN §3.5. */

export interface ReadyCaptain {
  leaderId: string;
  name: string;
  userId: string | null;
  approval: LeaderApproval;
  purseTotal: number;
  ign: string | null;
  phone: string | null;
  team: { name: string; shortName: string; color: string } | null;
}

export interface ReadySoldier {
  playerId: string;
  name: string;
  userId: string | null;
  status: PlayerStatus;
  basePrice: number;
  ign: string | null;
  phone: string | null;
}

export interface ReadyToStartInput {
  settings: TournamentSettings;
  /** Every captain row of the tournament (any approval). */
  captains: ReadyCaptain[];
  /** Every soldier row of the tournament (any status). */
  soldiers: ReadySoldier[];
}

export type ReadyCheckId =
  | 'MIN_CAPTAINS'
  | 'CAPTAINS_LINKED_AND_TEAMS_READY'
  | 'TEAM_NAMES_UNIQUE'
  | 'TEAM_COLOURS_DISTINCT'
  | 'NONE_PENDING'
  | 'BASE_PRICES'
  | 'CAPACITY'
  | 'SQUAD_SIZE_SANE'
  | 'NO_DUPLICATE_PEOPLE'
  | 'PURSES_COVER_BASE_PRICE';

export interface ReadyCheck {
  id: ReadyCheckId;
  ok: boolean;
  /** Human message for the review screen (✅ / ❌ rows). */
  message: string;
  /** Wizard step the "Fix" link jumps to (§7.2). */
  fixStep: 'rules' | 'people' | 'teams';
  /** leaders.id / players.id that fail the check, when applicable. */
  offenders?: string[];
}

export interface ReadyToStartResult {
  ok: boolean;
  checks: ReadyCheck[];
}

// ─── Colour distance (also used by the colour picker to warn early) ─────────────────────────

/** Teams closer than this (CIE76 ΔE in Lab space) are "too similar" on the big screen. */
export const MIN_TEAM_COLOR_DELTA_E = 20;
/** The app background (dark olive) — a team colour must stand out against it. */
export const APP_BACKGROUND_HEX = '#12160e';
/** Minimum WCAG contrast of a team colour against the app background. */
export const MIN_TEAM_COLOR_CONTRAST = 1.8;

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** `#rrggbb` → CIE Lab (D65). */
export function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116;
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two `#rrggbb` colours. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of a team colour against the app background. */
export function backgroundContrast(hex: string): number {
  const [hi, lo] = [luminance(hex), luminance(APP_BACKGROUND_HEX)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** The first other team whose colour is too close to `color`, if any. */
export function findTooSimilarColor<T extends { color: string }>(
  color: string,
  others: readonly T[],
): T | undefined {
  return others.find((o) => colorDistance(color, o.color) < MIN_TEAM_COLOR_DELTA_E);
}

// ─── The checks ─────────────────────────────────────────────────────────────────────────────

const NOT_APPROVED_SOLDIER: ReadonlySet<PlayerStatus> = new Set(['PENDING_APPROVAL', 'REJECTED']);

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function normPhone(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normIgn(ign: string | null): string | null {
  const v = ign?.trim().toLowerCase() ?? '';
  return v === '' ? null : v;
}

/**
 * Every §3.5 check, in display order. Start is enabled only when `ok`. Pending Player ID requests
 * are NOT a blocker (Start expires them); pending key sign-ups are.
 */
export function validateReadyToStart(input: ReadyToStartInput): ReadyToStartResult {
  const { settings } = input;
  const captains = input.captains.filter((c) => c.approval === 'APPROVED');
  const soldiers = input.soldiers.filter((s) => !NOT_APPROVED_SOLDIER.has(s.status));
  const checks: ReadyCheck[] = [];

  // 1. At least 2 approved captains (team count is 2–32).
  checks.push({
    id: 'MIN_CAPTAINS',
    ok: captains.length >= 2 && captains.length <= 32,
    message:
      captains.length > 32
        ? `${captains.length} captains — at most 32 teams are supported`
        : `${plural(captains.length, 'approved captain')} (at least 2 needed)`,
    fixStep: 'people',
  });

  // 2. Every captain linked an account and finished team setup.
  const notReady = captains.filter((c) => c.userId === null || c.team === null);
  checks.push({
    id: 'CAPTAINS_LINKED_AND_TEAMS_READY',
    ok: notReady.length === 0,
    message:
      notReady.length === 0
        ? 'Every captain has linked an account and set up a team'
        : `${plural(notReady.length, 'captain')} still to link an account or finish team setup: ${notReady
            .map((c) => c.name)
            .join(', ')}`,
    fixStep: 'teams',
    offenders: notReady.map((c) => c.leaderId),
  });

  // 3. Team names unique (case-insensitive).
  const withTeam = captains.filter(
    (c): c is ReadyCaptain & { team: NonNullable<ReadyCaptain['team']> } => c.team !== null,
  );
  const byName = new Map<string, string[]>();
  for (const c of withTeam) {
    const key = c.team.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), c.leaderId]);
  }
  const dupNames = [...byName.values()].filter((ids) => ids.length > 1).flat();
  checks.push({
    id: 'TEAM_NAMES_UNIQUE',
    ok: dupNames.length === 0,
    message: dupNames.length === 0 ? 'Team names are unique' : 'Two or more teams share a name',
    fixStep: 'teams',
    offenders: dupNames,
  });

  // 4. Colours distinct (ΔE) and readable on the dark background.
  const colourOffenders = new Set<string>();
  const clashes: string[] = [];
  for (let i = 0; i < withTeam.length; i++) {
    const a = withTeam[i]!;
    if (backgroundContrast(a.team.color) < MIN_TEAM_COLOR_CONTRAST) {
      colourOffenders.add(a.leaderId);
      clashes.push(`${a.team.name} is too dark to read`);
    }
    for (let j = i + 1; j < withTeam.length; j++) {
      const b = withTeam[j]!;
      if (colorDistance(a.team.color, b.team.color) < MIN_TEAM_COLOR_DELTA_E) {
        colourOffenders.add(a.leaderId).add(b.leaderId);
        clashes.push(`${a.team.name} and ${b.team.name} look too similar`);
      }
    }
  }
  checks.push({
    id: 'TEAM_COLOURS_DISTINCT',
    ok: colourOffenders.size === 0,
    message: clashes.length === 0 ? 'Team colours are distinct and readable' : clashes.join('; '),
    fixStep: 'teams',
    offenders: [...colourOffenders],
  });

  // 5. Nobody waiting for approval (key sign-ups).
  const pending = [
    ...input.captains.filter((c) => c.approval === 'PENDING').map((c) => c.leaderId),
    ...input.soldiers.filter((s) => s.status === 'PENDING_APPROVAL').map((s) => s.playerId),
  ];
  checks.push({
    id: 'NONE_PENDING',
    ok: pending.length === 0,
    message:
      pending.length === 0
        ? 'No captains or soldiers pending approval'
        : `${plural(pending.length, 'person', 'people')} waiting for approval`,
    fixStep: 'people',
    offenders: pending,
  });

  // 6. Base prices ≥ minBasePrice.
  const cheap = soldiers.filter((s) => s.basePrice < settings.minBasePrice);
  checks.push({
    id: 'BASE_PRICES',
    ok: cheap.length === 0,
    message:
      cheap.length === 0
        ? `Every soldier's base price is at least ${settings.minBasePrice} MP`
        : `${plural(cheap.length, 'soldier')} below the ${settings.minBasePrice} MP minimum base price`,
    fixStep: 'people',
    offenders: cheap.map((s) => s.playerId),
  });

  // 7. Capacity: allocation must be able to finish (the captain fills one slot).
  const minNeeded = captains.length * (settings.minPlayersPerTeam - 1);
  const maxAllowed = captains.length * (settings.maxPlayersPerTeam - 1);
  const capacityOk = soldiers.length >= minNeeded && soldiers.length <= maxAllowed;
  checks.push({
    id: 'CAPACITY',
    ok: capacityOk,
    message: `${plural(soldiers.length, 'approved soldier')}; ${plural(captains.length, 'captain')} need ${minNeeded}–${maxAllowed}`,
    fixStep: soldiers.length > maxAllowed || soldiers.length < minNeeded ? 'people' : 'rules',
  });

  // 8. Squad sizes make sense.
  checks.push({
    id: 'SQUAD_SIZE_SANE',
    ok: settings.minPlayersPerTeam <= settings.maxPlayersPerTeam,
    message: `Squad size ${settings.minPlayersPerTeam}–${settings.maxPlayersPerTeam} (captain included)`,
    fixStep: 'rules',
  });

  // 9. No duplicate people (same account, IGN or phone) across captains and soldiers.
  const people = [
    ...input.captains
      .filter((c) => c.approval !== 'REJECTED')
      .map((c) => ({ id: c.leaderId, userId: c.userId, ign: c.ign, phone: c.phone })),
    ...input.soldiers
      .filter((s) => s.status !== 'REJECTED')
      .map((s) => ({ id: s.playerId, userId: s.userId, ign: s.ign, phone: s.phone })),
  ];
  const duplicates = findDuplicatePeople(people);
  checks.push({
    id: 'NO_DUPLICATE_PEOPLE',
    ok: duplicates.length === 0,
    message:
      duplicates.length === 0
        ? 'No duplicate people'
        : `${plural(duplicates.length, 'entry', 'entries')} share an account, IGN or phone`,
    fixStep: 'people',
    offenders: duplicates,
  });

  // 10. Every captain can afford the most expensive soldier.
  const highest = soldiers.reduce((m, s) => Math.max(m, s.basePrice), 0);
  const poor = captains.filter((c) => c.purseTotal < highest);
  checks.push({
    id: 'PURSES_COVER_BASE_PRICE',
    ok: poor.length === 0,
    message:
      poor.length === 0
        ? `Every captain's purse covers the highest base price (${highest} MP)`
        : `${plural(poor.length, 'captain')} can't afford the highest base price (${highest} MP)`,
    fixStep: 'people',
    offenders: poor.map((c) => c.leaderId),
  });

  return { ok: checks.every((c) => c.ok), checks };
}

/** Ids of entries that share a user account, IGN (case-insensitive) or phone (digits). */
export function findDuplicatePeople(
  people: readonly {
    id: string;
    userId: string | null;
    ign: string | null;
    phone: string | null;
  }[],
): string[] {
  const out = new Set<string>();
  const index = new Map<string, string>();
  for (const p of people) {
    const keys = [
      p.userId ? `u:${p.userId}` : null,
      normIgn(p.ign) ? `i:${normIgn(p.ign)}` : null,
      normPhone(p.phone) ? `p:${normPhone(p.phone)}` : null,
    ];
    for (const key of keys) {
      if (!key) continue;
      const seen = index.get(key);
      if (seen && seen !== p.id) out.add(seen).add(p.id);
      else index.set(key, p.id);
    }
  }
  return [...out];
}
