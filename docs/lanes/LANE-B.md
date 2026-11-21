# Lane B — Auction, allocation, real-time & webhooks

Branch `lane/b` · worktree `../mpl-lane-b` · port **3002** · Neon branch `lane-b`.
Plan sections: §2.6, §3.1–3.4, §6 (all), §7.6–7.10, §9 items 1–9 and 24–29, §12. Rules: PLAN §13.1.
Owned paths: PLAN §13.2 (Lane B column). Never edit shared files; write integration notes below.

## Checklist

- [ ] **B1 Rules.** `nextValidBid` (flat raise and price bands), `canTeamBid` (returns the reason), custom-bid bounds, timer and break math, `allocateLeftovers`, `unsoldPolicy` handling. **100% branch coverage.**
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

_Append dated entries as tasks land._

## Decisions

_Choices made inside the lane that the integrator should know about._

## Integration notes

_Shared-file changes this lane needs (schema columns, dependencies, contract fields, shell / layout changes), each with the reason and the workaround used meanwhile._

## Suggested CLAUDE.md updates

_Lines to add to CLAUDE.md (commands, gotchas, rules discovered)._

## Handoff

_Filled in at STOP: what is done, what is not, how to test it, known issues._
