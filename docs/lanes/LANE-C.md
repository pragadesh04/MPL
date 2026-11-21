# Lane C — Format, matches & public pages

Branch `lane/c` · worktree `../mpl-lane-c` · port **3003** · Neon branch `lane-c`.
Plan sections: §4 (all), §7 (visual direction, announcement, tournament home), §7.10a–7.13, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane C column). Never edit shared files; write integration notes below.

## Checklist

- [x] **C1 Rules.** `generateGroups`, `generateRoundRobin`, `computeStandings` (every tie-break), `seedKnockout`, `generateBracket`, `assignMatchOrder`, `buildTournamentTree`, incl. 2 teams and 3–5 teams. **100% branch coverage.**
- [x] **C2 Group draw.** Fill in the `startGroupDraw` stub. Pots, random or manual draw, ceremony UI, fixtures and match numbers, then status `GROUP_STAGE`.
- [x] **C3 Results and progression.** Per-game result modal (tied game can't be saved), mark live, per-soldier stats, reorder within a stage, Generate knockout, auto-advance, safe cascading edits, `KNOCKOUT` → `COMPLETED`, champion screen.
- [x] **C4 Matches hub** `/t/[id]/matches`. List and Tree toggle, Now playing / Up next, My-team filter and path highlight, placeholders, PNG export, live updates, 404 for outsiders.
- [x] **C5 Groups and knockout screens.** Standings with Q badge and cut-off line, fixtures by matchday, knockout tree with zoom and pan.
- [x] **C6 Tournament home and announcements.** `/t/[id]` with status badges, hero, **Rules of engagement generated from settings**, announcement banner service (post / clear, live). Non-auction big-screen views.
- [x] **C7 Extras.** Teams overview with image export, stats leaderboards, audit-log viewer, PWA manifest + offline shell, reduced motion.
- [x] **C8 Tests.** Unit + service tests, tenant-isolation tests, e2e `e2e/format/**` (seed `--stage=allocated` → draw → results → knockout → champion).
- [x] **STOP: Lane C.** `npm run lint && npm run type-check && npm test`, write the handoff, commit, stop.

## Phase 0 pieces to build on

- Rules to implement: `src/lib/rules/{planFormat,generateGroups,generateRoundRobin,computeStandings,knockout,assignMatchOrder,buildTournamentTree}.ts` (keep the signatures; `planFormat` is also used by Lane A's Rules step).
- Stub to fill: `startGroupDraw(tx, tournamentId)` in `src/server/services/format/startGroupDraw.ts` — signature is final. Lane B's allocation ends by setting status `GROUP_DRAW`.
- Schema notes: `matches.source_a/source_b` hold `MatchSource` (`GROUP_POS` ref `<groupId>:<pos>`, `WINNER_OF` / `LOSER_OF` ref `<matchId>`); `group_teams` has `tournament_id` + `pot`; `match_games` rejects tied kills at the DB level; `matches.stage = 'GROUP'` exactly when `group_id` is set; byes have no `match_number`.
- Roles: `requireParticipant(userId, tournamentId)` (any participant, 404 otherwise) and `requireRole(…, 'matches:edit' | 'announcement:post' | 'stage:advance')`.
- Real-time: `publishUpdate(tournamentId, version, serverNow, 'match.updated' | 'groups.updated' | 'tournament.status', data)` from `onCommit`, with `version = await bumpRosterVersion(tx, id)`; on the client `useChannel(updatesChannel(id), () => router.refresh())`.
- UI: `AnnouncementBanner` (`src/components/shell/announcement-banner.tsx`) renders the banner; `TeamChip`, `StatusPill`, `OpenSlot`, `MpAmount` in `src/components/ui`.
- Seed: `npm run db:seed -- --stage=allocated` (GROUP_DRAW, squads done), `--stage=groups` (matchday 1 played, a match live, knockout placeholders), `--stage=knockout` (semi 1 done, semi 2 live).

## Progress

_Append dated entries as tasks land._

- **2026-11-21 · C1 done.** All seven Lane C rule modules implemented with tests (99 tests,
  100% statements / branches / functions / lines on `planFormat`, `generateGroups`,
  `generateRoundRobin`, `computeStandings`, `knockout`, `assignMatchOrder`,
  `buildTournamentTree`). Index signatures unchanged.
- **2026-11-21 · C2 done.** `startGroupDraw` stub filled in (signature unchanged).
  `services/format/groupDraw.ts`: `performGroupDraw` (core, inside the caller's tx), `drawGroups`
  (random or manual, publishes), `undoGroupDraw` (only while nothing has started). Read model
  `services/format/data.ts` (`loadFormatData`, `getFormatPageData`) builds standings, labels and
  the tree from the same rows. API `POST/DELETE /api/tournaments/[id]/groups/draw`. Screen
  `/t/[id]/groups`: seeding pots, Random / Manual (drag and drop + "Move to A/B" buttons), the
  animated ceremony (auto-plays once per device per draw, Replay / Skip, drum hit + fanfare when
  sound is on), standings with Q badge and cut-off line. 11 service tests incl. tenant isolation.
  Checked in the browser with `--stage=allocated` (ravi).
- **2026-11-21 · C3 done.** `services/matches/results.ts`: `updateMatch` (mark live / not live,
  set time, enter or edit a result with per-soldier stats), `reorderMatches`, `generateKnockout`,
  `runTiebreakDraw`; knockout auto-advance (winner → next slot, semi losers → 3rd place), safe
  cascading edits (confirm when a later match's teams change, refused once it started), group
  edits after Generate knockout refill or empty the bracket, final decided → `COMPLETED`,
  un-deciding it reopens `KNOCKOUT`. New pure rule `src/lib/rules/matchScore.ts` (`scoreMatch`,
  best-of + tied-game + extra-game checks) shared by the modal and the service. APIs:
  `PATCH …/matches/[mid]`, `PATCH …/matches/order`, `POST …/matches/knockout`,
  `POST …/groups/[gid]/tiebreak`. UI: match detail sheet (squads, games, MVP, organiser
  actions), result dialog (RHF, game rows, maps, per-soldier K/D/MVP, cascade confirm), groups
  board (standings / fixtures by matchday, "what does my team need?", Qualified! reveal, tie-break
  draw, Generate knockout), champion screen (trophy, squad, team-colour confetti, reduced-motion
  aware). 13 more service tests (full run to champion, cascade, byes, 3rd place, tie-break draw,
  reorder, tenant isolation).
- **2026-11-21 · C4 done.** `/t/[id]/matches` for every participant role (404 otherwise): List |
  Tree toggle remembered per device, sticky Now playing / Up next banner. List: stage separators,
  placeholders, My team (on by default for captains and soldiers), stage / group / status / search
  filters, organiser reorder by drag handle or up/down buttons (only with no filters). Tree:
  pure layout (`features/format/tree-layout.ts`, tested) of group cards → rounds → final →
  champion, connectors (group positions and winner-of), winner path in the team colour, live
  pulse, BYE nodes, My team path, zoom / pan / pinch / Fit, Export PNG (html-to-image). Tapping a
  node or row opens the match sheet. API
  `GET /api/tournaments/[id]/matches?view=list|tree&stage=&team=&group=&status=&q=`
  (`services/matches/hub.ts`). Filters are a pure tested module.
- **2026-11-21 · C5 done.** Groups: standings with Q badge and dashed cut-off (rows slide to new
  places, reduced-motion aware), fixtures by matchday (from C3). Knockout `/t/[id]/knockout`:
  seeding cards first (A1 v B2 …), then the bracket animates in (`TreeView` without groups:
  rounds, connectors, BYE slots, winner path, zoom / pan / fit / PNG), champion screen on top once
  the final is decided. Sound effects wait for the first user gesture.
- **2026-11-21 · C6 done.** `/t/[id]` home (any participant, 404 otherwise): status pills
  (status · AUCTION COMPLETE · N captains · N soldiers), hero with mascots, announcement form for
  owner / co-admin, champion, Now playing / Up next, **Rules of engagement generated from the
  settings** (`features/public/rules-of-engagement.ts`, tested: purse, squad size, opening bid,
  raise incl. price bands, timer + break, unsold policy, format), big-screen link. Announcement
  service `services/announcements/announcement.ts` + `PUT /api/tournaments/[id]/announcement`
  (logged, live). Big screen `/live/[liveCode]/format` (no login, 404 when disabled): rotates
  Standings / Match order / Bracket / Draw every 20 s by stage, champion at the end, live refresh
  via a live-code Ably token.
- **2026-11-21 · C7 done.** Teams overview `/t/[id]/teams-overview` (columns per team, captain,
  soldiers with price and Auto / Random / Admin pick badges, spent / left meter, open slots,
  Export PNG, print view). Stats `/t/[id]/stats` + `GET /api/tournaments/[id]/stats`: most kills,
  best K/D, MVP awards, most expensive, best-value buy (`features/format/leaderboards.ts`, tested).
  Audit-log viewer `/t/[id]/audit` (organisers incl. auctioneer; filter by action and actor).
  PWA: `src/app/manifest.ts`, generated PNG icons at `/pwa-icon/192|512`, `public/sw.js`
  (network-first navigations with an `/offline` fallback, cache-first hashed static assets, never
  caches API or live data), registered in production only. Reduced motion: ceremony, confetti,
  tree reveal, seeding, standings moves and the Qualified! reveal check `prefers-reduced-motion`
  (plus the global CSS rule).
- **2026-11-21 · C8 done.** Service tests with a tenant-isolation case for every Lane C service
  (group draw, results, hub, announcements, home / live screen, stats / audit), pure tests for
  every rule and helper, component tests (`standings-table.test.tsx`), and the Playwright
  journey `e2e/format/journey.spec.ts`: draw from the UI → M1 via the result dialog → rest of
  the groups via the API → Qualified! → Generate knockout → semis via the API → best-of-5 final
  via the dialog → champion screen and COMPLETED; plus another organiser getting 404 on every
  Lane C page and API, and the phone matches hub. Passed against `--stage=allocated` on port 3003.
- **2026-11-21 · STOP.** `npm run lint`, `npm run type-check`, `npm run format:check` clean;
  `npm test`: 31 files, 207 tests passed. Lane C rules (`planFormat`, `generateGroups`,
  `generateRoundRobin`, `computeStandings`, `knockout`, `assignMatchOrder`,
  `buildTournamentTree`, `matchScore`): 100% statements, branches, functions and lines.

## Decisions

_Choices made inside the lane that the integrator should know about._

- **`planFormat` is the single source of effective format values.** `groupCount` =
  `settings.groupCount ?? ceil(teams/4)`, clamped so each group has ≥ 3 teams (3–5 teams always
  one group). Advance per group is clamped to the smallest group and is at least 2 with one group.
  `generateGroups` and the draw service read these, so the Rules-step preview and the real draw
  agree. `advancePerGroupOf(plan)` gives the effective advance. Fewer than 2 teams → a
  `FINAL_ONLY` plan with 0 matches and "Add at least 2 captains…".
- **Seeding** (`seedKnockout`): tiers by finishing position (all winners in group order, then
  runners-up…), standard bracket order (1 v N…), winners hold the byes. Later tiers are permuted
  by a small backtracking search so no same-group round-1 tie happens and every runner-up sits in
  the half opposite its own winner. Verified for every valid format up to 10 groups. With one group
  the plain order is used. The shape depends only on group order, so the tree created at the draw
  keeps its shape when teams are filled in.
- **Bracket**: byes are always slot B of a round-1 match; the bye team (and its GROUP_POS source)
  is copied straight into round 2, so labels never say "Winner of" a match that is never played.
  The 3rd-place match is `round = final round, slot = 1`, and only exists when both semis are real
  (not for a 3-team bracket).
- **Standings tie-break**: points → head-to-head points → game diff → kill diff → total kills,
  one criterion at a time; whenever a criterion splits a tie, the chain restarts at head-to-head
  on each smaller tie. `needsDraw` is true only for teams still level that `drawOrder` doesn't
  fully order. `matches` must be passed in running order (form = last 3 in that order).
- **Match order**: within a matchday, groups take turns match by match (A, B, A, B), so with 2+
  groups no team plays twice in a row. Knockout: round by round, slot order, 3rd place before
  the final.
- **Reorder** (`reorderWithinStage`, extra export in `assignMatchOrder.ts`): the client sends
  every SCHEDULED match of one stage block (group, or knockout + 3rd place) in the new order; the
  numbers those matches held are handed out again. In the knockout the new order must keep rounds
  ascending (swaps within a round only), so a match never comes before its feeders.
- **The draw creates the whole knockout tree at once**, with GROUP_POS / WINNER_OF placeholders
  and match numbers (as the seed does), so the list and tree show the full path from the draw.
  Bye matches exist as rows (`is_bye`, no number, SCHEDULED until Generate knockout).
- **2 teams**: no groups; the draw creates the final with both teams (better MP spender in slot A)
  and moves straight to `KNOCKOUT`. Manual placement is refused then.
- **Seeding value** = MP spent (`purse_total − purse_remaining` of the captain), ties by team order.
- **Manual placement** stores `group_teams.pot = null` (as the schema comment says); the ceremony
  then reveals group by group.
- **Undo draw** (`DELETE …/groups/draw`, logged `groups.draw_undone`) is allowed only while no
  non-bye match is LIVE or DONE.
- **Organiser tie-break draws** are stored as audit entries (`standings.tiebreak_drawn`,
  `after = { groupId, order }`) and read back by `loadFormatData`; see integration notes.
- **Real-time**: every Lane C write bumps `roster_version` once per event and publishes
  `groups.updated` / `match.updated` / `tournament.status` after commit (`format/events.ts`).
  Pages refresh via `<LiveRefresh>` (router.refresh on any `t:<id>:updates` event and on reconnect).
- **Result entry**: games are replaced as a whole on each save. Decided → DONE; games but
  undecided → LIVE; no games → SCHEDULED (or stays LIVE if it was marked live). Per-soldier stats
  only for soldiers (captains have no `players` row, so no captain stats; see integration notes).
  At most one MVP per match.
- **Locks**: group results lock as soon as any knockout match is LIVE / DONE. Knockout matches can
  only be played after Generate knockout (status `KNOCKOUT`). Final results stay editable after
  `COMPLETED` (champion changes; clearing the final reopens `KNOCKOUT`).
- **Announcements** publish `tournament.status` with `{ status, announcement }` (the contract's
  optional field), so every page refreshes and the banner updates live. Text is trimmed, max 200
  characters; empty clears it.
- **Leaderboards** count only soldiers with recorded stats. Best value = kills per MP and leaves
  out free (allocated) soldiers; K/D treats 0 deaths as 1; ties go by name. Audit log: organisers
  (owner, co-admin, auctioneer = `tournament:view-admin`), newest 200, other roles 404 on the page.
- **Tree** draws no line for LOSER_OF (3rd place sits under the final instead). Round-2 slots fed
  by a bye connect straight from the group position. Plain mouse wheel scrolls the page; zoom is
  Ctrl/⌘ + wheel, pinch, or the buttons.
- **Reorder UI** is available only when no filters are active, so the client always sends the
  whole stage block; the server still validates everything (`BREAKS_ROUND_ORDER` etc.).
- **Generate knockout** is refused while a group still needs an organiser tie-break draw
  (`TIEBREAK_DRAW_NEEDED`); the draw shuffles exactly the level teams and is logged.

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

- **`startGroupDraw` publishes nothing** (it only gets `tx`). Whoever calls it must publish
  `groups.updated` + `tournament.status` after commit. Recommended: do NOT call it automatically
  when allocation ends; leave the tournament at `GROUP_DRAW` and let the organiser draw on
  `/t/[id]/groups` (random or manual, with the ceremony). `drawGroups` handles publishing.
- **Webhook `groups.drawn` / `match.result` / `tournament.completed`**: Lane B owns webhook
  delivery and there is no dispatch function in Phase 0. Lane C services write the audit entries
  (`groups.drawn`, `match.result_recorded`, `tournament.completed`); please hook webhook dispatch
  into those service points (`performGroupDraw`, `recordResult`, completion) during integration.
- **Tie-break draw storage**: suggest a column `groups.draw_order jsonb` (team ids, best first).
  Workaround: latest `audit_log` row with action `standings.tiebreak_drawn` per group.
- **`/live/[liveCode]` is split between lanes.** Lane C's format views live at
  `src/app/live/[liveCode]/format/page.tsx` (component `BigScreenFormat`, loader
  `loadLiveScreen`). Lane B owns the auction view. Suggest the bare `/live/[liveCode]` page shows
  Lane B's auction view up to `ALLOCATION` and renders (or redirects to) the format view from
  `GROUP_DRAW` on. No file of Lane B was touched.
- **PWA files at the app root (Lane C, C7)**: `src/app/manifest.ts`, `src/app/pwa-icon/[size]/route.tsx`,
  `src/app/offline/page.tsx`, `public/sw.js`. The service worker is registered from Lane C's
  `TournamentHeader` and the big screen (`ServiceWorkerRegister`); please move that into the root
  layout so every page registers it, and add `/offline`, `/pwa-icon/*` and `/sw.js` to anything
  that lists public paths. Manifest / icon colours are literal (they can't read CSS tokens).
- **Print view of the teams overview** hides Lane C's own header with `print:hidden`; the shared
  top bar still prints. Add `print:hidden` to the app shell top bar during integration.
- **Captain stats**: `player_stats.player_id` references `players`, and captains are `leaders`,
  so per-match kills / deaths / MVP can't be recorded for captains. Suggest a nullable
  `leader_id` on `player_stats` (exactly one of player_id / leader_id), or document that only
  soldiers get stats.
- **Shared tournament layout**: Lane C pages render `TournamentHeader` (announcement banner, name,
  status pill, format nav, live refresh) themselves. I3 can move it into `t/[id]/layout.tsx` and
  add the auction / people / setup links with role-based navigation.
- **Dev environment: endless page reloads in `next dev` (not app code).** Pages sometimes
  reloaded every ~1 s (Turbopack sends a `restart` for the framework entry chunk on each HMR
  connect), which also loses clicks and form posts. Confirmed cause: a stale `.next/dev` cache
  after the dev server was force-killed; `rm -rf .next` and restart fixed it every time. With the
  PGlite folder inside the project (`pglite:./.pglite/dev`, the env-core default) the loop also
  appeared and moving it out seemed to help, so as a precaution this lane's `.env.local` uses
  `DATABASE_URL=pglite:../.pglite-lane-c` (same for `DATABASE_URL_UNPOOLED`). Suggest moving the
  default PGlite folder outside the project (shared file `src/server/env-core.ts`) and adding a
  note to CLAUDE.md. Also: stop `next dev` before `npm run db:seed` (one PGlite connection), and
  stopping the npm wrapper can leave the `start-server.js` child holding the port and database.

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

- Commands: `npx vitest run src/lib/rules` (format rules, 100% coverage);
  `PORT=3003 npx playwright test e2e/format --workers=1` after
  `npm run db:seed -- --stage=allocated` (the journey changes data; the phone check reads it).
  If Playwright's own Chromium isn't installed, set `E2E_CHROMIUM_PATH` to an installed one.
- **`planFormat` gives the effective format** (group count, advance per group, sizes); every
  other format rule, the draw service and the Rules-step preview read it. Don't recompute
  `ceil(teams/4)` or clamp advance anywhere else.
- **The draw creates the whole tree.** Groups, fixtures, the knockout bracket with placeholders
  (GROUP_POS / WINNER_OF / LOSER_OF) and match numbers are all created by `drawGroups`.
  Generate knockout only fills team ids from the standings and resolves byes.
- **A match is decided by `scoreMatch` (`src/lib/rules/matchScore.ts`)**, used by the result
  modal and the results service. Tied games can't be saved (rule + DB check).
- **Knockout edits cascade safely**: a changed winner rewrites later slots only if those matches
  haven't started, and asks the client to confirm (`details.needsConfirm`) when a filled slot
  changes. Group results lock once any knockout match is LIVE or DONE.
- **Lane C writes publish on `t:<id>:updates` after commit** with one `roster_version` bump per
  event (`services/format/events.ts#queueUpdates`). Pages use `<LiveRefresh>`, which calls
  `router.refresh()`.
- Reordering keeps each stage's block of numbers. In the knockout, swaps are only allowed within
  a round (`reorderWithinStage`). The unique index is handled with a negative-number first pass.
- Dev: if pages reload in a loop under `next dev`, stop it, `rm -rf .next`, start again. Keep the
  PGlite folder outside the project.

## Handoff

**Status: Lane C complete (C1–C8), stopped at STOP. Not merged, not rebased.** Branch `lane/c`,
8 commits on top of `foundation`, only Lane C files (plus the PWA root files listed in the
integration notes). The `startGroupDraw` stub is filled with its signature unchanged; the rules
index exports are unchanged.

**Done**

- Rules: `planFormat`, `generateGroups`, `generateRoundRobin`, `computeStandings`,
  `seedKnockout`, `generateBracket`, `roundName`, `assignMatchOrder` (+ `reorderWithinStage`),
  `buildTournamentTree` (+ `sourceLabel`), and the new `matchScore`. 100% coverage.
- Services: `format/` (draw, undo, read model, standings, home, live screen, events),
  `matches/` (results, reorder, knockout generation, tie-break draw, hub),
  `announcements/`, `stats/` (leaderboards, audit log). Every one has tenant-isolation tests.
- API: `groups/draw` (POST, DELETE), `groups/[gid]/tiebreak`, `matches` (GET),
  `matches/[mid]` (PATCH), `matches/order` (PATCH), `matches/knockout` (POST), `announcement`
  (PUT), `stats` (GET), all under `/api/tournaments/[id]/`.
- Pages: `/t/[id]` (home), `/t/[id]/groups`, `/t/[id]/matches`, `/t/[id]/knockout`,
  `/t/[id]/teams-overview`, `/t/[id]/stats`, `/t/[id]/audit`, `/live/[liveCode]/format`,
  `/offline`, plus `manifest.webmanifest`, `/pwa-icon/192|512` and `/sw.js`.

**How to test**

1. Stop `next dev`, then `npm run db:seed -- --stage=allocated` and start
   `npm run dev -- -p 3003`.
2. Open `/dev/login-as?username=ravi&next=/dev` to get the tournament id, then go to
   `/t/<id>/groups`: draw, enter results from Fixtures, Generate knockout, play the bracket on
   `/t/<id>/knockout`.
3. Check other roles: `a_cap1` (captain, My team), `a_sol01` (soldier), `ravi_auctioneer` (can
   view, can't edit), `meera` (other organiser, gets 404 everywhere).
4. Other seed stages: `--stage=groups` (mid group stage, one match live) and `--stage=knockout`
   (semi 1 done, semi 2 live).
5. Big screen: `/live/ravi-live/format`.

**Not done / known gaps**

- Webhook dispatch for `groups.drawn`, `match.result` and `tournament.completed` (Lane B owns
  delivery; see integration notes).
- Real Ably delivery was not exercised (no `ABLY_API_KEY`). Events are asserted through the
  recorder in tests, and pages refresh on `t:<id>:updates`.
- Mark live, Enter result and Set time live in the match sheet (tap a row), not inline in each
  list row.
- No captain stats (schema; see integration notes). Standings show before the draw ceremony
  finishes, so a viewer can see the result early. The home page shows the status pill twice
  (header and hero).
- The organiser tie-break draw is kept in the audit log until `groups.draw_order` exists.
- `/live/[liveCode]` (the bare path) is not created, to avoid a conflict with Lane B.
- The e2e runs against `next dev` and needs a fresh seed for each full run.
