# Lane B — Auction, allocation, real-time & webhooks

Branch `lane/b` · worktree `../mpl-lane-b` · port **3002** · Neon branch `lane-b`.
Plan sections: §2.6, §3.1–3.4, §6 (all), §7.6–7.10, §9 items 1–9 and 24–29, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane B column). Never edit shared files; write integration notes below.

## Checklist

- [x] **B1 Rules.** `nextValidBid` (flat raise and price bands), `canTeamBid` (returns the reason), custom-bid bounds, timer and break math, `allocateLeftovers`, `unsoldPolicy` handling. **100% branch coverage.**
- [x] **B2 `initializeAuction`.** Fill in the Phase 0 stub: create `auction_state`, the random pool order and starting purses.
- [x] **B3 Auction service.** `settleDue` (lot expiry, break expiry), bids (`FOR UPDATE`, `expectedVersion`, custom amounts), commands (next / sold / unsold / pause / resume / undo / take control / start new round), release, auction again, assign, reset, `processed_commands` idempotency, audit log, **publishing only after commit**.
- [x] **B4 Endpoints.** `GET …/auction` (snapshot), `POST …/auction/bids`, `…/commands`, `…/tick`.
- [ ] **B5 Client auction state.** Zustand store, version-gap detection with snapshot refetch, server clock offset, 10 s heartbeat, tick nudges at 0, Ably presence (online dots).
- [ ] **B6 Screens.** Auctioneer console (controller lock, keyboard shortcuts). Command post. Captain phone bidding view. Soldier live status card component. Big-screen auction view. Sounds and confetti.
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

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
