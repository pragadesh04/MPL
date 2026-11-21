# Lane C — Format, matches & public pages

Branch `lane/c` · worktree `../mpl-lane-c` · port **3003** · Neon branch `lane-c`.
Plan sections: §4 (all), §7 (visual direction, announcement, tournament home), §7.10a–7.13, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane C column). Never edit shared files; write integration notes below.

## Checklist

- [ ] **C1 Rules.** `generateGroups`, `generateRoundRobin`, `computeStandings` (every tie-break), `seedKnockout`, `generateBracket`, `assignMatchOrder`, `buildTournamentTree`, incl. 2 teams and 3–5 teams. **100% branch coverage.**
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

## Decisions

_Choices made inside the lane that the integrator should know about._

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
