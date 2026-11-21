# Lane C — Format, matches & public pages

Branch `lane/c` · worktree `../mpl-lane-c` · port **3003** · Neon branch `lane-c`.
Plan sections: §4 (all), §7 (visual direction, announcement, tournament home), §7.10a–7.13, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane C column). Never edit shared files; write integration notes below.

## Checklist

- [x] **C1 Rules.** `generateGroups`, `generateRoundRobin`, `computeStandings` (every tie-break), `seedKnockout`, `generateBracket`, `assignMatchOrder`, `buildTournamentTree`, incl. 2 teams and 3–5 teams. **100% branch coverage.**
- [ ] **C2 Group draw.** Fill in the `startGroupDraw` stub. Pots, random or manual draw, ceremony UI, fixtures and match numbers, then status `GROUP_STAGE`.
- [ ] **C3 Results and progression.** Per-game result modal (tied game can't be saved), mark live, per-soldier stats, reorder within a stage, Generate knockout, auto-advance, safe cascading edits, `KNOCKOUT` → `COMPLETED`, champion screen.
- [ ] **C4 Matches hub** `/t/[id]/matches`. List and Tree toggle, Now playing / Up next, My-team filter and path highlight, placeholders, PNG export, live updates, 404 for outsiders.
- [ ] **C5 Groups and knockout screens.** Standings with Q badge and cut-off line, fixtures by matchday, knockout tree with zoom and pan.
- [ ] **C6 Tournament home and announcements.** `/t/[id]` with status badges, hero, **Rules of engagement generated from settings**, announcement banner service (post / clear, live). Non-auction big-screen views.
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

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
