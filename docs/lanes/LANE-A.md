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
- [x] **A10 Tests.** Unit + service tests, a **tenant-isolation test for every Lane A service**, e2e `e2e/identity/**`.
- [x] **STOP: Lane A.** `npm run lint && npm run type-check && npm test`, write the handoff, commit, stop.

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
  _Path A_: `people/links.ts` (AES-256-GCM `{k,id,tid,v}` tokens), `people/people.ts` (add person,
  CSV import all-or-nothing, roster with duplicate flags, invite link, regenerate, unlink (audited,
  also bumps the link version), edit, remove), `joining/personalLink.ts` (preview marks "Opened";
  claim under the tournament lock, one-time, fills empty IGN/photo/phone from the account).
  _Path B_: `people/approvals.ts` (bulk approve with one purse / base price, reject with reason,
  switch role keeping the approval state), registration controls on the key card.
  _Path C_: `joining/requests.ts` (public-card lookup for organisers running an active tournament,
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
- 2026-11-21 **A10** — e2e `e2e/identity/journey.spec.ts` (self-contained, registers fresh
  accounts each run; passes in ~3 min on desktop), helper unit tests. **STOP** checks green.

## Decisions

1. **Start → `AUCTION_LIVE`** (PLAN §1: READY ──► AUCTION_LIVE), exported as `STARTED_STATUS` in
   `services/start/start.ts`. If Lane B wants Start to land in `AUCTION_PAUSED` (first lot opened
   by the auctioneer), change that one constant.
2. **READY is stored**, not computed on read: `syncReadyStatus` runs at the end of every Lane A
   roster/settings transaction (via `afterRosterChange`) and flips DRAFT ⇄ READY. Start still
   re-validates under the lock, so a stale READY can never start a broken tournament.
3. **Request accepts depend on the tournament status (DRAFT / READY), not on
   `registration_open`.** §9 item 16 says accepts are rejected once `registration_open` is false,
   but that toggle is the _organiser-key_ switch; closing key sign-ups shouldn't silently break
   Player ID invites. Start expires pending requests, so nothing slips in after Start.
   Revisit if the plan meant otherwise.
4. **Accepting a request while a key sign-up is still pending replaces that row** (deleted +
   new approved row from the request). Already approved there → 409. (§9 item 17.)
5. **Organiser invites are bound to the typed username / email.** A forwarded link answers 403
   for another account. The dashboard banner accepts by invite id, only for the invited account
   (others get 404). Tokens are never stored.
6. **Password resets never target organiser accounts** (`is_organiser` or any membership), even
   when that organiser also plays in the tournament, so a co-admin can never take over an owner.
   Organisers use "Change password" or `npm run user:reset-password`.
7. **Transfer ownership requires the target to be a co-admin with an organiser account** (the
   organiser key and `createTournament` assume the owner is an organiser).
8. **Switch role keeps the approval state** (pending → pending; approved → approved with the
   default purse / min base price). A captain's team is deleted with the captain row.
9. **Unlink also bumps `link_version`**, so the link the wrong person used stops working.
10. **Team colour similarity** = CIE76 ΔE < 20, plus WCAG contrast ≥ 1.8 against the app
    background. Too-similar is a _warning_ in the picker and a _blocker_ at Start (§3.5); the DB
    unique index still decides exact-colour races (→ field-level 409).
11. **Photos / logos are https links for now** (no upload). "Basics" step has name + logo link
    only (no date / venue / banner columns exist).
12. **Rules autosave** (800 ms after the last valid change) instead of a Save button.
13. Personal links are **marked "Opened" by the preview read** (`GET /api/invites/:token`),
    because §2.2's row tracking needs it.
14. People lists hide personal links from auctioneers: links are fetched per row through
    `…/invite-link` (requires `people:manage`).

## Integration notes

No shared file was edited. Things the integrator should wire or decide:

1. **App shell (shared):** `src/app/(app)/layout.tsx` passes `tournaments={[]}` to `TopBar`.
   Feed it from `listMyTournaments(userId)` (`services/tournaments/tournaments.ts`, also
   `GET /api/me/tournaments`), mapping to `{ id, name, roles }`. Put
   `<NotificationBell userId initialUnread={await unreadCount(userId)} />`
   (`features/identity/components/notification-bell.tsx`) in the top bar; it currently sits next
   to "My tournaments" on the dashboard.
2. **User menu (shared):** enable "Profile" → `/dashboard/account` (profile + change password).
   The logout form already posts to `/api/auth/logout` (implemented; form posts get a 303 to
   `/login`). Consider moving the account page to `/settings/account` (proxy already guards
   `/settings/*`).
3. **Contracts:** Lane A input schemas live in `src/features/identity/schemas.ts` (frozen folder
   rule). Move them to `src/lib/schemas/identity.ts` if you want them with the other contracts.
4. **Cross-lane links Lane A points at but doesn't own:** `/t/[id]` (home, C), `/t/[id]/auction`
   (B), `/t/[id]/matches` (C) from dashboard cards (`features/identity/lib/next-step.ts`). After
   Start, the review step only refreshes; add a "Go to the auction" link once B's page exists.
5. **Soldier portal (§7.5, I3):** `/t/[id]/people/me` shows the static status card. Drop Lane B's
   live status card and Lane C's fixtures / stats into that page.
6. **Settings → Integrations (B):** the settings index (`/t/[id]/settings/page.tsx`, Lane A) lists
   Rules / People / Organisers; add a link card to Lane B's integrations page.
7. **Command post (B) reuse:** `ShareLinkMenu`, `InviteStatusChip`, `SourceBadge`,
   `TeamCardPreview`, `PeopleBoard` are reusable from `src/features/identity/components`.
8. **`planFormat` (C):** the Rules live preview calls it inside try/catch with a fallback text;
   no change needed once C1 lands.
9. **Dependency (optional):** photo / logo upload with crop (§7.0, §7.4) needs Vercel Blob
   (`@vercel/blob`) or Cloudinary. Fields currently accept https links.
10. **Schema (optional):** Basics step lacks `date`, `venue`, `banner_url` columns on
    `tournaments` (§7.2 step 1). Not added; Basics = name + logo.
11. **Seed:** `scripts/seed-lib.ts` sets the draft tournaments to `DRAFT`, but Ravi's has a
    pending captain so that's correct; nothing to change. The `ready` stage stores `READY`
    directly (no sync needed).

## Suggested CLAUDE.md updates

- Commands: `npm run user:reset-password -- <username>` works (prints a one-time link, 30 min).
  Lane e2e: `PORT=3001 npx playwright test e2e/identity --project=desktop` (needs the dev server
  or starts one; self-contained, no seed needed).
- Gotcha: **`server-only` modules can't be imported by `tsx` scripts.** Shared code that scripts
  need goes in a file without `import 'server-only'` (e.g. `services/passwords/reset-core.ts`,
  like `db/sql.ts`).
- Gotcha: a unique violation **aborts the surrounding Postgres transaction**. To turn it into a
  409 and keep going (or retry), wrap the write in a savepoint (`tx.transaction(...)`), as
  `people/teams.ts` does; otherwise let it bubble and map it outside `withTransaction`.
- Rule: Lane A services end every roster change with `afterRosterChange(tx, tid, onCommit,
event)` (bumps `roster_version`, syncs DRAFT ⇄ READY, publishes after commit). New services that
  change people / teams / settings before Start should call it too.
- Rule: inbox events go through `notify(tx, onCommit, userId, type, data, { event })` so the bell
  count and the live event can't disagree.
- Gotcha (dev): after replacing a module's exports, Turbopack HMR sometimes serves the old module
  ("x is not a function" 500). Re-request or restart `next dev`.
- Gotcha (dev): the e2e journey's first page loads compile slowly; it uses 30 s assertion
  timeouts.

## Handoff

**Done (A1–A10):** accounts (player / organiser sign-up, Player IDs, organiser keys, login with
rate limits, username check, change password, profile), tournaments (create with the
one-active-per-owner 409, settings with autosave and post-Start overrides, copy settings,
registration toggle + cap, cancel, dashboards, my-tournaments data for the switcher), organiser
team (invite links, accept, revoke, roles, remove, transfer), all three joining paths (personal
links with claim / regenerate / unlink / CSV import; organiser key with pending approval, bulk
approve, reject, switch role; Player ID requests with lookup, inbox, accept / decline / block,
expiry, rate limits, notifications + live `u:<userId>` events and bell), captain team setup with
the live colour picker, Teams tracker with reminders, soldier "my card", password reset links +
operator script, `validateReadyToStart` and the Start transaction calling `initializeAuction`.

**Checks at STOP (2026-11-21):** `npm run lint` ✅ · `npm run type-check` ✅ · `npm test` ✅
(24 files, 176 tests) · `npm run build` ✅ · e2e `e2e/identity` ✅ (desktop, against PGlite).
Lane A rules `keys` + `validateReadyToStart`: 100 % statements / branches.
Every Lane A service file has a tenant-isolation test (organiser A on B's tournament → 404):
tournaments, organisers, people, approvals, teams, joining (key + requests), passwords, start.

**Not done / known gaps:**

- Photo upload + crop and QR _scanning_ of the organiser key (only `?key=` links and typing).
- Basics step: date / venue / banner (no columns).
- Top bar switcher / bell / profile link wiring (shared shell — see integration notes 1–2).
- Concurrency of joins was reasoned about (tournament row lock + unique indexes) but not tested
  on real Postgres; PGlite can't race.
- `phone` project of Playwright skips the journey (it creates accounts; one run is enough).

**How to try it (port 3001):** `npm run db:seed -- --stage=draft` (stop `next dev` first on
PGlite), `npm run dev -- -p 3001`, then `/dev/login-as?username=ravi` → Dashboard → Resume setup;
`a_cap8` is a pending key captain, `free_agent` has a pending Player ID request, `a_cap7`'s spot
is unclaimed (copy its link from People → Share).
