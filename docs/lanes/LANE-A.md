# Lane A — Identity, people & setup

Branch `lane/a` · worktree `../mpl-lane-a` · port **3001** · Neon branch `lane-a`.
Plan sections: §1, §2 (all), §3.5, §5 (identity tables + API), §7.0–7.5. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane A column). Never edit shared files; write integration notes below.

## Checklist

- [x] **A1 Accounts.** Player sign-up `/register` (optional organiser key, live tournament preview, Captain/Soldier toggle). Organiser sign-up `/register/organiser`. Login / logout. Username availability. Player IDs and organiser keys (`formatKey`). Change password.
- [ ] **A2 Tournaments.** Create (one active per organiser → 409). Settings form (Rules step). "Copy settings from…". Cancel. Organiser and player dashboards. Tournament switcher.
- [ ] **A3 Organiser team.** Memberships, organiser invite links (create, accept, revoke), change role / remove, transfer ownership, Settings → Organisers.
- [ ] **A4 Path A: personal links.** "Add person" drawer. Token encryption / decryption, `/i/[token]`, regenerate, unlink, status chips, Share menu (Copy · WhatsApp · QR) on captain and soldier rows, CSV import.
- [ ] **A5 Path B: organiser key.** Join with a key at sign-up and from the dashboard. Pending rows. Approve (purse / base price, bulk), reject, switch role. Registration open/closed + max registrations. Key card (QR, WhatsApp text), regenerate.
- [ ] **A6 Path C: Player ID requests.** Public-card lookup, send / cancel, requests inbox, accept / decline / block, expiry, rate limits, `notifications`, live `u:<userId>` events with the bell badge.
- [ ] **A7 Captain team setup and Teams tracker.** Name + short code, colour picker (taken colours greyed live, contrast, too-similar warning), logo / emoji, motto, live card preview, onboarding board with "Send reminder".
- [ ] **A8 Password resets.** Organiser-issued one-time links; the `user:reset-password` operator script (stub in `scripts/user-reset-password.ts`).
- [ ] **A9 Review & Start.** `validateReadyToStart`, checklist UI with "Fix" links, the Start transaction (lock settings, close registration, expire pending requests, set status, **call `initializeAuction`**).
- [ ] **A10 Tests.** Unit + service tests, a **tenant-isolation test for every Lane A service**, e2e `e2e/identity/**`.
- [ ] **STOP: Lane A.** `npm run lint && npm run type-check && npm test`, write the handoff, commit, stop.

## Phase 0 pieces to build on

- Rules to implement: `src/lib/rules/keys.ts`, `src/lib/rules/validateReadyToStart.ts` (replace the `NotImplementedError` bodies, keep the signatures, add tests next to them).
- Roles: `requireRole(userId, tournamentId, permission)` / `loadTournamentRole` in `src/server/services/roles.ts`; permission table in `src/lib/permissions.ts`.
- Auth: `src/server/auth/{password,session,tokens,crypto}.ts` (argon2, JWT cookie, hashed tokens, AES-256-GCM for personal links with `env().INVITE_LINK_SECRET`).
- DB: `withTransaction((tx, onCommit) => …)`, `lockTournament(tx, id)`, `bumpRosterVersion(tx, id)`, `writeAudit(tx, …)`, `mapUniqueViolation(…)`, `enforceRateLimit(key, limit, seconds)`.
- Real-time: `publishUpdate` / `publishInbox` from `src/server/realtime/publisher.ts` (call them from `onCommit`), `useChannel(userChannel(id), …)` on the client.
- Cross-lane: `initializeAuction(tx, tournamentId)` in `src/server/services/auction/initializeAuction.ts` (Lane B fills it; the stub just creates `auction_state`). Format preview for the Rules step: `planFormat` (Lane C; throws until C1 lands — show a fallback).
- Placeholders you own and may replace: `src/app/(app)/dashboard/page.tsx`. The tournament switcher component takes a `tournaments` prop; integration wires it in the shell.

## Progress

_Append dated entries as tasks land._

- 2026-11-21 **A1** — `formatKey` / `normalizeKey` / `generateKey` (+ tests). `services/accounts`:
  organiser + player sign-up (Player ID for everyone, organiser key for organisers, retry on key
  collisions), login (per-IP + per-username rate limits, same message for unknown user / wrong
  password, dummy-hash timing guard), username availability, change password, profile update
  (refreshes snapshots only in unstarted tournaments), regenerate organiser key. Path-B core
  (`services/joining/organiserKey.ts`: key preview, `joinWithKey` under a tournament lock) because
  sign-up with a key needs it. Routes: `api/auth/{register,login,logout,me,username-available}`,
  `api/me/{password,profile,organiser-key/regenerate}`, `api/organiser-keys/[key][/join]`. Pages:
  `/login`, `/register` (live key preview + Captain/Soldier toggle, `?key=`), `/register/organiser`
  (strength meter), `/dashboard/account`. Lane A input schemas: `src/features/identity/schemas.ts`.

## Decisions

_Choices made inside the lane that the integrator should know about._

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
