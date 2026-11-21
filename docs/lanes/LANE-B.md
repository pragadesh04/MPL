# Lane B — Auction, allocation, real-time & webhooks

Branch `lane/b` · worktree `../mpl-lane-b` · port **3002** · Neon branch `lane-b`.
Plan sections: §2.6, §3.1–3.4, §6 (all), §7.6–7.10, §9 items 1–9 and 24–29, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane B column). Never edit shared files; write integration notes below.

## Checklist

- [x] **B1 Rules.** `nextValidBid` (flat raise and price bands), `canTeamBid` (returns the reason), custom-bid bounds, timer and break math, `allocateLeftovers`, `unsoldPolicy` handling. **100% branch coverage.**
- [x] **B2 `initializeAuction`.** Fill in the Phase 0 stub: create `auction_state`, the random pool order and starting purses.
- [x] **B3 Auction service.** `settleDue` (lot expiry, break expiry), bids (`FOR UPDATE`, `expectedVersion`, custom amounts), commands (next / sold / unsold / pause / resume / undo / take control / start new round), release, auction again, assign, reset, `processed_commands` idempotency, audit log, **publishing only after commit**.
- [x] **B4 Endpoints.** `GET …/auction` (snapshot), `POST …/auction/bids`, `…/commands`, `…/tick`.
- [x] **B5 Client auction state.** Zustand store, version-gap detection with snapshot refetch, server clock offset, 10 s heartbeat, tick nudges at 0, Ably presence (online dots).
- [x] **B6 Screens.** Auctioneer console (controller lock, keyboard shortcuts). Command post. Captain phone bidding view. Soldier live status card component. Big-screen auction view. Sounds and confetti.
- [ ] **B7 Allocation.** Preview, animated run, override, confirm, then status `GROUP_DRAW`.
- [ ] **B8 Webhooks.** Settings → Integrations UI, encrypted URL + secret, HMAC signing, Discord embeds, SSRF guard, delivery with `after()` and retries, delivery log, redeliver, test event, auto-disable.
- [ ] **B9 Tests.** Unit + service tests (PGlite). **Concurrency test on real Postgres** (20 simultaneous bids: one winner per version, purse never negative, no double sale). Tenant-isolation tests. E2E `e2e/auction/**` with two captain browsers.
- [ ] **STOP: Lane B.** `npm run lint && npm run type-check && npm test`, write the handoff, commit, stop.

## Phase 0 pieces to build on

- Rules to implement: `src/lib/rules/{nextValidBid,canTeamBid,timers,reauctionPrice,allocateLeftovers,unsoldPolicy}.ts` (keep the signatures; add tests next to them).
- Contracts: `src/lib/schemas/auction.ts` (bid / command bodies, `AuctionSnapshot`), `src/lib/schemas/realtime.ts` (every auction event + envelope), `src/lib/schemas/settings.ts` (`parseSettings`, `EDITABLE_AFTER_START`).
- Stub to fill: `initializeAuction(tx, tournamentId)` in `src/server/services/auction/initializeAuction.ts` — signature is final; Lane A calls it inside Start.
- DB: `withTransaction((tx, onCommit) => …)`; lock with `tx.select().from(auctionState).where(…).for('update')`; `dbNow(tx)` is the clock; `writeAudit`; `bumpRosterVersion` for `t:<id>:updates`.
- Real-time: `publishAuction(tournamentId, version, serverNow, type, data)` — call from `onCommit` only. In tests events are recorded: `getPublishedEvents()` / `clearPublishedEvents()`.
- Client: `RealtimeProvider`, `useChannel`, `useConnectionState`, `useRealtimeClient` (presence) in `src/lib/realtime/provider.tsx`; clock helpers in `src/lib/realtime/clock.ts`; sound preference `useSoundEnabled()` in `src/lib/sound.ts`.
- Encryption for webhooks: `encrypt` / `decrypt` in `src/server/auth/crypto.ts` with `env().APP_ENCRYPTION_KEY`.
- Concurrency tests: `vitest.concurrency.config.mts`, set `CONCURRENCY_DATABASE_URL` (direct URL of a throwaway Neon branch or Docker Postgres). `connect(url)` in `src/server/db/connect.ts` picks Neon / node-postgres automatically.
- Seed: `npm run db:seed -- --stage=ready` (fresh auction) or `--stage=auction` (live lot on the block, 10 sold).

## Progress

- 2026-11-21 · B1 rules: `nextValidBid`, `minRaise`, `quickRaiseOptions`, `isJumpBid`,
  `canTeamBid`, `customBidBounds`, timers, `reauctionPrice`, `allocateLeftovers`,
  `resolveUnsoldLot`, `afterRoundEnds`. 73 tests, 100% statements/branches/functions/lines on all
  six modules.
