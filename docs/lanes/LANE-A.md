# Lane A — Identity, people & setup

Branch `lane/a` · worktree `../mpl-lane-a` · port **3001** · Neon branch `lane-a`.
Plan sections: §1, §2 (all), §3.5, §5 (identity tables + API), §7.0–7.5. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane A column). Never edit shared files; write integration notes below.

## Checklist

- [x] **A1 Accounts.** Player sign-up `/register` (optional organiser key, live tournament preview, Captain/Soldier toggle). Organiser sign-up `/register/organiser`. Login / logout. Username availability. Player IDs and organiser keys (`formatKey`). Change password.
- [x] **A2 Tournaments.** Create (one active per organiser → 409). Settings form (Rules step). "Copy settings from…". Cancel. Organiser and player dashboards. Tournament switcher.
- [x] **A3 Organiser team.** Memberships, organiser invite links (create, accept, revoke), change role / remove, transfer ownership, Settings → Organisers.
- [x] **A4 Path A: personal links.** "Add person" drawer. Token encryption / decryption, `/i/[token]`, regenerate, unlink, status chips, Share menu (Copy · WhatsApp · QR) on captain and soldier rows, CSV import.
- [x] **A5 Path B: organiser key.** Join with a key at sign-up and from the dashboard. Pending rows. Approve (purse / base price, bulk), reject, switch role. Registration open/closed + max registrations. Key card (QR, WhatsApp text), regenerate.
- [x] **A6 Path C: Player ID requests.** Public-card lookup, send / cancel, requests inbox, accept / decline / block, expiry, rate limits, `notifications`, live `u:<userId>` events with the bell badge.
- [x] **A7 Captain team setup and Teams tracker.** Name + short code, colour picker (taken colours greyed live, contrast, too-similar warning), logo / emoji, motto, live card preview, onboarding board with "Send reminder".
- [x] **A8 Password resets.** Organiser-issued one-time links; the `user:reset-password` operator script (stub in `scripts/user-reset-password.ts`).
- [x] **A9 Review & Start.** `validateReadyToStart`, checklist UI with "Fix" links, the Start transaction (lock settings, close registration, expire pending requests, set status, **call `initializeAuction`**).
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
- 2026-11-21 **A2** — `services/tournaments`: create (organisers only; one active per owner via the
  partial index → 409; live-code retry), "Copy settings from…" (only tournaments I organise),
  basics, settings (full edit before Start; after Start only `EDITABLE_AFTER_START` freely, other
  keys need `admin:override` + reason → `settings.override` audit), registration open/closed + cap,
  cancel (owner, type the name, expires pending requests), `listMyTournaments` (roles, pending,
  rejected, my team), organiser dashboard data, `getSetupOverview`. DRAFT ⇄ READY is kept in step
  by `syncReadyStatus` after every roster change (`people/roster-events.ts`). Routes:
  `api/tournaments`, `api/tournaments/[id]` (GET/PATCH), `…/settings`, `…/registration`, `…/cancel`,
  `api/me/tournaments`. Pages: `/dashboard` (command post, organiser key card, new tournament with
  copy, organising for others, archive; Player ID card, join with a key, my tournaments with the
  next step), `/t/[id]/setup?step=basics|rules|review` with the 5-step progress rail, Rules form
  with autosave, increments editor (flat / bands) and live preview (falls back while Lane C's
  `planFormat` throws).
- 2026-11-21 **A3** — `services/organisers`: members + pending invites, single-use invite links
  (32-byte token, SHA-256 stored, 7 days, bound to the typed username/email), preview, accept by
  token (link) or by id (dashboard banner, only for the invited account), revoke, change role,
  remove, transfer ownership (type the name; target must be a co-admin with an organiser account;
  the one-active-per-owner index → 409). Routes: `api/tournaments/[id]/{members[/userId],
  organiser-invites,transfer-ownership}`, `api/organiser-invites/[ref][/accept]`. Pages:
  `/t/[id]/settings` (index + cancel danger zone), `/t/[id]/settings/organisers`,
  `/organiser-invite/[token]`, dashboard invites banner.
