# Lane B — Auction, allocation, real-time & webhooks

Branch `lane/b` · worktree `../mpl-lane-b` · port **3002** · Neon branch `lane-b`.
Plan sections: §2.6, §3.1–3.4, §6 (all), §7.6–7.10, §9 items 1–9 and 24–29, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane B column). Never edit shared files; write integration notes below.

## Checklist

- [x] **B1 Rules.** `nextValidBid` (flat raise and price bands), `canTeamBid` (returns the reason), custom-bid bounds, timer and break math, `allocateLeftovers`, `unsoldPolicy` handling. **100% branch coverage.**
- [ ] **B2 `initializeAuction`.** Fill in the Phase 0 stub: create `auction_state`, the random pool order and starting purses.
- [ ] **B3 Auction service.** `settleDue` (lot expiry, break expiry), bids (`FOR UPDATE`, `expectedVersion`, custom amounts), commands (next / sold / unsold / pause / resume / undo / take control / start new round), release, auction again, assign, reset, `processed_commands` idempotency, audit log, **publishing only after commit**.
- [ ] **B4 Endpoints.** `GET …/auction` (snapshot), `POST …/auction/bids`, `…/commands`, `…/tick`.
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

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

1. **`src/lib/rules/index.ts`:** also export `bidBlockMessage` from `./canTeamBid` (the
   human text for each `BidBlockReason`, used by the phone, console and API errors). Meanwhile
   Lane B imports it from `@/lib/rules/canTeamBid` directly.

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