- 2026-11-21 · B2 `initializeAuction`: purses reset to `purse_total`, pool numbered 1…n by
  `playerOrder` (CSPRNG shuffle), round-1 `auction_state`, audit. Idempotent.
- 2026-11-21 · B3 auction service (`src/server/services/auction/`): `engine.ts` (lock context,
  open / close lot, round end, `settleDue`, persist + publish), `run.ts` (the write pipeline),
  `bids.ts`, `commands.ts` (all 12 commands), `control.ts`, `snapshot.ts` (snapshot, tick,
  live-code access), `pool.ts`. 42 PGlite service tests.
- 2026-11-21 · B4 endpoints: `GET …/auction` (`?liveCode=` for the big screen), `POST …/auction/bids`,
  `…/commands`, `…/tick` (body `{ liveCode? }`). Smoke-tested on the dev server with the
  `auction` seed: valid bid, duplicate commandId, ALREADY_LEADING, stale OUTBID, late TOO_LATE,
  pause/resume, cross-tenant 404, no-session 404, 422 on a bad body.
- 2026-11-21 · B5 client state (`src/features/auction/realtime/`): pure event reducer, vanilla
  Zustand store with smoothed clock offset, `useAuctionRealtime` (gap refetch, reconnect refetch,
  10 s heartbeat, 2 s polling without Ably, tick nudges with retry, bid / command actions),
  `useServerNow` / `useCountdown`, `usePresence`. 15 tests (reducer, store, hook in jsdom).
- 2026-11-21 · B6 screens. Pages: `/t/[id]/auction` (one URL, view by role: organisers →
  auctioneer console, captains → phone bidding view, soldiers → live status card),
  `/t/[id]/command-post`, `/live/[liveCode]/auction` (big screen, no login). Shared base in
  `src/features/auction/shared/` (context provider, phase / bid-state helpers on the shared
  rules, lot card, squad card, bid history, countdown ring, Web Audio sounds, confetti). Services
  `page-data.ts` (first-render data, command-post roster) and `live-settings.ts` (Rules card
  after Start). 70 component tests + 4 service tests. Checked in a real browser (Playwright
  screenshots of all five screens, no console errors after fixing a countdown hydration mismatch).

## Decisions

- **Quick-raise chips** (`quickRaiseOptions`): `+1` is the next valid bid, `+2` / `+5` add one /
  four more raises on top, where the raise is the step at the current bid (base price before the
  first bid). Flat +1 at 10 MP → `[11, 12, 15]`.
- **Jump bid** (`isJumpBid`): more than 5 raises above the next valid bid asks for confirmation.
- **Re-auction price rounding** uses the step of the band the _reduced_ price falls in.
- **Opening bid floor:** `nextValidBid` never returns less than 1 MP (DB `CHECK (amount > 0)`),
  even if a base price of 0 slipped through.
- **Round end** (`afterRoundEnds`): nobody unsold → `COMPLETE`; `REAUCTION_THEN_ALLOCATE` runs
  rounds 2 … 1 + `unsoldReauctionRounds` then `ALLOCATE`; `RANDOM_SQUAD` / `ADMIN_DECIDES` →
  `WAIT_FOR_ADMIN` (organiser uses Auction again / Assign).
- `RANDOM_SQUAD` picks among teams with space **in team order**, indexed by `random()`.
- **Write pipeline** (`run.ts`): lock `auction_state` → `settleDue` → SAVEPOINT { claim
  `commandId` in `processed_commands` → command } → persist → COMMIT → publish. A command that
  fails with an `AppError` rolls back to the savepoint but the settle steps still commit and
  publish (a late bid closes the lot, then gets `TOO_LATE`).
- **The auction starts idle.** `initializeAuction` opens nothing; the controlling organiser's
  first `next` ("Start auction") opens soldier 1. Captains see the lobby until then.
- **Controller lock:** the first organiser to send a console command while nobody holds control
  takes it automatically (logged `auction.control_taken`, `control.changed`). Others get
  `RULE_VIOLATION / NOT_CONTROLLER` until they send `take-control`.
- **Version checks:** console commands (`next`, `sold`, `unsold`, `pause`, `resume`, `undo`,
  `start-round`) and bids must match `expectedVersion` (bids → 409 `OUTBID`, commands → 409
  `CONFLICT / STALE_VERSION`). Roster commands (`release`, `auction-again`, `assign`),
  `take-control` and `reset` act on fresh rows and skip the check.
- **`auction_state.version` counts auction events only.** Release / undo / assign / auction again
  don't bump it; they publish `people.updated` on `t:<id>:updates` (roster version), and the
  client refetches the snapshot.
- **After a close, the next steps are timed from `now`**, not the old deadline, so an auction
  nobody watched resumes with a fresh break instead of racing through every lot unbid.