- 2026-11-21 **A4 + A5 + A6** (one commit: they share the People page and board) —
  *Path A*: `people/links.ts` (AES-256-GCM `{k,id,tid,v}` tokens), `people/people.ts` (add person,
  CSV import all-or-nothing, roster with duplicate flags, invite link, regenerate, unlink (audited,
  also bumps the link version), edit, remove), `joining/personalLink.ts` (preview marks "Opened";
  claim under the tournament lock, one-time, fills empty IGN/photo/phone from the account).
  *Path B*: `people/approvals.ts` (bulk approve with one purse / base price, reject with reason,
  switch role keeping the approval state), registration controls on the key card.
  *Path C*: `joining/requests.ts` (public-card lookup for organisers running an active tournament,
  rate-limited per user + IP; send with 50/day/organiser limit, blocks, one pending per player
  per tournament → 409; cancel; inbox; accept (replaces a pending key row); decline / decline &
  block; lazy expiry), `notifications/notifications.ts` (`notify()` inserts + publishes
  `notification.new` after commit; list, unread count, mark read).
  Routes: `api/tournaments/[id]/{people[/import],leaders,players}`, `…/(leaders|players)/[rowId]
  {,/invite-link[/regenerate],/unlink,/reject,/switch-role}`, `…/(leaders|players)/approve`,
  `…/requests[/rid]`, `api/invites/[token][/claim]`, `api/players/by-code/[playerCode]`,
  `api/me/requests[/rid/(accept|decline)]`, `api/me/notifications[/read]`.
  Pages: `/t/[id]/people` (key card + registration, invite by Player ID, Add person drawer, CSV
  import with mapping + preview, Captains/Soldiers tabs with Approved · Pending · Requests sent ·
  Rejected, capacity meter, share menu on both kinds, live refresh), `/i/[token]` (welcome card,
  register-and-claim or log in, taken / invalid states), dashboard requests inbox + bell.
- 2026-11-21 **A7** — `people/teams.ts`: captain upsert of their team under the tournament lock
  (name / colour / short-code unique violations → field-level 409s via a savepoint), organiser
  edit (audited), taken colours, Teams tracker data, "Send reminder" (in-app notification for
  linked captains + personal links for one WhatsApp message), my card (also for pending people),
  snapshot edit until Start. Colour maths in `validateReadyToStart.ts` (CIE76 ΔE, background
  contrast, `findTooSimilarColor`) is shared by the picker and the Start check. Routes:
  `api/tournaments/[id]/{my-team,taken-colours,teams/[leaderId],teams/remind,me}`. Pages:
  `/t/[id]/teams` (tracker with live card previews, edit dialog, reminder message),
  `/t/[id]/teams/setup` (captain setup with curated palette — taken colours greyed with the team's
  short code, custom hex with contrast + too-similar warnings, emoji / logo / motto, live team card
  and big-screen banner previews; pending captains see "Waiting for … to approve you"),
  `/t/[id]/people/me` (soldier portal / my card).
- 2026-11-21 **A8** — `services/passwords`: organiser-issued one-time reset links (30 min, hashed,
  audited) only for captains / soldiers of that tournament, never for organiser accounts (so a
  co-admin can't take over an owner who also plays); preview and single-use consume (also kills
  older outstanding links). `reset-core.ts` has no `server-only` so the operator script can use
  it; `npm run user:reset-password -- <username>` now prints a link. Routes:
  `api/tournaments/[id]/participants/[userId]/reset-password`, `api/password-resets/[token]`.
  Page `/reset/[token]`; key-icon button on People rows with a linked account.
- 2026-11-21 **A9** — `validateReadyToStart` (all ten §3.5 checks with offenders + "Fix" step;
  100 % statement / branch coverage together with `keys`), `services/start/start.ts`: Start in one
  transaction under the tournament lock — re-run the checks (409 `RULE_VIOLATION` /
  `NOT_READY` with the failing ids), type-the-name confirm, status → `AUCTION_LIVE`,
  `registration_open = false`, `started_at` / `locked_at`, expire pending requests (+
  `request.cancelled` inbox events), audit `tournament.started`, **call `initializeAuction`**,
  publish `tournament.status` after commit. Route `api/tournaments/[id]/start` (GET checklist,
  POST start). Review step with ✅ / ❌ rows, "Fix" links, summary and the START dialog.

## Decisions

_Choices made inside the lane that the integrator should know about._

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
