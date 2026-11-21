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
- [ ] **C7 Extras.** Teams overview with image export, stats leaderboards, audit-log viewer, PWA manifest + offline shell, reduced motion.
- [ ] **C8 Tests.** Unit + service tests, tenant-isolation tests, e2e `e2e/format/**` (seed `--stage=allocated` → draw → results → knockout → champion).
- [ ] **STOP: Lane C.** `npm run lint && npm run type-check && npm test`, write the handoff, commit, stop.

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
  node or row opens the match sheet. API `GET /api/tournaments/[id]/matches?view=list|tree&stage=
&team=&group=&status=&q=` (`services/matches/hub.ts`). Filters are a pure tested module.

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
- **Captain stats**: `player_stats.player_id` references `players`, and captains are `leaders`,
  so per-match kills / deaths / MVP can't be recorded for captains. Suggest a nullable
  `leader_id` on `player_stats` (exactly one of player_id / leader_id), or document that only
  soldiers get stats.
- **Shared tournament layout**: Lane C pages render `TournamentHeader` (announcement banner, name,
  status pill, format nav, live refresh) themselves. I3 can move it into `t/[id]/layout.tsx` and
  add the auction / people / setup links with role-based navigation.
- **Dev bug (PGlite inside the project)**: the default `DATABASE_URL` fallback
  `pglite:./.pglite/dev` (src/server/env-core.ts) lives inside the project, so every PGlite write
  (reads write too) makes Turbopack recompile and reload the page, which queries again: an endless
  reload loop with ~100 page loads a minute, and it can lose a write. Fix in a shared file: move
  the default outside the project (e.g. `pglite:../.pglite/<folder name>`) or exclude `.pglite`
  from the dev watcher. Workaround in this lane's `.env.local` only:
  `DATABASE_URL=pglite:../.pglite-lane-c` (and the same for `DATABASE_URL_UNPOOLED`).
  Even with the database outside, the first visits right after `next dev` starts can reload a few
  times while Turbopack compiles new routes (dev only, settles by itself).
  Turbopack also served a stale SSR module once after an edit (hydration mismatch until restart).
  Also: stop `next dev` before `npm run db:seed`; TaskStop on the npm wrapper can leave the
  `start-server.js` child holding the port and the database.

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