- **Close-time recheck:** if the leading team became full or short of points during the lot (an
  Assign), the lot closes UNSOLD with reason `BIDDER_INELIGIBLE`.
- **Mark unsold** puts the soldier on the unsold list (reason `CLOSED_BY_ORGANISER`) even if
  there were bids, and never applies `RANDOM_SQUAD`.
- **Undo** = the latest `auction.sold` audit entry whose soldier is still SOLD to that team at
  that price; the soldier goes to the **front** of the pool. **Release** sends to the back.
- **Sold / Mark unsold / Next need the auction live** (resume first). Roster commands work while
  paused too.
- **Round 2+ prices**: every lot opened in round > 1 uses `reauctionPrice`, including after
  "Start new round".
- **Assign** accepts UNSOLD or POOL soldiers; when nothing is running and the pool and the unsold
  list are both empty, the auction completes (→ `ALLOCATION`).
- **Pause** stores the lot's (or the break's) remaining ms; resume restores it from `now`.
- **Screens by role on one URL:** `/t/[id]/auction` renders the console for any organiser role (a
  read-only state with the reason for viewers who can't act, §7.3), the phone view for captains,
  the status card for soldiers. The command post is a separate organiser page.
- **Sounds are synthesised with the Web Audio API** (`shared/effects.ts`), so no audio assets ship;
  `howler` is unused by Lane B. Sounds only play when `useSoundEnabled()` is true.
- **Rules card after Start** edits only the `EDITABLE_AFTER_START` keys through
  `updateLiveAuctionSettings` (audited `settings.live_updated`); changes apply to the next lot or
  break.
- **Big screen** lives at `/live/[liveCode]/auction` (a sub-route, so it never conflicts with
  Lane C's `/live/[liveCode]` page).
- Countdown elements use `suppressHydrationWarning`: they are clock-derived and re-render every
  250 ms.
- `teamBidState` returns the rule's reason `code` as well as the captain-facing text; the console
  tiles reword by code ("Squad full", "Leading", "Can't afford n MP").
- Snapshot reads and ticks first do an unlocked "is anything due?" check, and only then take the
  lock, so heartbeats don't queue on the row lock.

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

1. **`src/lib/rules/index.ts`:** also export `bidBlockMessage` from `./canTeamBid` (the
   human text for each `BidBlockReason`, used by the phone, console and API errors). Meanwhile
   Lane B imports it from `@/lib/rules/canTeamBid` directly.
2. **Snapshot contract (`src/lib/schemas/auction.ts`):** `current` has no player details (name,
   IGN, photo). Workaround: the soldier on the block is listed **first in `pool` with status
   `ON_BLOCK`**. Suggested change: add `current.player: snapshotPlayerSchema` and keep `pool` to
   POOL soldiers only.
3. **Realtime contract (`src/lib/schemas/realtime.ts`):** there is no event for "auction reset".
   Workaround: reset emits `control.changed` (which makes every client refetch) plus
   `tournament.status`. Suggested: add `auction.reset` to `AUCTION_EVENT_TYPES`.
4. **Lane A Start (A9):** set the status to `AUCTION_LIVE` **before** calling
   `initializeAuction(tx, id)`. Lane B's engine treats `AUCTION_LIVE` with nothing on the block as
   the pre-auction lobby.
5. **Snapshot squad members have no sale order.** The big-screen ticker orders recent sales by
   matching members to `recentBids` (last 30). Suggested: add `soldAt` (or the winning `bidId`)
   to `snapshotSquadMemberSchema`.
6. **`lastResult` has no id.** The big-screen SOLD / UNSOLD stamp is keyed on player + result +
   team + price, so the same soldier going unsold twice in a row (re-auction) isn't stamped the
   second time. Suggested: add a sequence (the closing `version`) to `lastResultSchema`.
7. **Live-settings form schema:** the command-post Rules form repeats the bounds of
   `liveSettingsPatchSchema` (server-only). Suggested: export a client-safe live-settings schema
   (with the reset ≤ timer refine) from `src/lib/schemas/settings.ts`.
8. **Navigation (I3):** link `/t/[id]/auction`, `/t/[id]/command-post` and `/t/[id]/allocation`
   from the app shell / tournament home by role; link `/live/[liveCode]/auction` from Lane C's live
   page while the status is `AUCTION_LIVE` / `AUCTION_PAUSED`.
9. **Soldier portal (I3):** render `SoldierStatusCard`
   (`src/features/auction/soldier/soldier-status-card.tsx`) inside an `AuctionProvider` on Lane A's
   soldier portal (§7.5).
10. **Command post announcement field (§7.6a)** isn't built: the announcement service is Lane C's.
    Add Lane C's Post / Clear control to the command post at integration.

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
