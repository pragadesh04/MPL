# Mini Militia Premier League (MPL) — Product & Technical Plan

A web app to run a **Mini Militia (Doodle Army 2) tournament end to end**: organisers
set up a tournament, captains and soldiers register with their own accounts, captains get
a purse in **Militia Points**, a **live player auction** runs on everyone's phones, leftover
soldiers are auto-assigned, and **groups + a knockout tree** are generated from the number
of teams. It then tracks matches through to the champion.

> Status: **Phase 0 (Foundation, §13.3) built and tagged `foundation`**; lanes A, B and C
> (§13.4–13.6) come next. Sections marked ❓ are open questions to settle before building the
> related part.

---

## 1. Tournament lifecycle

```text
DRAFT ──► READY ──► AUCTION_LIVE ⇄ AUCTION_PAUSED ──► ALLOCATION ──► GROUP_DRAW ──► GROUP_STAGE ──► KNOCKOUT ──► COMPLETED
  │ setup + registration │ "Start Tournament" locks setup and closes registration
  └─ editable ───────────┘
```

| State            | What happens                                                                 | Who can act        |
| ---------------- | ---------------------------------------------------------------------------- | ------------------ |
| `DRAFT`          | Organisers set rules and bring people in (personal links, organiser key, Player ID requests, §2.3). Captains set up their teams; key sign-ups wait for approval. Everything is editable. | Organisers, Captains (own team), Soldiers (own profile) |
| `READY`          | Every validation check passes; the **Start Tournament** button is enabled.  | Owner, Co-admin    |
| `AUCTION_LIVE`   | Soldiers go under the hammer one by one; captains bid from their phones.     | Auctioneer, Captains |
| `AUCTION_PAUSED` | Timer frozen (break, dispute, network issue).                                | Auctioneer         |
| `ALLOCATION`     | Unsold rounds are finished; leftover soldiers are auto-assigned (§3.4).      | Owner, Co-admin    |
| `GROUP_DRAW`     | Seeding pots plus an animated draw into groups; fixtures generated (§4.2).   | Owner, Co-admin    |
| `GROUP_STAGE`    | Round-robin results entered; standings update live (§4.3).                   | Owner, Co-admin    |
| `KNOCKOUT`       | Qualified teams seeded into the tree; winners advance automatically (§4.4).  | Owner, Co-admin    |
| `COMPLETED`      | Champion screen, stats and exports. Read-only.                               | Everyone (view)    |
| `CANCELLED`      | The owner abandoned the tournament (from any state before `COMPLETED`, by typing its name to confirm). Read-only. | Owner |

**One active tournament per organiser.** An organiser can **own only one active
tournament** at a time; *active* means any state except `COMPLETED` or `CANCELLED`.
"New tournament" is disabled until the current one is completed or cancelled. The server
enforces this with a unique index (§5), not only in the UI.

- Different organisers can still run their tournaments **at the same time**, so the
  app must handle several live auctions at once.
- Being a co-admin, auctioneer, captain or soldier in *someone else's* tournament
  doesn't count towards your limit.
- `COMPLETED` / `CANCELLED` tournaments stay viewable as a read-only archive (squads,
  auction results, groups, bracket, stats). A new tournament can **copy the settings**
  (rules, increments, format) from any earlier one. Captains and soldiers are **not** carried
  over: each tournament has its own roster, but people **reuse their account** to join a new one.

**Rule:** once you click **Start Tournament**, the rules, purses, base prices and team
details are **locked** and registration closes. Admin overrides afterwards (fixing a purse,
undoing a sale) are allowed, but each one must be written to the audit log with a reason.

---

## 2. Accounts, roles and joining

### 2.0 Unrelated organisers, each with their own people

MPL is **multi-tenant**: any number of organisers (admins) who don't know each other can use
the same site. Each organiser has **their own captains and soldiers** and never sees anyone
else's.

- An organiser's people are the captains and soldiers in **that organiser's tournament**. Every
  query is scoped to a tournament, and every tournament belongs to exactly one owner (§2.4).
- Organisers **can't browse, search or list** users. The only lookup across organisers is an
  **exact Player ID** (§2.3, path C), and it returns only the public card: display name, IGN, photo.
  Never phone, username or other tournaments.
- **One person, several organisers:** a player can be in Organiser A's and Organiser B's
  tournaments at the same time. Each organiser sees only their own record of that person
  (purse, price, status). Tournaments of different organisers can be live at the same moment.
- Cross-tenant leaks are treated as the worst class of bug. Every service has a
  **tenant-isolation test**: a user from organiser A calls it against organiser B's tournament and
  must get 404.

### 2.1 Accounts and roles

There are two kinds of sign-up, but one `users` table:

| Account     | Signs up at | Gets | Notes |
| ----------- | ----------- | ---- | ----- |
| **Organiser** | `/register/organiser`: name, username, email, password | An **organiser key** (§2.3, path B) and the right to create a tournament (one active at a time) | Can also play in other organisers' tournaments |
| **Player**    | `/register`: name, IGN, username, password, phone (optional), photo, plus an optional **organiser key** | A permanent **Player ID** like `#4K9QX7` | Becomes a captain or soldier **only inside a tournament** |

What someone can do depends on their **role in a given tournament**, never on a global flag:

| Role (UI name)            | How they get the role                                             | Can do                                                        |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| **Owner**                 | Creates the tournament                                            | Everything, including managing organisers and deleting the tournament |
| **Co-admin**              | Organiser invite link from the owner (§2.4)                       | Same as owner except deleting, transferring and managing organisers |
| **Auctioneer**            | Organiser invite link from the owner (§2.4)                       | Run the auction console only; everything else is view-only    |
| **Captain** (`Leader`)    | Any of the three joining paths in §2.3                            | Set up **their own team**; bid for that team during the auction |
| **Soldier** (`Player`)    | Any of the three joining paths in §2.3                            | Keep their profile up to date; follow their auction status, team and fixtures |
| **Free agent**            | A player account that isn't in any tournament yet                 | Share their Player ID, enter an organiser key, accept or decline requests |
| **Viewer / Big Screen**   | Public link `/live/:liveCode` (no login)                          | Watch the auction, groups, bracket and results live           |

**Terminology.** In the UI, leaders are called **Captains** and players are called
**Soldiers**. In code, the tables and APIs stay `leader` and `player`. There are
**no other categories**: no tiers and no playstyle roles.

**Role combinations inside one tournament:**
- Captain **and** soldier at the same time: **not allowed**.
- An organiser can also be a captain or soldier (common in friend-group tournaments).
  Every action they take as an organiser is still recorded in the audit log.
- One account can hold different roles in different tournaments at the same time.

**Tracked separately:** captains live in the `leaders` table and soldiers in the
`players` table, each with a nullable link to a `users` row. They are shown in separate tabs with separate counts.

- **Each captain is one team.** The number of teams is the number of approved captains; nobody
  types a team count.
- **The captain plays and fills one squad slot automatically** and is never auctioned.
  With max 6 per team, a captain can buy or receive at most 5 soldiers.

### 2.2 Personal invite links (for captains **and** soldiers)

When the organiser adds a person with **Add person → Captain / Soldier**, that person gets a
**personal link**. The Share button (Copy · WhatsApp · QR · Regenerate · Unlink) appears on
**both captain and soldier rows**.

```text
Organiser adds Captain (name, purse) or Soldier (name, base price) ──► Share link
https://mpl.app/i/<token>
Person opens link ──► GET /api/invites/<token> ──► decrypt → { kind, id, tournament }
   ├─ no account  ──► Register as a player (prefilled with what the organiser typed)
   └─ has account ──► Log in
──► POST /api/invites/<token>/claim ──► leaders.user_id / players.user_id = me (one-time claim)
──► Captain: team setup page ("Team ready")  ·  Soldier: "You're in! Waiting for the auction"
```

**Token design** (authenticated encryption over the record id, not a username):

- Payload `{ k: 'L' | 'P', id, tid, v }` (kind, leader/player id, tournament id,
  `link_version`), encrypted with **AES-256-GCM** using the server-only `INVITE_LINK_SECRET`,
  sent as URL-safe Base64 of `iv | ciphertext | authTag`.
- A changed or invented token **fails to decrypt**, so nobody can guess someone else's link.
- **Claimed once:** after claiming, the link only asks *that* user to log in. Any other account
  sees "This spot is already taken".
- **Regenerate** increments `link_version`, so the old link stops working at once. **Unlink account**
  (logged) frees a wrongly claimed spot.
- Rejected if it fails to decrypt, the record is deleted, `v` doesn't match, or the tournament is
  completed. Every rejection gives the same generic 404.
- People added this way are **already approved**, because the organiser created them.
- Soldiers who never claim their link are fine: soldiers don't have to act in the app. This covers
  players without a phone.

**Tracking on each row:** `Link not opened` → `Opened` → `Account linked` → (captains)
`Team ready`, with the last-activity time.

### 2.3 Three ways to get under an organiser

```text
                       ┌─ A. Personal link   (organiser created the spot)          → approved at once
Player ── joins an ────┼─ B. Organiser key   (player types the key, picks a role)  → organiser approves
organiser's tournament └─ C. Player ID request (organiser sends, player accepts)    → approved at once
No key, no link, no request  →  "free agent": registered, but under no organiser
```

**A. Personal link:** see §2.2.

**B. Organiser key, a simple key that goes straight to the right organiser**

- Every organiser has **one organiser key**: 6 characters from an unambiguous alphabet (no
  `0/O/1/I/L`), shown as `RV7-K2P`. Typing is case-insensitive and the dash is optional. It stays the same
  across seasons, so players can remember it. The organiser can **regenerate** it if it leaks.
- The key always points to the organiser's **current active tournament** (they can only have one,
  §1). If they have none, or registration is closed, the player is told so and can still sign up
  as a free agent.
- **Sign-up with a key:** on `/register`, the player fills in their details and the optional
  **Organiser key** field. As soon as the key is valid, the form shows "You're joining **Ravi's MPL
  Season 2**" and a **Captain / Soldier** choice. Existing accounts use **Join with a key** on
  their dashboard instead.
- The person arrives as `PENDING_APPROVAL` in the chosen tab. The organiser then:
  - **approves a captain**, confirming the purse (prefilled with `defaultPurse`), after which the
    captain does team setup
  - **approves a soldier**, setting the base price (prefilled with `minBasePrice`)
  - **switches the role** (for example captain → soldier, if there are already enough captains),
    then approves
  - or **rejects** with a reason.
- Organiser controls: registration **Open / Closed**, optional **max registrations**, and a live
  counter ("23 registered · 4 pending"). Registration **closes automatically at Start**, and Start
  is blocked while anyone is still pending.

**C. Player ID request: the organiser invites a free agent (or any player)**

- Every player account has a permanent **Player ID** (`#` + 6 characters, for example `#4K9QX7`),
  shown on their dashboard with Copy and Share buttons.
- The organiser opens **Invite by Player ID**, types the ID, and sees the **public card** (photo,
  display name, IGN). They pick **Captain** (with purse) or **Soldier** (with base price) and
  press **Send request**.
- The player sees the request **live** in their inbox (bell badge + card): "**Ravi** invites you to
  **MPL Season 2** as **Captain** · 50 MP purse", with **Accept / Decline**. They can also choose
  **Decline & block this organiser**.
- **Accept** → they join the tournament already approved (captains go to team setup). **Decline** →
  the organiser sees "Declined".
- Rules: one pending request per player per tournament; requests expire after 7 days or when the
  tournament starts; organisers can **cancel** a pending request; requests are rate-limited (for
  example 50 a day per organiser) to stop spam. Blocked organisers can't send requests to that player.

**Free agents:** someone who registers with no key, link or request is a normal player account
that belongs to **no organiser**. Their dashboard says "You're not in a tournament yet" and offers
three things: their **Player ID** card to share, a **Join with a key** field, and the **requests
inbox**. They don't appear in any organiser's lists until they join through A, B or C.

**Common rules for all three paths**

- The same account can't join the same tournament twice, or as both captain and soldier.
  The server checks this in a transaction that locks the tournament row.
- Joining is possible only while the tournament is `DRAFT` / `READY`.
- Profile (name, IGN, photo) is **snapshotted** into `leaders` / `players` at join time. Players
  can edit their snapshot until Start.

### 2.4 Organiser team (co-admins and auctioneers)

| Permission                                   | Owner | Co-admin | Auctioneer |
| -------------------------------------------- | :---: | :------: | :--------: |
| View everything in the tournament            | ✔     | ✔        | ✔          |
| Edit settings; add captains and soldiers; share personal links and the organiser key; send / cancel Player ID requests | ✔ | ✔ | – |
| Approve / reject key sign-ups (captains and soldiers), switch their role, set purses and base prices | ✔ | ✔ | – |
| Reset a participant's password (one-time link) | ✔   | ✔        | –          |
| Start tournament, run allocation, group draw, generate knockout | ✔ | ✔ | –      |
| Run the auction console (next / sold / unsold / pause / undo / fallback bid / start new round) | ✔ | ✔ | ✔ |
| Release a soldier, auction again, assign an unsold soldier | ✔ | ✔ | –          |
| Post the **announcement banner** (shown on the home, auction and admin pages) | ✔ | ✔ | – |
| Enter and edit match results                 | ✔     | ✔        | –          |
| Admin overrides (purse fix, rename team, reassign soldier) | ✔ | ✔ | –          |
| Reset auction                                | ✔     | –        | –          |
| Add / remove organisers, change their role   | ✔     | –        | –          |
| Delete the tournament, transfer ownership    | ✔     | –        | –          |

**Invite flow:** the owner opens **Settings → Organisers**, enters an email or username and a role,
and gets a **single-use link** (a random 32-byte token, stored **hashed**, valid for 7 days).
The invitee registers or logs in, then accepts. The owner can revoke pending invites and
remove members.

**Several organisers in the auction room:** only **one organiser controls the console at
a time** (`AuctionState.controllerUserId`). The others see it read-only, with a
"<name> is running the auction" banner and a **Take control** button (logged). Presence
avatars show who is connected. Every `AuditLog` entry records the acting user.

### 2.5 Passwords

- Passwords are hashed with argon2 and must be at least 8 characters. Logins are rate-limited per IP and username.
- **Forgot password (participants):** soldiers and captains have no email, so they ask
  an organiser, who clicks **Reset password**. This creates a **one-time reset link** (valid 30 min)
  to send on WhatsApp. Organisers can only reset accounts that take part in their own tournament.
- **No email service** (decision Q10): every invite and reset is a link you copy and share
  on WhatsApp.
- **Forgot password (organisers):** organisers can change their password while logged in.
  If an organiser is locked out, the site operator runs a server script
  (`npm run user:reset-password -- <username>`), which prints a one-time reset link. A co-admin
  **cannot** reset an owner's password, because that would let them take over the tournament.

### 2.6 Bidding

1. **Phones (primary):** captains log in and bid in real time (§7.8).
2. **Auctioneer-entered bids (fallback):** the auctioneer can press `Team X bids` for a
   captain whose phone or connection drops. Each such bid is marked "entered by <organiser>"
   in the bid history and the audit log. This is a per-tournament toggle, on by default.

Both call the **same server-side bid function**, so the rules (§3) are enforced the same way.

---

## 3. Business rules (the most important part)

All money is in **Militia Points** (short form **MP**, e.g. `1000 MP`), stored as
**integers** and never floats. Display: thousands separators (`1,250 MP`) and a small
MP badge/icon next to every amount.

### 3.1 Tournament settings

| Setting                 | Example        | Notes                                                                   |
| ----------------------- | -------------- | ----------------------------------------------------------------------- |
| `teamCount`             | 6              | **Derived** = number of captains (2–32). Not entered by hand            |
| `minPlayersPerTeam`     | 4              | Minimum squad size (captain included), enforced at the end of allocation |
| `maxPlayersPerTeam`     | 6              | Hard cap (captain included): a full team **cannot bid**                 |
| *(captain slot)*        | always         | `squadSize` = 1 (captain) + soldiers bought or allocated                |
| `defaultPurse`          | 50             | Prefills each new captain's purse; editable per captain                 |
| `minBasePrice`          | 1              | Opening bid. No soldier's base price can be lower; default when approving |
| `bidIncrements`         | flat `+1`      | Minimum raise. Either one flat value (default, as in the reference build) or a step table by price band (below) |
| `allowCustomBids`       | true           | Captains may bid **more** than the minimum raise (quick-raise buttons + custom amount), as in the reference build |
| `bidTimerSeconds`       | 60             | Countdown per soldier                                                   |
| `timerResetSeconds`     | 60             | After each bid the timer resets to at least this value. Equal to `bidTimerSeconds` = "every bid restarts the clock" (default) |
| `breakSeconds`          | 2              | Pause between soldiers ("Next soldier in 2…"); then the next soldier opens **automatically** |
| `unsoldPolicy`          | `REAUCTION_THEN_ALLOCATE` | What happens to soldiers nobody bids on: `REAUCTION_THEN_ALLOCATE` (our rule: re-auction rounds, then fewest-players allocation, §3.4) / `RANDOM_SQUAD` (sent to a random squad with space at once) / `ADMIN_DECIDES` (stay on the unsold list until an organiser assigns them) |
| `unsoldReauctionRounds` | 1              | Extra auction rounds for unsold soldiers before auto-allocation (0 = none) |
| `reauctionPricePercent` | 50             | Base price in re-auction rounds as a % of the original (10–100). Rounded down to the bid step, never below `minBasePrice` |
| `playerOrder`           | `random`       | `random` / `byBasePriceDesc` / `manualQueue`                            |
| `allowAuctioneerBids`   | true           | Fallback: the auctioneer can bid for a captain who has dropped (logged)  |
| `registrationOpen`      | true           | The organiser key accepts new sign-ups for this tournament (forced off at Start; pending Player ID requests expire then too) |
| `maxRegistrations`      | –              | Optional cap on sign-ups through the organiser key                      |

The defaults match the small-purse setup of the reference build (50 points, opening bid 1, +1, 60 s,
2 s break), which suits a friend-group tournament. Organisers can switch to a step table for
bigger purses (example for a 1,000 MP purse):

| Current bid      | Step |
| ---------------- | ---- |
| < 100            | +5   |
| 100 – 299        | +10  |
| 300 – 599        | +20  |
| ≥ 600            | +50  |

### 3.2 A bid is valid only if all of these hold (checked on the server, atomically)

1. The tournament is `AUCTION_LIVE` and this soldier is the one currently on the block.
2. The timer hasn't run out (`now < endsAt`, using the **server** clock).
3. `amount >= nextValidBid` (base price for the first bid, then current + minimum raise).
   With `allowCustomBids` off, `amount == nextValidBid` exactly. The client proposes an
   amount and the **server re-checks it**. The phone UI offers quick buttons (`+1`, `+2`, `+5`,
   scaled by the raise) and a "Custom bid amount" field. A jump bid of more than 5× the
   minimum raise asks for confirmation, to stop typos.
4. The bidding team is **not already the highest bidder**.
5. `squadSize < maxPlayersPerTeam`.
6. `amount <= purseRemaining`.
7. The bidder is that team's captain (taken from the **session**), or the controlling
   auctioneer using a fallback bid.

> **No purse reserve rule.** A captain may spend their whole purse on one soldier.
> Leftover allocation (§3.4) fills their squad later ("I spent all my money on A").

### 3.3 Closing a lot

- Timer hits 0 **with** a bid → **SOLD** to the highest bidder: deduct the purse, add the
  soldier to the squad, and append to the audit log. All of this happens in **one database transaction**.
- Timer hits 0 **without** a bid → handled by `unsoldPolicy`. By default the soldier goes to the
  unsold list. If every squad is already full, the soldier stays unsold with the reason "No space".
- After each lot the **break** starts (`next_at = now() + breakSeconds`). When it ends, the next
  soldier from the waiting pool opens automatically, in random order by default. Organisers
  can pause during the break.
- When the waiting pool is empty, the round ends. With the default policy,
  `unsoldReauctionRounds` then run over the unsold list.
  Re-auction base price = `reauctionPricePercent` of the original.
  The card shows both prices (~~10~~ **5 MP**) with a "Re-auction" badge.
- **Organiser tools** (all logged, all in one transaction each):
  - **Sold now / Mark unsold**: close the current lot early.
  - **Undo last sale**: refund the purse and put the soldier back in the pool.
  - **Release**: remove *any* bought soldier from a squad, refund what was paid, and put the
    soldier back in the waiting pool.
  - **Auction again**: move one unsold soldier back into the pool, then **Start new round**.
  - **Assign** ("Admin pick"): put an unsold soldier straight into a chosen squad at price 0.
  - **Reset auction** (owner only, typing the name to confirm): clear all bids, sales and auction
    state, and refund all purses. People and teams stay.

### 3.4 Leftover allocation

After all auction rounds, any soldier still unsold goes to the **team with the fewest
players** (among teams below `maxPlayersPerTeam`), at **price 0**.

Algorithm (pure function in `src/lib/rules`, fully unit-tested):

```text
leftovers = unsold soldiers sorted by basePrice DESC (strongest first)
for each soldier in leftovers:
    eligible = teams where squadSize < maxPlayersPerTeam
    pick team with:
        1. fewest players
        2. tie → lowest MP left               (the team that spent the most gets help first)
        3. tie → team order                   (deterministic, shown to everyone)
    assign soldier to team, price 0, acquiredVia "AUTO_ALLOCATED"
```

Example: you spend everything on A, the other teams fill their squads, and B is left.
You have the fewest players, so **B goes to your team**.

**Allocation UI:** an animated reveal, one soldier at a time. The card flies into the team's
column and the reason is shown ("Fewest players: 3"). Organisers can **preview** the result
before confirming and **override** it with a logged reason.

### 3.5 Validation before "Start Tournament" is enabled

| Check                                                                                 | Why                                 |
| ------------------------------------------------------------------------------------- | ----------------------------------- |
| At least 2 **approved** captains, and **every captain has linked an account and completed team setup** (name, short code, **unique colour**) | Groups + UI depend on it |
| Team names unique; colours different enough (ΔE colour distance check) and readable   | Readability on the big screen       |
| **No captains or soldiers pending approval** (key sign-ups); pending Player ID requests are expired at Start | The pool must be final |
| Every approved soldier has a base price ≥ `minBasePrice`                             | Auction rule                        |
| `captains × (minPlayers − 1) ≤ approvedSoldiers ≤ captains × (maxPlayers − 1)`       | Allocation must be able to finish   |
| `minPlayers ≤ maxPlayers`                                                             | Sanity                              |
| No duplicate people (same account, IGN or phone) across captains and soldiers        | Registration hygiene                |
| Every captain has a purse ≥ the highest base price                                   | Every captain can afford a bid      |

The review screen shows each check as ✅ / ❌ with a "Fix" link that jumps to the right
wizard step.

---

## 4. Format: group stage, then knockout (generated dynamically)

Round-robin **groups**, then the top teams from each group go into a **knockout tree**.
Everything is generated from the number of teams by pure functions in `src/lib/rules`:

```text
generateGroups(teams, settings)        → groups with balanced sizes
generateRoundRobin(group, legs)        → fixtures per matchday (circle method)
computeStandings(group, matches)       → sorted table with tie-breaks applied
seedKnockout(standings, settings)      → knockout seeds (cross-group pairing)
generateBracket(seeds)                 → knockout tree with byes
```

### 4.1 Format settings (setup wizard → Rules, editable until Start)

| Setting              | Default                     | Notes                                               |
| -------------------- | --------------------------- | --------------------------------------------------- |
| `groupCount`         | auto: `ceil(teams / 4)`     | Admin can override; each group needs ≥ 3 teams      |
| `advancePerGroup`    | 2                           | How many from each group reach the knockout         |
| `roundRobinLegs`     | 1                           | 1 = play each team once, 2 = home and away          |
| `groupMatchBestOf`   | 1                           | Bo1 / Bo3                                           |
| `knockoutBestOf`     | 3                           |                                                     |
| `finalBestOf`        | 5                           |                                                     |
| `pointsForWin`       | 3                           | Loss = 0. No draws (see §4.3)                       |
| `thirdPlaceMatch`    | off                         | Semi-final losers play for 3rd                      |

The Rules step shows a **live format preview**, for example: "8 teams → 2 groups of 4 →
12 group matches → top 2 per group → semi-finals → final. Total: 15 matches."

**Small tournaments:** 2 teams → no groups, straight to a best-of final. 3–5 teams →
**one group** (a league); the top `advancePerGroup` play the final (or semi-finals if 4 advance).

### 4.2 Group draw

- Groups are balanced: sizes differ by at most 1 (for example 10 teams → 4, 3, 3).
- **Seeding pots:** teams are ranked (by default by total MP spent in the auction, or
  manually), then split into pots of size `groupCount`. Each group gets one team from each pot.
- **Draw ceremony** on the big screen: pot by pot, a team logo is drawn and drops into
  Group A, B, C… The organiser can choose **Random draw** or **Manual placement** (drag and drop).

### 4.3 Group matches and standings

- **Fixtures** come from the round-robin circle method and are grouped into **matchdays**
  (no team plays twice in a matchday). An odd-sized group gives one team a rest each matchday.
- **Result entry, per game:** team kills A vs B → game winner. A match is won by the most games.
- **No draws.** A game level on kills is **replayed** (a tied game can't be saved).
- **Standings columns:** Pos · Team · P · W · L · Games won–lost · Game diff ·
  Kills for–against · Kill diff · **Pts** · Form (last 3).
- **Tie-break order:** head-to-head → game difference → kill difference → total kills →
  organiser-run **draw** (logged).
- Standings are always **calculated from match results, never stored**.

### 4.4 Knockout

- Qualified teams = `groupCount × advancePerGroup`. `size = nextPowerOfTwo(qualified)`,
  `byes = size − qualified`; **group winners get the byes first**.
- **Cross-group seeding:** winners face runners-up from another group (A1 v B2, B1 v A2).
  Teams from the same group go into **opposite halves**, so they can only meet again in the final.
- A bye match resolves at once and the team advances automatically.
- Round names come from depth: `Final`, `Semi-final`, `Quarter-final`, `Round of 16`, then `Round N`.
- When the last group match is confirmed, the organiser sees the qualified teams. On
  **Generate knockout** the tree is built and broadcast.

### 4.5 Match details (Mini Militia specifics)

- Format per stage: Bo1 / Bo3 / Bo5.
- Per game: map (Catacombs, Outpost, High Tower, Bunkers, Snow Blind, …), mode (team
  deathmatch), kill limit or time limit, and kills per team.
- Optional per-soldier kills, deaths and MVP.
- When a knockout match is confirmed, the winner moves into the next slot. Editing a
  result reopens the downstream matches, after a warning, if they haven't started.

### 4.6 Match order (one running order for the whole tournament)

Every match gets a **match number** (`M1`, `M2`, …) that shows the **order matches are
played**, across both the group stage and the knockout.

- **Generated automatically** when fixtures are created:
  - **Group stage:** matchday by matchday, with groups interleaved (A-MD1, B-MD1, A-MD2, …)
    so no team plays two matches in a row where it can be avoided.
  - **Knockout:** round by round, top half then bottom half; the 3rd-place match comes
    before the final.
  - Bye matches get no number and are never "played".
- **Organisers can reorder** matches that haven't been played yet (drag and drop in list
  mode). The order is kept per stage, so a knockout match can never come before the
  group stage ends.
- **Placeholders** stand in until a slot is decided: "Group A #1", "Winner of M9",
  "Loser of M10". This lets the full order and tree be shown from the moment the groups are drawn.
- **"Now playing" / "Up next":** organisers mark a match `LIVE`. The next unplayed match
  by number is highlighted as *Up next* everywhere.
- **Who can see it:** **everyone taking part in the tournament** (owner, co-admins,
  auctioneers, captains and soldiers) once logged in. People outside the tournament get 404.
  The public big-screen link (`/live/:liveCode`) shows the same views for the projector,
  and organisers can switch it off.

---

## 5. Data model (Neon PostgreSQL + Drizzle ORM)

Schema in `src/server/db/schema.ts` (Drizzle), migrations generated by `drizzle-kit` and
committed. Ids are `uuid` (`gen_random_uuid()`), except append-only logs, which use `bigserial`.
Status fields are Postgres enums. **Money columns are `integer`** (MP). Every table that
belongs to a tournament has `tournament_id … REFERENCES tournaments ON DELETE CASCADE`.

```text
users              id, username, password_hash, display_name, ign, phone, photo_url,
                   is_organiser, email (required for organisers),
                   player_code (public Player ID, e.g. 4K9QX7), organiser_key (organisers only, e.g. RV7K2P),
                   created_at
tournaments        id, owner_id → users, name, logo_url, status, settings jsonb (Zod-validated §3.1 + §4.1),
                   live_code, live_screen_enabled, registration_open, max_registrations,
                   announcement (banner text), roster_version bigint (sequence for people/team/match changes),
                   started_at, locked_at, completed_at, cancelled_at
memberships        PK (tournament_id, user_id), role ('OWNER'|'CO_ADMIN'|'AUCTIONEER'), added_by, added_at
organiser_invites  id, tournament_id, email_or_username, role, token_hash, expires_at, created_by,
                   used_at, used_by, revoked_at
leaders            id, tournament_id, user_id (null until claimed), name, ign, phone, photo_url,
                   source ('ADDED_BY_ORGANISER'|'ORGANISER_KEY'|'PLAYER_ID_REQUEST'),
                   approval ('PENDING'|'APPROVED'|'REJECTED'), reject_reason,
                   purse_total, purse_remaining, link_version, invite_status
                   ('NOT_OPENED'|'OPENED'|'ACCOUNT_LINKED'|'TEAM_READY'), last_activity_at
teams              id, tournament_id, leader_id, name, short_name, color, secondary_color,
                   logo_url, emoji, motto, seed, sort_order                ← filled by the captain
players            id, tournament_id, user_id (null until claimed / for phone-less soldiers), name, ign,
                   phone, photo_url, source ('ADDED_BY_ORGANISER'|'ORGANISER_KEY'|'PLAYER_ID_REQUEST'),
                   link_version, invite_status ('NOT_OPENED'|'OPENED'|'ACCOUNT_LINKED'), base_price, status
                   ('PENDING_APPROVAL'|'REJECTED'|'POOL'|'ON_BLOCK'|'SOLD'|'UNSOLD'|'ALLOCATED'),
                   reject_reason, team_id, sold_price, acquired_via ('AUCTION'|'AUTO_ALLOCATED'), auction_order
password_resets    id, user_id, token_hash, created_by, expires_at, used_at
join_requests      id, tournament_id, from_user_id (organiser), to_user_id, role ('LEADER'|'PLAYER'),
                   purse (captains) | base_price (soldiers), status
                   ('PENDING'|'ACCEPTED'|'DECLINED'|'CANCELLED'|'EXPIRED'), expires_at, created_at, responded_at
organiser_blocks   PK (player_user_id, organiser_user_id), created_at   <- "Decline & block this organiser"
notifications      id bigserial, user_id, type, data jsonb, read_at, created_at   <- requests inbox, approvals, etc.
auction_state      tournament_id PK, current_player_id, current_bid, current_team_id, ends_at timestamptz,
                   next_at timestamptz (end of the break between soldiers), round, paused_remaining_ms,
                   controller_user_id, last_result jsonb,
                   version bigint                ← optimistic lock AND the real-time event sequence number
bids               id bigserial, tournament_id, player_id, team_id, amount, round, entered_by, created_at
processed_commands command_id PK, tournament_id, result jsonb, created_at   ← idempotency for auction commands
groups             id, tournament_id, name ('A','B',…), sort_order
group_teams        PK (group_id, team_id)
matches            id, tournament_id, match_number (null for byes), stage ('GROUP'|'KNOCKOUT'|'THIRD_PLACE'),
                   group_id, matchday, round, slot, team_a_id, team_b_id,
                   source_a jsonb, source_b jsonb   ({ type: 'GROUP_POS'|'WINNER_OF'|'LOSER_OF', ref }),
                   best_of, winner_team_id, next_match_id, next_slot, is_bye,
                   status ('SCHEDULED'|'LIVE'|'DONE'), scheduled_at
match_games        PK (match_id, game_no), map, kills_a, kills_b, winner_team_id
player_stats       PK (match_id, player_id), kills, deaths, mvp
audit_log          id bigserial, tournament_id, actor_user_id, action, before jsonb, after jsonb, reason, created_at
webhooks           id, tournament_id, kind ('DISCORD'|'GENERIC'), url_encrypted, signing_secret_encrypted,
                   events text[], enabled, consecutive_failures, created_by, created_at
webhook_deliveries id bigserial, webhook_id, event, payload jsonb, status, attempts, last_error, created_at
rate_limits        key PK, count, window_start          ← serverless-safe rate limiting
```

**Added in Phase 0** (in `src/server/db/schema.ts` and the first migration, beyond the list above):

- `players.acquired_via` also allows `RANDOM_SQUAD` (unsoldPolicy, §3.1) and `ADMIN_PICK` ("Assign", §3.3), for the badges in §7.6a.
- `players.last_activity_at` (row tracking applies to soldiers too, §2.2) and `bids.is_fallback` (§2.6 "entered by <organiser>").
- `group_teams.tournament_id` (a team is in at most one group) and `group_teams.pot` (draw ceremony replay).
- `auction_state.updated_at`, `matches.created_at/updated_at`, `tournaments.created_at`, `organiser_invites.created_at`, `password_resets.created_at`.
- Extra constraints: one `OWNER` row in `memberships` per tournament (kept in step with `tournaments.owner_id`); `players.team_id` is set exactly when the status is `SOLD` / `ALLOCATED`, and then `sold_price` and `acquired_via` are set; `match_games.kills_a <> kills_b` (tied games can't be saved); unique team short code per tournament; lowercase-hex check on team colours; `matches.stage = 'GROUP'` exactly when `group_id` is set; byes have no `match_number`; `best_of IN (1,3,5,7)`; organiser invites can't grant `OWNER`; organisers must have an email and an organiser key.
- `webhook_deliveries.status` is an enum `PENDING | SUCCEEDED | FAILED`.

**Profile snapshot:** when someone joins a tournament, their name / IGN / photo are **copied**
into `leaders` / `players`. Past tournaments keep the names as they were, and a profile change
only updates tournaments that haven't started.

**Constraints the database enforces** (Postgres can enforce more of the rules than the app):

| Rule | Constraint |
| ---- | ---------- |
| **One active tournament per organiser** | `CREATE UNIQUE INDEX ON tournaments (owner_id) WHERE status NOT IN ('COMPLETED','CANCELLED')` |
| Organiser key and Player ID unique | `UNIQUE (organiser_key)`, `UNIQUE (player_code)` on `users` |
| One pending request per player per tournament | `UNIQUE (tournament_id, to_user_id) WHERE status = 'PENDING'` on `join_requests` |
| Usernames unique, case-insensitive | `UNIQUE (lower(username))` |
| One captain / soldier record per account per tournament | `UNIQUE (tournament_id, user_id)` on `leaders` and on `players` (NULLs allowed for manual soldiers) |
| Unique team name, colour, captain | `UNIQUE (tournament_id, lower(name))`, `UNIQUE (tournament_id, color)` (stored lowercase hex), `UNIQUE (leader_id)` |
| Purse can't go negative | `CHECK (purse_remaining BETWEEN 0 AND purse_total)` |
| Prices non-negative | `CHECK (base_price >= 0)`, `CHECK (amount > 0)` |
| Match order unique | `UNIQUE (tournament_id, match_number)` |
| One auction state per tournament | `auction_state.tournament_id` is the primary key |

**Captain-and-soldier exclusion** (one user can't be both in a tournament) can't be a single
constraint across two tables. The join and claim services do it inside a transaction that starts with
`SELECT … FROM tournaments WHERE id = $1 FOR UPDATE`, so joins to one tournament happen one at a time.

### Access control

- The session (JWT in an httpOnly cookie) holds **only `userId`**. There is no "current
  tournament" in the session, because one user can be active in several tournaments at once.
- Every tournament route has `:tournamentId` in its path. `loadTournamentRole(userId,
  tournamentId)` resolves the user's role(s) in one query over `memberships`, `leaders` and
  `players`. Only **approved** captain and soldier rows count as roles (pending people see only
  their own "waiting for approval" card). Then `requireRole(...)` checks it against the §2.4 table.
  No role means 404.
- **Tenant isolation (§2.0):** no endpoint lists or searches users. The only cross-organiser read
  is `GET /api/players/by-code/:playerCode`, which returns the public card only and is rate-limited.
- **Real-time access:** browsers get an Ably token from `POST /api/realtime/token`, which
  runs the same role check and grants **subscribe-only** access to the channels of tournaments
  the user takes part in (§6).

### API (Next.js Route Handlers under `src/app/api/**/route.ts`)

Forms may call **Server Actions** instead of these routes. Both are thin wrappers over the
same functions in `src/server/services`, which hold all logic and authorisation.

| Method & path                                         | Who                | Purpose                                              |
| ----------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| `GET /api/tournaments/:id/auction`                    | Any participant    | **Snapshot**: auction state, `version`, `serverNow`, teams' MP and squads. Settles an expired lot first |
| `POST /api/tournaments/:id/auction/bids`              | Captain (own team); controlling auctioneer (fallback, with `teamId`) | Body `{ amount, expectedVersion, commandId }`. The server re-validates the amount (§3.2). 409 = outbid / stale |
| `POST /api/tournaments/:id/auction/commands`          | Controlling organiser | `{ type: 'next'|'sold'|'unsold'|'pause'|'resume'|'undo'|'take-control', expectedVersion, commandId }` |
| `POST /api/tournaments/:id/auction/tick`              | Any participant    | Idempotent nudge when a countdown (lot or break) reaches 0; settles whatever is due by `now()` (§6.2) |
| `POST /api/realtime/token`                            | Logged in, or a live-screen viewer with `liveCode` | Ably token request, subscribe-only, limited to my tournaments' channels |
| `GET/POST/PATCH/DELETE /api/tournaments/:id/webhooks[/:wid]` | Owner / Co-admin | Manage outgoing webhooks (§6.4) |
| `POST /api/tournaments/:id/webhooks/:wid/test`, `/deliveries/:did/redeliver` | Owner / Co-admin | Send a test event / resend a delivery |
| `GET /api/tournaments/:id/matches?view=list|tree&stage=&team=&status=` | **Any participant** | Match order (list) or the tree structure (groups → knockout, with placeholders) |
| `PATCH /api/tournaments/:id/matches/order`            | Owner / Co-admin   | Reorder unplayed matches within a stage              |
| `PATCH /api/tournaments/:id/matches/:mid`             | Owner / Co-admin   | Mark live, enter or edit results                     |
| `POST /api/tournaments/:id/cancel`                    | Owner              | Cancel the tournament (frees the active slot)        |
| `POST /api/auth/register`                             | Public             | Body `{ accountType: 'ORGANISER' or 'PLAYER', ..., organiserKey?, requestedRole? }`. Player + valid key also creates a pending captain/soldier row in that organiser's active tournament |
| `POST /api/auth/login`, `/logout`, `GET /api/auth/me` | –                  | Session                                              |
| `GET /api/auth/username-available?u=`                 | Public             | Live availability check (rate-limited)               |
| `GET /api/me/tournaments`                             | Logged in          | Every tournament I'm in, with my role(s)             |
| `POST/GET/PATCH /api/tournaments[/:id]`               | Owner / Co-admin   | Tournament CRUD + settings. Create returns **409** if the caller already owns an active tournament |
| `POST /api/tournaments/:id/people`                    | Owner / Co-admin   | Body `{ type: 'LEADER' or 'PLAYER', ... }` → captain or soldier, each with a personal link |
| `GET /api/tournaments/:id/leaders`, `/players?status=&approval=` | Any organiser | Separate lists                               |
| `PATCH/DELETE /api/tournaments/:id/leaders/:lid`, `/players/:pid` | Owner / Co-admin | Edit / remove                              |
| `GET /api/tournaments/:id/(leaders/:lid or players/:pid)/invite-link` | Owner / Co-admin | Personal share URL (captains **and** soldiers) |
| `POST …/invite-link/regenerate`                       | Owner / Co-admin   | Increment `link_version`; the old link dies          |
| `POST …/unlink`                                       | Owner / Co-admin   | Free a wrongly claimed spot (logged)                 |
| `POST /api/tournaments/:id/(leaders or players)/approve` | Owner / Co-admin | Bulk `{ ids, purse? or basePrice? }` for key sign-ups |
| `POST /api/tournaments/:id/(leaders/:lid or players/:pid)/reject` | Owner / Co-admin | With reason                              |
| `POST /api/tournaments/:id/(leaders/:lid or players/:pid)/switch-role` | Owner / Co-admin | Captain ⇄ soldier before Start      |
| `GET /api/invites/:token`                             | Public             | Decrypt → tournament + spot preview (captain or soldier) |
| `POST /api/invites/:token/claim`                      | Logged in          | Link my account to this spot (one-time)              |
| `GET /api/organiser-keys/:key`                        | Public             | Preview: organiser name, active tournament, registration open? (rate-limited) |
| `POST /api/organiser-keys/:key/join`                  | Logged-in player   | `{ role: 'LEADER' or 'PLAYER' }` → pending row in that organiser's active tournament |
| `POST /api/me/organiser-key/regenerate`               | Organiser          | New organiser key; the old one stops working         |
| `GET /api/players/by-code/:playerCode`                | Organiser with an active tournament | Public card only (photo, display name, IGN). Rate-limited |
| `POST /api/tournaments/:id/requests`                  | Owner / Co-admin   | `{ playerCode, role, purse? or basePrice? }` → request + live notification |
| `GET /api/tournaments/:id/requests`, `DELETE …/requests/:rid` | Owner / Co-admin | List outgoing requests / cancel a pending one |
| `GET /api/me/requests`                                | Logged-in player   | My incoming requests                                 |
| `POST /api/me/requests/:rid/accept`, `/decline`       | The invited player | `decline` takes `{ block?: true }`                   |
| `GET /api/me/notifications`, `POST …/read`            | Logged in          | Inbox + mark as read                                 |
| `PUT /api/tournaments/:id/my-team`                    | Captain            | Create / update my team (only before Start)          |
| `GET /api/tournaments/:id/taken-colours`              | Captain, organisers| For the colour picker                                |
| `PATCH /api/tournaments/:id/registration`             | Owner / Co-admin   | Open / close organiser-key sign-ups, max registrations |
| `PATCH /api/tournaments/:id/me`                       | Captain / Soldier  | Update my profile snapshot (before Start)            |
| `POST /api/tournaments/:id/participants/:userId/reset-password` | Owner / Co-admin | One-time reset link                        |
| `POST /api/password-resets/:token`                    | Public             | Set a new password                                   |
| `POST /api/tournaments/:id/start`                     | Owner / Co-admin   | `validateReadyToStart`, lock, close registration     |
| `GET /api/tournaments/:id/members`                    | Any organiser      | Organisers + pending invites                         |
| `POST /api/tournaments/:id/organiser-invites`         | Owner              | `{ emailOrUsername, role }` → link                   |
| `DELETE /api/organiser-invites/:id`                   | Owner              | Revoke                                               |
| `GET`/`POST /api/organiser-invites/:token[/accept]`   | Logged in          | View / accept                                        |
| `PATCH/DELETE /api/tournaments/:id/members/:userId`   | Owner              | Change role / remove                                 |
| `POST /api/tournaments/:id/transfer-ownership`        | Owner              | Hand ownership to a co-admin                         |

All token and code endpoints are rate-limited and return the same generic 404 for anything invalid.

---

## 6. Real-time architecture (Next.js on Vercel + Neon + Ably + webhooks)

**One Next.js app, no separate backend, no long-running server.** It runs entirely on
serverless functions. The two jobs a serverless function can't do are handled by managed
services: **Neon** (serverless Postgres) stores the state, and **Ably** (hosted pub/sub)
pushes live events to every browser. **Webhooks** send the same events to outside apps
such as Discord.

```text
 Captain phone ──(1) POST /auction/bids {expectedVersion} ──► Vercel Function (Route Handler)
                                                                │ (2) transaction on Neon:
                                                                │     lock auction_state row, validate, UPDATE, INSERT bid
                                                                │ (3) after COMMIT: publish event {version, serverNow} → Ably
                                                                │ (4) after(): POST to outgoing webhooks (Discord / generic)
                                                                ▼
 Every browser in the tournament ◄──── Ably channel t:<id>:auction (subscribe-only tokens) ────┘
 (captains, soldiers, organisers, big screen)        Discord channel ◄── webhook ──┘
```

### 6.1 Principles

- **The database is the single source of truth, and its clock is the only clock.**
  Every decision uses Postgres `now()`. Every response and event carries `serverNow`, and
  clients keep a smoothed offset from it to draw the countdown. **Never trust the client clock.**
- **Clients never publish to Ably.** Every intent (bid, sold, next, pause…) is an HTTP POST
  to a Route Handler. Ably only fans events out. The Ably API key never reaches the browser.
- **Publish after commit, never before.** If a publish fails, the database is still right,
  and clients catch up from a snapshot (§6.3).
- Route Handlers and Server Actions run on the **Node.js runtime** (argon2 and the Neon
  WebSocket pool need Node). Never Edge.

### 6.2 Auction mechanics without a server timer

- **Bid** (`POST /auction/bids`) runs in one Neon transaction:
  1. `SELECT * FROM auction_state WHERE tournament_id = $1 FOR UPDATE` (bids for one
     tournament are processed one at a time; other tournaments aren't affected).
  2. Settle the lot first if `ends_at <= now()` (see closing below), then reject the bid as "too late".
  3. Check `version = expectedVersion`; otherwise **409 "Outbid"**, and the client refreshes.
  4. Check `canTeamBid` (§3.2) on fresh rows, validate the amount (`>= nextValidBid`, `<= purse`),
     `UPDATE auction_state` (bid, team, `ends_at = greatest(ends_at, now() + timerReset)`,
     `version = version + 1`), then `INSERT INTO bids`.
  5. Commit → publish `bid.placed` with the new `version`.
- **Time-based steps** (lot ends → SOLD/UNSOLD; break ends → next soldier opens) need no background timer.
  The single function `settleDue(tournamentId)` applies whatever is due by `now()`:
  - **Client nudge, `POST /auction/tick`:** when any connected client's countdown (lot or break)
    reaches 0, it calls tick. `settleDue` runs inside the `FOR UPDATE` transaction, so **exactly
    one call wins** and the rest are no-ops. The console, the big screen and every phone all nudge,
    so steps happen within about a second. The reference build uses the same `/api/auction/tick` pattern.
  - **Lazy settle:** every auction read or write first calls `settleDue`, so state is right even if
    nobody nudged. It can apply several steps in a row (close, then open the next lot) and publishes
    each with its own `version`.
  - Optional later: an Upstash QStash delayed callback at `ends_at` / `next_at` as a backstop for an
    auction nobody is watching.
- **Selling, undo and allocation** (purse, soldier, state, audit log) each run in one transaction.
- **Idempotency:** each command carries a `commandId`. Its result is stored in
  `processed_commands`, so a double-tap or retry returns the first result instead of acting twice.
- **No server process to restart**, so nothing needs to pause on boot. Pause / resume stay
  manual organiser commands.

### 6.3 Ably channels, tokens and catching up

| Channel                 | Carries                                                                   | Who can subscribe |
| ----------------------- | ------------------------------------------------------------------------- | ----------------- |
| `t:<id>:auction`        | `lot.opened`, `bid.placed`, `lot.closed` (sold/unsold), `auction.paused/resumed`, `control.changed`, `allocation.step` | All participants; the big screen if enabled |
| `t:<id>:updates`        | `people.updated` (registration / approval / team ready), `groups.updated`, `match.updated`, `tournament.status` | All participants; the big screen if enabled |
| `t:<id>:presence`       | Ably **presence**: captains and organisers enter it, which drives the online dots | Captains and organisers (presence capability); others subscribe only |
| `u:<userId>`            | Personal inbox: `request.received`, `request.cancelled`, `approval.changed`, `notification.new` | Only that user |

- **Tokens:** the Ably SDK calls `POST /api/realtime/token` (`authUrl`). The handler checks the
  session and roles, then returns an Ably **TokenRequest** with a capability listing only that user's
  tournament channels (subscribe, plus presence where allowed), valid for 1 hour and auto-renewed.
  Live-screen viewers get a token for one tournament, and only while `live_screen_enabled`.
- **Event envelope:** `{ type, tournamentId, version, serverNow, data }`. Auction events use
  `auction_state.version`; `t:<id>:updates` events use `tournaments.roster_version`. Like the
  reference build's `version` / `rosterVersion`, there are two independent sequences, so roster
  changes never break the auction sequence.
- **Ordering and gaps:** different serverless instances may publish slightly out of order, so
  clients apply an auction event only if `version === local + 1`. Older events are ignored. On a
  gap they fetch `GET /auction` (a snapshot) and continue from there.
- **Snapshots** are fetched on first load, after every reconnect (Ably connection goes back to
  `connected`), and as a heartbeat if a live lot has had no event for 10 s.
- `t:<id>:updates` events just make the client call `router.refresh()` (Server Components
  re-render) or update the relevant Zustand slice.

### 6.4 Outgoing webhooks (share events with outside apps)

Browsers can't receive webhooks, so **Ably is for the website** and **webhooks are for
everything else**. The main example is a **Discord channel** where the whole group sees
"🔨 SOLD: Ravi → Red Rhinos for 120 MP" as it happens.

- Organisers add webhooks per tournament (Settings → Integrations):
  - **Discord:** paste a Discord channel webhook URL. Events are posted as embeds in the team's
    colour (player photo, price, MP left).
  - **Generic:** any `https` URL. It receives a JSON body with the headers `X-MPL-Event`,
    `X-MPL-Delivery` (unique id), `X-MPL-Timestamp`, and
    `X-MPL-Signature: sha256=HMAC(secret, timestamp + "." + body)`, so the receiver can check
    it's genuine and reject replays.
- **Events** (choose per webhook): `lot.opened`, `lot.sold`, `lot.unsold`, `bid.placed`
  (noisy, off by default), `auction.started/paused/resumed/completed`, `allocation.completed`,
  `groups.drawn`, `match.result`, `tournament.completed`.
- **Delivery:** after commit, through Next's `after()` so the bid response isn't slowed down.
  Up to 3 attempts with backoff, each logged in `webhook_deliveries` with a **Redeliver** button.
  A webhook is disabled automatically after 20 failures in a row, and the organisers are told.
- **Security:** webhook URLs (a Discord URL is effectively a password) and signing secrets are
  **encrypted at rest** (AES-256-GCM, `APP_ENCRYPTION_KEY`). Generic URLs must be `https` and
  must not resolve to private, loopback or link-local addresses (SSRF protection).

### 6.5 Event catalogue

| Source | Events |
| ------ | ------ |
| Ably `t:<id>:auction` | `lot.opened`, `bid.placed`, `lot.closed`, `auction.paused`, `auction.resumed`, `control.changed`, `allocation.step` |
| Ably `t:<id>:updates` | `people.updated`, `team.updated`, `groups.updated`, `match.updated`, `tournament.status` |
| Webhooks             | `lot.opened`, `lot.sold`, `lot.unsold`, `bid.placed`, `auction.*`, `allocation.completed`, `groups.drawn`, `match.result`, `tournament.completed` |

---

## 7. UI / UX: screens in detail

**Visual direction:** dark "tactical HUD" theme (charcoal / olive background, neon
accent), with **team colours as the main accent wherever a team appears**. Display font for
numbers (for example *Rajdhani* / *Oxanium*), clean sans for body text. Light mode is optional.
Mobile-first for captains and soldiers; desktop-first for organisers; 1080p for the big screen.

**Visual reference: the existing build at mpl-auction-blush.vercel.app** (§12). Reuse its look:
- near-black olive background with a faint camo blob pattern, and **lime neon** as the primary accent
  (with amber, gold, blood-red and sand as supporting colours)
- a **stencil display font** for headings and numbers, and Rajdhani-style body text
- cartoon **jetpack-soldier mascots** (inline SVG)
- pill status badges (`AUCTION COMPLETE` · `4 CAPTAINS` · `9 SOLDIERS`) and squad cards with a
  team-colour top bar, a points-spent bar, initials avatars and dashed **"Open slot"** placeholders
- military microcopy ("Report for duty", "Enlist", "Command post", "Rules of engagement",
  "Hold steady!") and a sound toggle in the header.

Define these as Tailwind theme tokens (`lime`, `amber`, `gold`, `blood`, `sand`, `muted`); never hex in components.

**Announcement banner:** organisers can post one line of text (for example "The match schedule will
be released by tomorrow. Stay connected!"). It shows on the tournament home, auction room,
dashboard and big screen, and updates live.

**Tournament home page** (`/t/[id]`, every participant; also public behind the `liveCode` if
enabled): status badges, the announcement banner, a hero with the tournament name, and
**"Rules of engagement" cards generated from the settings** (purse, squad size, opening bid,
raise, timer, what happens when nobody bids). Rules text is never hand-written, so it always
matches the real settings.

**App shell:** top bar with a **tournament switcher** (every tournament I'm in, with a role
badge) and the user menu (profile, change password, logout).

### 7.0 Auth pages

- **`/login`:** username + password, "show password", "Forgot password?" (players:
  "Ask your organiser to send you a reset link"; organisers: "Contact the site admin").
- **`/register` (player sign-up, the default):** two cards at the top, like the reference build:
  **"I'm a player"** (selected) and **"I'm organising a tournament"** (goes to `/register/organiser`).
  - Fields: name, Mini Militia IGN, username (live availability check), password, phone
    (optional), photo (optional, with crop).
  - **Organiser key (optional)**: a short field that auto-formats to `XXX-XXX` and also accepts
    `?key=` in the URL or a QR scan. When the key is valid, a card slides in: organiser avatar +
    "You're joining **Ravi's MPL Season 2**", plus a **Captain / Soldier** toggle with one-line
    explanations ("Gets points and bids for soldiers" / "Gets drafted into a squad"). Invalid key →
    "We couldn't find that key. Check it with your organiser, or leave it empty." Closed registration →
    "Ravi's tournament isn't taking sign-ups right now", and the player can still create the account.
  - The button text follows the state: **Enlist as soldier under Ravi** / **Enlist as captain under Ravi** /
    **Create account** (no key).
- **`/register/organiser`:** name, username, email, password + confirm with a strength meter →
  auto-login → dashboard with "Create your first tournament" and their **organiser key** card.
- **`/i/:token` (personal invite link, captain or soldier):** see §7.4.

### 7.1 Home / dashboard

- **Organisers:**
  - A large **"My active tournament"** card (status, number of captains and soldiers plus
    pending, next step, Resume button).
  - **"New tournament"** (with "Copy settings from…") is **disabled while one is active**, with the
    tooltip "Complete or cancel <name> first".
  - **Organiser key card**: the key in large stencil type (`RV7-K2P`), Copy, QR, a **WhatsApp
    message** template ("Join my Mini Militia tournament on MPL: <link>?key=RV7K2P"), and Regenerate.
  - Below that: **Organising for others** (co-admin / auctioneer roles), an **Archive** tab where
    cards show the champion's logo, and the pending organiser invites banner.
- **Players (captains / soldiers / free agents):**
  - **Player ID card** at the top: `#4K9QX7` with Copy and Share ("Send this to an organiser so they
    can invite you").
  - **Requests inbox** (also behind the bell icon with a badge): cards like "**Ravi** invites you
    to **MPL Season 2** as **Captain** · 50 MP purse" with **Accept / Decline** (and "Decline & block").
    New requests arrive live.
  - "My tournaments" cards with my role, my team (colour) and the next thing to do ("Set up your
    team", "Waiting for Ravi to approve you", "Auction starts soon", "Next match: Matchday 2").
  - **Join with a key** field (always visible). For free agents the empty state says "You're not in a
    tournament yet. Share your Player ID or enter an organiser's key."

### 7.2 Setup wizard (DRAFT): 5 steps with a progress rail and autosave

1. **Basics:** name, logo upload, date, venue / online, banner image.
2. **Rules:** every §3.1 and §4.1 setting with inline help. **Live preview** card:
   "6 captains × 4–6 players → you need 18–30 soldiers (19 approved, 4 pending).
   Total purse in play: 300 MP. 2 groups of 3 → 6 group matches → final."
   - Increment editor (flat raise or price bands).
3. **People:** a **"Bring people in"** bar with three buttons, one for each joining path (§2.3):
   - **Add person** (path A): a drawer with the **Type dropdown (Captain / Soldier)** first, then the
     fields for that type (purse for captains; base price for soldiers). "Save & add another" keeps
     the type. Every saved person gets a **personal link**.
   - **Share organiser key** (path B): the key card with Copy · WhatsApp · QR, the
     **Open / Closed** toggle, max registrations, and a live counter.
   - **Invite by Player ID** (path C): an input for `#XXXXXX`. When it matches, the public card
     (photo, display name, IGN) shows, then a Captain/Soldier choice with purse or base price and
     **Send request**. Unknown IDs show "No player with that ID".
   - **Captains tab** and **Soldiers tab**, each with filters **Approved · Pending · Requests sent
     · Rejected** and counts:
     - Approved rows: photo, name, IGN, source badge (*Link* / *Key* / *Request*), purse or base
       price, status chip (`Link not opened` grey / `Opened` amber / `Account linked` blue /
       captains: `Team ready` green with the team colour), and a **Share** menu (Copy link ·
       WhatsApp · QR · Regenerate · Unlink) on **both captain and soldier rows**.
     - Pending rows (key sign-ups): inline purse or base-price input, **Approve**, **Reject**,
       **Switch to soldier / captain**. Bulk approve uses one value for all selected. New sign-ups
       appear live with a highlight.
     - "Requests sent" rows: Player ID, card, role, sent time, expiry countdown, status
       (Pending / Accepted / Declined / Expired), and **Cancel**.
   - **CSV / Excel import** (captains and soldiers, each with a personal link) with column mapping and
     a validation preview.
   - Duplicate detection (same account / IGN / phone, across both tabs) highlighted.
   - Capacity meter: `approved soldiers / (captains × (min−1) … captains × (max−1))`.
4. **Teams (onboarding tracker):** one card per approved captain. Before setup it shows the
   captain's status and the Share button. After setup it shows a live preview of the team card as it
   will look on the big screen. Organisers can edit any team (typo or colour clash).
   "Send reminder" builds a WhatsApp message for everyone who hasn't finished.
5. **Review & Start:** checklist (§3.5), a summary, and the big **START TOURNAMENT**
   button. It opens a confirmation modal where you type the tournament name ("This locks rules,
   purses, base prices and teams, closes registration, and cancels pending requests").

### 7.3 Settings → Organisers (owner only)

- Member list: avatar, name, username, role dropdown, "added by", and a Remove button.
- **Invite organiser** form: email or username + role → link with Copy / WhatsApp buttons,
  shown in a pending list with the expiry countdown and a Revoke button.
- **Transfer ownership** in a danger zone (type the tournament name to confirm).
- **Participants → Reset password** action on any captain or soldier row (organisers only),
  shown as a one-time link with a Copy button.
- Throughout the app, actions the current role can't do are **hidden**, not merely disabled,
  except on the auction console, where a read-only state is shown with the reason.

### 7.4 Personal invite link (`/i/:token`, captain or soldier)

- Mobile-first. **Welcome card:** tournament name, logo, organiser, and "You've been invited as
  **Captain**" with your purse ("You start with 50 MP"), or "…as **Soldier**" with your base price.
- **Step 1, Account:** "Create account" (prefilled with what the organiser entered) or "I already
  have an account → Log in". Then the spot is **claimed**.
- **Step 2:**
  - **Captain → Team setup:**
    - Team name (unique, checked live), 3-letter short code (auto-suggested).
    - **Colour picker:** a curated palette; **colours taken by other teams are greyed out with
      that team's name** and update live. Custom hex comes with a contrast check and a "too
      similar to <team>" warning.
    - Logo upload or emoji, optional motto / battle cry.
    - **Live preview** of the team card and the big-screen banner.
  - **Soldier → Check your card:** photo and IGN as they'll appear on the auction card, editable.
- **Done screen:** "You're all set. On auction day, log in with **your username**." It shows an
  "Add to home screen" hint.
- Invalid, revoked or already-claimed link: a friendly message plus "Log in" / "Ask your organiser".

### 7.5 Soldier portal (per tournament)

- **Captains who joined with a key** see "Waiting for Ravi to approve you as captain", then the team
  setup page from §7.4 once approved.
- **Soldier status card**, which changes over time:
  `Waiting for approval` → `Approved · base price 5 MP` → **live:** "You're on the block!
  Current bid 8 MP (Red Rhinos)" → "You have been drafted to **Red Rhinos** (12 MP)" /
  "You are on the unsold list for now. The admin can still put you in a squad, so stay tuned." /
  `Auto-assigned to Blue Hawks`. It also shows my team's squad and colours, group fixtures,
  results, and my stats.

### 7.6 Auctioneer console (desktop)

- **Centre:** current soldier card (large photo, name, IGN, base price), the **current bid**
  in large digits, and the **leading team** shown as a coloured banner with its logo.
- **Countdown ring** that turns amber at 10s and red at 5s, with a tick sound in the last 5s.
- **Team strip** (one tile per team, in team colour): MP left, squad `4/6`, a **connection
  dot** (captain online / offline), and a fallback "Bid for them" button, greyed out with the
  reason shown (*Squad full* / *Can't afford*).
- **Controller banner:** "You're in control" or "<name> is running the auction · Take control".
- **Keyboard shortcuts:** `1–9` fallback bid for team N, `S` sold, `U` unsold, `Space`
  pause/resume, `N` next soldier, `Ctrl+Z` undo last sale. A cheat-sheet overlay opens with `?`.
- **Next soldier:** opens automatically after the break ("Next soldier in 2…"). The organiser can
  also pick from the pool or use a random **spin wheel**, which is skipped for auto-advance.
- **Side panel:** live bid history (fallback bids tagged), **waiting pool** with count, unsold list
  (each row has **Auction again** / **Assign** buttons), and the sold list.
- **Header controls:** `▶ Start new round` (disabled with a reason, for example "No soldiers in the pool. Use
  Auction again on unsold soldiers first"), Pause / Resume, and **Reset** (owner only, red, typed
  confirmation).
- **Undo last sale** asks for confirmation and a reason.

### 7.6a Command post (organiser roster panel)

Based on the reference build's admin page. It sits beside the console and is also its own page:

- **Registered (n)** table with search and **All · Captains · Soldiers** filters. Columns: avatar
  (initials on a coloured square), name, IGN · @username, role chip, squad / status (for example
  "Itemgaaran (21 MP)", "In pool", "Unsold", "Pending"), and row actions:
  - Captain rows: **Rename team**, **Share link**, **Delete** (before Start).
  - Soldier rows: **Release** (bought soldiers: refund and back to the pool), **Approve / Reject**
    (pending), **Delete** (before Start).
  - Changing role (captain ⇄ soldier) is allowed only before Start (§2.1).
- **Rules card**: the §3.1 settings as a compact form with **Save rules**. Before Start, changes apply
  at once. After Start, only the timer, break and `unsoldPolicy` can change; every other change
  goes through a logged admin override.
- **Squads grid**: one card per team with captain, MP left, a spent bar, members with price
  (and an *Auto* / *Random* / *Admin pick* badge), and "Open slot" placeholders.
- **Announcement** field with Post / Clear.

### 7.7 Big screen / projector (`/live/:liveCode`, no login)

- Full-screen, cinematic and read-only.
- New lot: the soldier card slides in with a spotlight effect.
- Each bid: an animated counter, the leading team colour floods the background, and the logo pulses.
- **SOLD:** a stamp slams onto the card, **confetti in the team colours**, a gavel sound, and the
  card flies into the team's column. **UNSOLD:** a grey stamp.
- Bottom ticker: last 5 sales, most expensive buy, MP-left leaderboard.
- Idle screen between lots: team squads grid. Sound on/off and "hide purses" toggles.

### 7.8 Captain bidding view (phone, the main way to bid)

- **Pre-auction lobby:** "Waiting for the auction to start", the connected captains, and a
  **connection test** (latency in ms).
- Header in team colours: team name, **MP left**, squad `3/6`.
- Current soldier card ("In-game: <IGN>"), **Current bid / Leading bid** with the leading team, and the
  countdown.
- A large **BID {nextAmount} MP** button (hold-to-confirm option), quick-raise chips (`+1 +2 +5`),
  and a **Custom bid amount** field (§3.2).
- When the captain can't bid, the button is disabled with the reason shown: "Not enough points for
  the next bid (n)", "Your squad is full", "Bidding is paused", "You hold the highest bid. Hold steady!"
- **Haptic vibration plus a toast when outbid**; a "You're winning" glow while leading.
- Status screens: "Auction starts soon", "The admin paused the auction. Hold your position.",
  "Next soldier in 2…", "Auction complete".
- Collapsible **Bid history** for the current soldier; **Your squad** shows bought soldiers and open slots.
- A connection-lost banner reconnects automatically and refreshes from a snapshot; bidding is
  disabled while offline.
- Tabs: My squad · Watchlist (star soldiers to get an alert when they come up) · All teams.

### 7.9 Teams overview

- One column per team: logo, colour, captain, soldiers (with price and an *Auto* badge for
  allocated soldiers), spent / remaining bar.
- **Export as image** (PNG) for WhatsApp / Instagram, plus a print view.

### 7.10 Allocation screen

- "Leftover soldiers: 3" → **Preview** → **Run allocation** with the animated step-by-step reveal
  and the reason shown for each pick → override → Confirm.

### 7.10a Matches hub: List ⇄ Tree (every participant)

One page, `/t/:id/matches`, opened from the main navigation by **anyone taking part in the
tournament**. A **segmented toggle `List | Tree`** sits at the top; the last choice is remembered
per device. A sticky **"Now playing / Up next"** banner shows the live match and the next one.

**List mode: the running order**
- One row per match, ordered by match number: `M7 · Group B · Matchday 2 · 🟥 RHN vs 🟦 HWK ·
  Bo1 · Scheduled 6:30 PM · status chip · score`.
- Placeholders where teams aren't decided yet ("Winner of M9" in muted italics).
- Stage separators (Group stage / Quarter-finals / Semi-finals / Final).
- Filters: **My team** (on by default for captains and soldiers), stage, group, status.
  Search by team name.
- Captains and soldiers see their own team's matches highlighted with the team colour.
- **Organisers:** drag handles to reorder unplayed matches within a stage, plus "Mark live",
  "Enter result" and a "Set time" inline. Other participants only see the list.
- Tap a match → match detail sheet: both squads, game-by-game results, MVP.

**Tree mode: the whole tournament as a structure**
- Left to right: **group cards** (mini standings, qualifying spots marked) → connector lines
  from each qualifying position (A1, B2 …) → **knockout rounds** → **Final** → champion.
- Shown from the moment groups are drawn, with placeholders, so everyone sees the path to the
  final straight away.
- Match number badges (`M13`) on each knockout node, so the tree and the list point to the same
  matches. The live match pulses, and finished matches show the score with the winner path in the
  team colour.
- **My team path** toggle highlights my team's route through the tree.
- Zoom and pan (pinch on mobile), "Fit to screen", and **Export as PNG** for WhatsApp.

Both views update live (`match:updated` → refresh) and come from the same data: the tree view
is `buildTournamentTree(groups, matches)`, a pure function in `src/lib/rules`.

### 7.11 Groups screen

- **Group draw ceremony:** pots on the left; logos are drawn one by one into Group cards
  with team-colour flashes and a drumroll sound.
- **Standings tables** (§4.3 columns). Qualification rows get a "Q" badge and a dashed
  cut-off line; rows animate when positions change.
- **Fixtures tab:** matches by matchday with a status chip. Organisers click a match to enter results.
- **Result modal:** game by game (map + kills A vs B). A tied game can't be saved
  ("replay required"). Optional per-soldier kills / deaths / MVP.
- "What does my team need?" helper, for example "Win the next match to qualify".
- When the last group match is done: a **Qualified!** reveal, then **Generate knockout**.

### 7.12 Knockout screen

- Seeding shown first (A1 v B2 …), then the tree animates in.
- **Tree view** (SVG/CSS): rounds as columns, connector lines, "BYE" slots, team colours,
  the winner path highlighted, zoom and pan on mobile.
- Click a match to open the result modal. **Champion screen:** trophy animation, squad photos,
  team-colour confetti.

### 7.13 Stats & extras

- Leaderboards: most kills, best K/D, MVP count, most expensive soldier, best-value buy
  (kills per MP).
- Tournament summary page you can share.
- **Audit log** viewer (filter by action / actor).
- PWA installable; it keeps working across flaky Wi-Fi by reconnecting with a snapshot.
- Accessibility: team colour is never the only signal (always show name or short code too);
  `prefers-reduced-motion` turns off confetti and flying animations.

---

## 8. Tech stack

**Decided: one full-stack Next.js app on Vercel, with no separate backend.** State lives in
**Neon PostgreSQL**, live events go out through **Ably**, and outside apps get **webhooks** (§6).

| Layer          | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Language       | TypeScript (strict) everywhere                                              |
| Framework      | **Next.js 16 (App Router)** + React 19, deployed on **Vercel** (Node.js runtime functions) |
| Reads          | Server Components (call services directly)                                  |
| Writes         | Server Actions for forms; Route Handlers for the auction API, public / token / code endpoints, CSV upload, webhooks admin and the matches API |
| Database       | **Neon PostgreSQL** via **Drizzle ORM** + `drizzle-kit` migrations; `@neondatabase/serverless` **Pool** (WebSocket) for transactions, HTTP driver for simple one-shot reads |
| Realtime       | **Ably** (pub/sub + presence): server publishes with the Ably REST SDK after commit; browsers subscribe with `ably` (React hooks) using token auth |
| Webhooks       | Outgoing Discord / generic HMAC-signed webhooks, sent with `after()` (§6.4)  |
| Styling / UI   | Tailwind CSS 4 + shadcn/ui (Radix), lucide-react icons, `next/font` (Oxanium / Rajdhani + Inter) |
| Animation      | Framer Motion, canvas-confetti, Howler.js (sounds)                          |
| Client state   | Zustand for the live auction store only; everything else comes from Server Components |
| Forms          | React Hook Form + Zod (`zodResolver`); the same schema is checked again on the server |
| Auth           | Built in: username + password (argon2), JWT (`jose`) in an httpOnly cookie. Captain link: AES-256-GCM (Node `crypto`). Invites / resets: random tokens stored as SHA-256 hashes |
| Route guard    | `proxy.ts` (Next 16's renamed middleware) only checks that the cookie exists and redirects to `/login`. **Real authorisation happens in services** |
| Files          | Vercel Blob (or Cloudinary) for photos and logos, never in the database      |
| Misc           | papaparse (CSV), qrcode.react, html-to-image (exports), pino (logs), Postgres-backed rate limiting |
| Tests          | Vitest: rules (pure), services on **PGlite** (in-process Postgres); concurrency tests on a real Postgres (Neon test branch or local Docker). Playwright e2e incl. simultaneous bids |
| Hosting        | Vercel + Neon + Ably, all with free tiers for development. **Region: Vercel functions in `sin1` (Singapore) with Neon in AWS `ap-southeast-1`.** The reference build already runs this way (Mumbai edge → Singapore function), which is close to players in India |

### Repository layout (single Next.js app)

```text
src/proxy.ts              cookie-presence redirect only
src/app/                  routes (App Router)
  (auth)/login, register, join, join/[token], reset/[token]
  (app)/dashboard, t/[id]/{setup, people, teams, auction, allocation, matches, groups, knockout, stats, settings}
  live/[liveCode]         public big screen
  api/**/route.ts         Route Handlers (§5)
src/server/               server-only ("import 'server-only'")
  db/schema.ts            Drizzle schema (tables, enums, constraints, partial unique indexes)
  db/client.ts            Neon Pool + HTTP clients, transaction helper
  auth/                   session, password hashing, captain-link crypto, tokens
  services/               ALL business logic + authorisation (auction, people, matches, …)
  realtime/               Ably publisher, channel names, token-request builder, event envelope
  webhooks/               signing, Discord formatter, delivery + retry, SSRF guard
drizzle/                  generated SQL migrations (committed)
src/lib/rules/            pure rule functions shared by client and server:
                          nextValidBid, canTeamBid, allocateLeftovers, validateReadyToStart,
                          generateGroups, generateRoundRobin, computeStandings, seedKnockout,
                          generateBracket, assignMatchOrder, buildTournamentTree, formatKey (organiser key / Player ID)
src/lib/schemas/          Zod schemas (forms, actions, route handlers, realtime event payloads)
src/lib/realtime/         client: Ably provider, version-gap handling, snapshot refetch, clock offset
src/components/, src/features/<feature>/   UI
scripts/                  operator scripts (e.g. user:reset-password)
```

The rules are **pure functions** in `src/lib/rules`, so services enforce them, the UI uses
the same functions to grey out buttons, and tests cover them without a DB. Never import
`src/server/**` from a Client Component.

### Neon / Ably / Vercel checklist

- Env vars (Vercel project settings; `.env.local` in dev; never committed; keep `.env.example` current):
  - `DATABASE_URL`: Neon **pooled** connection string (host contains `-pooler`), used by the app.
  - `DATABASE_URL_UNPOOLED`: direct connection, used only by `drizzle-kit` migrations.
  - `ABLY_API_KEY`: server only. Browsers get tokens, never the key.
  - `JWT_SECRET`, `INVITE_LINK_SECRET`, `APP_ENCRYPTION_KEY`: 32 random bytes each, base64.
    **Changing `INVITE_LINK_SECRET` breaks unclaimed personal links; changing
    `APP_ENCRYPTION_KEY` makes stored webhook URLs unreadable.**
  - `PUBLIC_APP_URL`: used to build invite and reset links.
- **Migrations:** `drizzle-kit generate` → review the SQL → `drizzle-kit migrate` (run during
  deploy against `DATABASE_URL_UNPOOLED`). Never edit the database by hand.
- **Neon branches:** use the Vercel–Neon integration so every preview deployment gets its own database
  branch, and use a throwaway branch for concurrency tests.
- **Cold starts:** Neon's free tier sleeps after about 5 minutes idle, and the first query then takes a
  few hundred ms. Open the auction console a few minutes before the auction (or use a paid plan with
  scale-to-zero turned off) so the first bid isn't slow.
- **Ably free tier** (millions of messages a month, around 200 concurrent connections; check current
  limits) is plenty for a tournament. One live auction is a few dozen connections.
- **Backups:** Neon keeps point-in-time history (restore to a moment before a mistake). Take a
  branch snapshot right before auction day.

---

## 9. Things that are easy to get wrong ("most important to catch")

1. **Simultaneous bids**: lock the `auction_state` row (`FOR UPDATE`) and check
   `expectedVersion` in the same transaction. Never use read-then-write outside a transaction.
2. **Client-side timers**: Postgres `now()` decides when a lot closes. Late bids are rejected.
3. **Double-click / double-sell**: every auction command carries a `commandId` stored in
   `processed_commands`. Debounce buttons too.
4. **Floats for money**: use `integer` columns and integers in TypeScript only.
5. **Unlocked settings after start**: lock them; any override goes through the audit log.
6. **Impossible allocation**: validate the capacity bounds *before* start (§3.5).
7. **Lot nobody closes**: there is no server timer. `/auction/tick` nudges plus lazy `settleDue` on every
   auction read and write must close expired lots. Test the case where nobody nudges.
8. **Captain acting for another team**: the server takes the team from the session's role
   in *that* tournament, never from the payload.
9. **Undo correctness**: undo must refund the purse, reset the soldier, and log it, all in one transaction.
10. **Bracket edits**: changing a finished match must cascade or block the downstream matches.
11. **Colour clashes**: enforce unique, distinguishable colours (unique constraint decides races),
    and always pair a colour with the name.
12. **Pooled vs direct URL**: the app uses the pooled Neon URL. Migrations use the direct one.
    Mixing them up causes connection exhaustion or migration failures.
13. **Personal links** (captains and soldiers): use AES-GCM over `{kind, id}`, a one-time claim,
    `link_version` for regeneration, rate limits, and the same 404 for every invalid token.
14. **Wrong tournament**: never keep a "current tournament" in the session; always resolve the role from
    `(userId, tournamentId)`. A user can be a captain in one live auction and an organiser in another.
15. **Key and Player ID guessing**: 6 characters from a ~30-character alphabet is about 700M
    combinations. Rate-limit the key and Player ID lookups per IP and per user (Postgres
    `rate_limits`), allow regenerating the organiser key, and keep key sign-ups **pending until
    approved**, so a leaked key can't put strangers into a squad.
16. **Registration after Start / pending people**: the server rejects joins and request accepts once
    `registration_open` is false, Start is blocked while any captain or soldier is pending, and
    Start expires pending requests in the same transaction.
17. **Duplicate roles**: `UNIQUE (tournament_id, user_id)` on `leaders` and `players`, plus the
    locked-transaction check that the same user isn't both captain and soldier. This applies to all
    three joining paths (a request accepted after a key sign-up must not create a second row).
17a. **Tenant leaks**: no list or search over `users`. Player ID lookup returns only the public card.
    Organisers only ever query through their own `tournament_id`. Pending people get no tournament
    data beyond their own card. Every service has a tenant-isolation test.
17b. **Request spam**: per-organiser daily limits, one pending request per player per tournament,
    and "Decline & block" stored in `organiser_blocks` and checked before sending.
18. **Password resets without email**: these are organiser-issued one-time links, limited to
    participants of that organiser's own tournaments.
19. **Profile edits rewriting history**: snapshot the profile into `leaders` / `players` at join time.
20. **Second active tournament**: the partial unique index on `tournaments(owner_id)` decides
    races, and the second request gets 409. No extra flag to keep in sync.
21. **Auth only in the proxy**: `proxy.ts` isn't a security boundary. Every Server Action and
    Route Handler must call a service that checks the role. Server Actions are public POST endpoints.
22. **Edge runtime by accident**: argon2 and the Neon Pool need Node. Never set `runtime = 'edge'`.
23. **Server code leaking to the client**: mark `src/server/**` with `import 'server-only'`.
24. **Publishing before commit**: publish to Ably and send webhooks only after the transaction
    commits; otherwise clients see a bid that was rolled back.
25. **Out-of-order events**: serverless instances publish in parallel. Clients must apply events by
    `version` and fetch a snapshot on gaps, never "last message wins".
26. **Leaking the Ably key or over-broad tokens**: the key stays on the server. Tokens are
    subscribe-only and limited to the user's tournaments. Clients never publish.
27. **Webhook abuse**: encrypt webhook URLs and secrets at rest, sign every delivery, block
    private-network targets (SSRF), and never let a slow or failing webhook delay or fail a bid.
28. **Long transactions**: keep auction transactions tiny (no network calls inside), because they
    hold the tournament's `auction_state` lock.
29. **PGlite for concurrency tests**: PGlite is a single connection and can't reproduce races. Use
    real Postgres for those.
30. **Match order drift**: the list and the tree must come from the same `matches` rows.
    Reordering changes only `match_number` within a stage and never moves a knockout match before
    the group stage ends.

---

## 10. Milestones

| #  | Milestone                                | Done when                                                                  |
| -- | ---------------------------------------- | -------------------------------------------------------------------------- |
| M0 | Scaffold                                 | Next.js 16 app on Vercel, Drizzle schema + first migration on Neon, Ably token endpoint + a test publish, lint/format/type-check/test scripts, health check |
| M1 | Shared rules + tests                     | All `src/lib/rules` functions at 100% branch coverage                      |
| M2 | Accounts + setup                         | Player and organiser sign-up, Player ID, organiser key, tournament switcher, organiser invites & roles, setup wizard, **three joining paths** (personal links for captains and soldiers, organiser key → approval, Player ID request → accept), requests inbox over Ably, tenant-isolation tests, password reset links, review & start |
| M3 | Auction with phone bidding               | Captain phone view + auctioneer console (controller lock) + big screen + soldier live status over Ably, DB-clock lots with nudge/lazy closing, sold/unsold/undo transactions, snapshots + version-gap recovery, presence dots, **concurrent-bid test on real Postgres**, fallback bids, **outgoing webhooks (Discord + generic)** |
| M4 | Allocation                               | Preview + animated run + override                                          |
| M5 | Groups + knockout + matches hub          | Group draw, round-robin fixtures, match order, **matches hub in List and Tree modes for all participants**, live standings with tie-breaks, knockout seeding, auto-advance, champion screen |
| M6 | Polish                                   | Stats, exports, PWA, sounds, reduced motion, audit viewer, webhook delivery log UI |

---

## 11. Decisions log & open questions

| #  | Question                                   | Decision                                                                |
| -- | ------------------------------------------ | ----------------------------------------------------------------------- |
| 1  | Money unit                                 | **Militia Points (MP)**, whole numbers                                  |
| 2  | Does the captain take a squad slot?        | **Yes, always**; captains are never auctioned                           |
| 3  | Leftover allocation tie-break              | Fewest players → **lowest MP left** → team order                        |
| 4  | Re-auction price                           | Organiser sets `reauctionPricePercent` per tournament                   |
| 5  | Player categories                          | **None**, only Captains and Soldiers                                    |
| 6  | Match format                               | **Groups, then knockout**; 3rd-place match optional                     |
| 7  | One or many tournaments                    | **Many**, run at the same time, kept as history; settings can be copied |
| 8  | Bidding                                    | **Phones from day one**; auctioneer fallback bids                       |
| 9  | Captain / soldier access                   | **Everyone has a username + password account.** Joining is through the three paths in decision 21. (Replaces the earlier PIN idea and the per-tournament invitation code.) |
| –  | Co-admins                                  | **Yes**: Owner / Co-admin / Auctioneer roles per tournament             |
| 10 | Email service?                             | **No.** Share-links only; organiser lock-outs go through the operator script |
| 11 | Tournaments per organiser                  | **One active** (not completed or cancelled) per owner, enforced by a partial unique index |
| 12 | Match order visibility                     | Running order in **List and Tree** modes, visible to **every participant** |
| 13 | Framework                                  | **Next.js only**, no separate backend, deployed on **Vercel** (replaces the earlier custom Socket.IO server) |
| 14 | Database                                   | **Neon PostgreSQL** with Drizzle ORM (replaces MongoDB Atlas)           |
| 15 | Real-time to browsers                      | **Ably** pub/sub + presence; clients only subscribe, all actions are HTTP. *(Read from "apify"; Apify is a scraping platform and can't push events to browsers.)* |
| 16 | Webhooks                                   | **Outgoing** webhooks share auction events with outside apps: Discord + generic HMAC-signed |
| 17 | Auction feel                               | Follow the reference build: small purse (50 MP), opening bid 1, +1 raise, **custom bids allowed**, 60 s clock that **every bid restarts**, 2 s break, then auto-advance |
| 18 | When nobody bids                           | `unsoldPolicy` setting. Default is our rule (re-auction, then fewest-players allocation); the reference build's "random squad" and "admin decides" are also available |
| 19 | Multiple organisers                        | **Multi-tenant**: unrelated organisers each have their own captains and soldiers and never see each other's (§2.0) |
| 20 | Personal links                             | Organisers can add **captains and soldiers**, and **both** get a personal share link (reverses "links only for captains") |
| 21 | How players get under an organiser         | A. personal link (pre-approved) · B. **organiser key**, a simple 6-character key per organiser pointing to their active tournament; the player picks captain/soldier and the organiser approves · C. **Player ID request**, which the organiser sends and the player accepts |
| 22 | Sign-up without a key                      | Allowed: the player becomes a **free agent** under no organiser, with a public Player ID organisers can invite |

---

## 12. Reference build: mpl-auction-blush.vercel.app (reviewed 2026-11-21)

An earlier single-tournament version of this app. I reviewed its public pages, the admin
"Command post" (logged in with the admin password you gave me) and the auction room. The
auction had already **completed**, so the live bidding screen wasn't visible. I didn't click
anything that changes data (no Start, Reset, Release, Delete or Save), so its labels and API
shapes were read from the page's own network traffic and JavaScript.

**What it does, which confirms our design:**

| Area | Reference build | Our plan |
| ---- | --------------- | -------- |
| Hosting | Next.js on Vercel (Mumbai edge → Singapore function) | Same, region `sin1` (§8) |
| Real-time | **Ably**, a subscribe-only token from `/api/realtime/token` on one channel `mpl-auction` | Ably, subscribe-only, **one channel set per tournament** (§6.3) |
| Snapshot | `GET /api/state` → `serverTime`, `version`, `rosterVersion`, `endsAt`, `nextAt`, `pausedRemainingMs`, `lastResult`, teams with `spent` / `pointsLeft`, pool, unsold | `GET /auction`, same fields (§6.3) |
| Writes | `POST /api/auction/bid`, `POST /api/admin/control`, `POST /api/admin/settings` | `auction/bids`, `auction/commands`, settings actions |
| Lot closing | `POST /api/auction/tick` nudged by clients | `POST /auction/tick` + lazy `settleDue` (§6.2) |
| Rules | 50 points, 4 soldiers (captain not counted), opening bid 1, min raise 1, 60 s timer reset on every bid, 2 s break, random order, unsold → "admin decides" or "random squad" | Same defaults (§3.1), plus our allocation rule |
| Admin tools | Start new round, Reset, Rename team, Make soldier / captain, Release, Delete, Auction again, Admin pick, Save rules, announcement banner, sound toggle | All adopted, with roles and audit (§3.3, §7.6a) |

**Where we deliberately differ:**

- **One shared admin password** → real organiser accounts with Owner / Co-admin / Auctioneer roles (§2.4).
- **One global tournament** → many tournaments, one active per organiser (§1).
- **Open sign-up where anyone picks Captain** → the player still picks captain or soldier, but only
  with an organiser's key and with the organiser's approval, or through a personal link or Player ID
  request (§2.3). Sign-ups without a key are free agents, not captains.
- **Rules editable during the auction** ("points left are recalculated straight away") → locked
  at Start, with logged overrides only (§1).
- No groups, fixtures or bracket yet ("match schedule released tomorrow") → generated groups,
  knockout and a matches hub (§4, §7.10a).
- No Discord or webhook sharing → outgoing webhooks (§6.4).

**Not checked:** the live bidding screen and the admin controls' behaviour, since that would have
meant starting a new round on a live site. A test copy of the build (or a short screen recording
of a live round) would fill that gap.


---

## 13. Parallel build plan (3 Claude sessions)

The build runs in **four phases**. Only the middle phase is parallel:

```text
Phase 0  Foundation      Claude 1 alone, in the main folder        → git tag `foundation`
Phase 1  Three lanes     Claude A, B, C at the same time, each in its own git worktree + branch + Neon branch
         Lane A  Identity, people & setup        (branch lane/a)
         Lane B  Auction, allocation, webhooks   (branch lane/b)
         Lane C  Format, matches & public pages  (branch lane/c)
         ── every lane stops at its STOP marker ──
Phase 2  Integration     one Claude, in the main folder, after all three lanes stopped
```

Phase 0 has to come first. It creates the things all three lanes share: the Next.js app, every
database table, the shared types, login/role checks, live-update plumbing, the theme and test
data. Without it, three sessions would each build their own app and the branches couldn't be merged.

### 13.1 Rules every lane follows

1. **Work only in the files your lane owns** (§13.2). Read anything, but write only your own files.
2. **Don't edit shared files**: `package.json` / lockfile, `drizzle/**`, `src/server/db/schema.ts`,
   `src/lib/schemas/**` (contracts), `src/app/layout.tsx` and the app shell, `CLAUDE.md`, `PLAN.md`.
   If you need a change there (a column, a dependency, a contract field), write it under
   **Integration notes** in your `docs/lanes/LANE-X.md` and work around it for now.
3. **Phase 0 stubs are the seams between lanes.** Lane A calls `initializeAuction()` (Lane B fills
   it in). Lane B ends allocation by setting `GROUP_DRAW` (Lane C picks it up from there). Keep each
   stub's signature exactly as written. If a signature must change, add an integration note.
4. **Your own database:** each lane uses its own Neon branch (`lane-a`, `lane-b`, `lane-c`) in its
   own `.env.local`. Use `npm run db:seed -- --stage=<stage>` to get the data you need, and log in as
   seeded users through the dev-only `/dev/login-as`.
5. **Your own port:** Lane A `3001`, Lane B `3002`, Lane C `3003` (`npm run dev -- -p 300X`).
6. Commit after every task (Conventional Commits). Tick the task in your `docs/lanes/LANE-X.md`
   (not in this file, to avoid merge conflicts).
7. **At STOP:** run `npm run lint && npm run type-check && npm test`, write the handoff in your lane
   file (what's done, what's not, integration notes, suggested CLAUDE.md lines), commit, and **stop**.
   Don't merge, don't rebase onto other lanes, and don't start integration work.

### 13.2 Who owns what

| Area | Phase 0 (shared, frozen) | Lane A | Lane B | Lane C |
| ---- | ------------------------ | ------ | ------ | ------ |
| Rules `src/lib/rules/` | `index.ts` signatures + types | `formatKey`, `validateReadyToStart` | `nextValidBid`, `canTeamBid`, `allocateLeftovers`, `unsoldPolicy`, timer math | `generateGroups`, `generateRoundRobin`, `computeStandings`, `seedKnockout`, `generateBracket`, `assignMatchOrder`, `buildTournamentTree` |
| Services `src/server/services/` | `roles.ts`, stubs | `accounts/`, `tournaments/`, `organisers/`, `people/`, `joining/`, `notifications/`, `passwords/`, `start/` | `auction/`, `allocation/`, `webhooks/` | `format/`, `matches/`, `announcements/`, `stats/` |
| API `src/app/api/` | `health`, `realtime/token`, `dev/*` | `auth`, `me`, `tournaments/[id]/(people, leaders, players, requests, registration, members, start, my-team, …)`, `invites`, `organiser-keys`, `players/by-code`, `password-resets`, `organiser-invites` | `tournaments/[id]/(auction, webhooks)` | `tournaments/[id]/(matches, groups, announcement, stats)` |
| Pages `src/app/` | root layout, app shell, `/dev` | `(auth)/*`, `/i/[token]`, `(app)/dashboard`, `t/[id]/(setup, people, teams, settings)` | `t/[id]/(auction, command-post, allocation)`, the auction part of `live/[liveCode]` | `t/[id]` (home), `t/[id]/(matches, groups, knockout, teams-overview, stats, audit)`, the non-auction parts of `live/[liveCode]` |
| Components | `src/components/ui/**`, mascots, shell | `src/features/identity/**` | `src/features/auction/**`, `src/features/webhooks/**` | `src/features/format/**`, `src/features/public/**` |
| Client realtime | provider + `useChannel` | uses it (inbox) | `src/features/auction/realtime/**` (store, gap handling, tick) | uses it (match updates) |
| Tests | helpers, PGlite `createTestDb` | next to its files | next to its files + `tests/concurrency/**` | next to its files |
| E2E `e2e/` | config | `e2e/identity/**` | `e2e/auction/**` | `e2e/format/**` |

### 13.3 Phase 0: Foundation (Claude 1, alone, in the main folder)

- [x] `git init`, branch `main`, `.gitignore` (`node_modules`, `.next`, `.env*` except `.env.example`). Commit the current `PLAN.md` and `CLAUDE.md`.
- [x] Scaffold **Next.js 16** (App Router, TypeScript strict, `src/`, Tailwind 4, ESLint) plus Prettier, with the `@/` alias.
- [x] **Install every dependency in §8 up front** (Drizzle, `@neondatabase/serverless`, `drizzle-kit`, `@electric-sql/pglite`, `ably`, `jose`, `@node-rs/argon2`, `zod`, `react-hook-form`, `@hookform/resolvers`, `zustand`, `framer-motion`, `canvas-confetti`, `howler`, `papaparse`, `qrcode.react`, `html-to-image`, `pino`, `server-only`, shadcn/ui deps, `lucide-react`, `clsx`, `tailwind-merge`, Vitest, Testing Library, Playwright), so lanes never need to touch `package.json`.
- [x] Scripts: `dev`, `build`, `start`, `lint`, `format`, `type-check`, `test`, `test:concurrency`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `verify` (lint + type-check + test + build).
- [x] Vitest (node for server code, jsdom for components), the `createTestDb()` helper (PGlite + all migrations applied), and the Playwright config.
- [x] **Complete Drizzle schema from §5**: every table, enum, check, foreign key and partial unique index. First migration generated and committed. `db/client.ts` (Neon Pool + HTTP) and a `withTransaction(fn)` helper.
- [x] `src/server/env.ts` (Zod-validated env vars) and `.env.example`.
- [x] **Contracts** in `src/lib/schemas/`: tournament settings with defaults (§3.1, §4.1), the real-time event envelope plus every event type (§6.5), auction API payloads, and the shared domain types. `src/lib/money.ts`.
- [x] `src/lib/rules/index.ts`: **typed signatures for every rule function**, each throwing `NotImplemented`, with JSDoc pointing to the PLAN section.
- [x] **Cross-lane stubs** with final signatures: `initializeAuction(tx, tournamentId)` (filled in by B) and `startGroupDraw(tx, tournamentId)` (filled in by C).
- [x] **Auth primitives**: argon2 hash/verify, JWT session cookie (`getSessionUserId`, `setSession`, `clearSession`), `proxy.ts` cookie redirect, `loadTournamentRole` + the §2.4 permission table + `requireRole` (implemented and tested), error helpers (404 / 409, unique-violation → 409), and the Postgres rate-limit helper.
- [x] **Real-time base**: server `publish(channel, event)` (records instead of sending in tests), channel-name helpers (`t:<id>:auction`, `t:<id>:updates`, `t:<id>:presence`, `u:<userId>`), `POST /api/realtime/token` with the capability builder, and the client `<RealtimeProvider>` + `useChannel(name, handler)`.
- [x] **Design base** (from §7 and §12): Tailwind tokens (`lime`, `amber`, `gold`, `blood`, `sand`, `muted`, backgrounds), fonts through `next/font` (stencil display + Rajdhani-style body), shadcn/ui base components (button, input, card, dialog, dropdown, tabs, table, badge, toast, sheet), `cn()`, the jetpack-soldier mascot SVG component, and the app shell (top bar, tournament-switcher placeholder, sound toggle, announcement-banner slot).
- [x] **Test data**: `npm run db:seed -- --stage=draft|ready|auction|allocated|groups|knockout` creates **two unrelated organisers**, each with a tournament at that stage, captains with teams and soldiers, all with password `password123`. Add `/dev/login-as?username=`, which only exists when `NODE_ENV !== 'production'`.
- [x] `GET /api/health` (database ping).
- [x] Empty folders with a one-line `README.md` for each lane's owned paths (§13.2), and `docs/lanes/LANE-A.md`, `LANE-B.md`, `LANE-C.md` from a template (Checklist · Progress · Decisions · Integration notes · Suggested CLAUDE.md updates · Handoff).
- [x] `npm run verify` passes. Commit `chore: foundation`, then run `git tag foundation`.
- [x] **STOP. Phase 0 done.** The user now creates the three worktrees (§13.7).

### 13.4 Lane A: Identity, people & setup (branch `lane/a`, port 3001, Neon branch `lane-a`)

Plan sections: §1, §2 (all), §3.5, §5 (identity tables + API), §7.0–7.5.

- [ ] **A1 Accounts.** Player sign-up `/register` with the optional organiser key, the live tournament preview and the Captain/Soldier toggle. Organiser sign-up `/register/organiser`. Login and logout. Username availability. Generating Player IDs and organiser keys (`formatKey`). Change password.
- [ ] **A2 Tournaments.** Create, enforcing one active tournament per organiser (409). Settings form (Rules step). "Copy settings from…". Cancel. Organiser and player dashboards. Tournament switcher.
- [ ] **A3 Organiser team.** Memberships, organiser invite links (create, accept, revoke), changing role or removing a member, transferring ownership, and the Settings → Organisers page.
- [ ] **A4 Path A: personal links.** The "Add person" drawer (Captain/Soldier). Token encryption and decryption, `/i/[token]` (register or log in, then claim), regenerate, unlink, status chips, Share menu (Copy · WhatsApp · QR) on both captain and soldier rows, and CSV import.
- [ ] **A5 Path B: organiser key.** Joining with a key at sign-up and from the dashboard. Pending captain and soldier rows. Approve (purse or base price, bulk too), reject, switch role. Registration open/closed and the max-registrations setting. The key card with QR and WhatsApp text, and regenerate.
- [ ] **A6 Path C: Player ID requests.** Public-card lookup, send and cancel requests, the requests inbox, accept / decline / block, expiry, rate limits, `notifications`, and live `u:<userId>` events with the bell badge.
- [ ] **A7 Captain team setup and Teams tracker.** Team name and short code, the colour picker (taken colours greyed out live, contrast check, too-similar warning), logo or emoji, motto, live card preview, and the onboarding board with "Send reminder".
- [ ] **A8 Password resets.** Organiser-issued one-time links for participants, and the `user:reset-password` operator script.
- [ ] **A9 Review & Start.** `validateReadyToStart`, the checklist UI with "Fix" links, and the Start transaction: lock settings, close registration, expire pending requests, set the status, and **call the `initializeAuction` stub**.
- [ ] **A10 Tests.** Unit and service tests, a **tenant-isolation test for every Lane A service** (organiser A on B's tournament → 404), and e2e `e2e/identity/**` (organiser creates a tournament, brings people in by all three paths, captain sets up a team, Start).
- [ ] **STOP: Lane A.** Run the checks, write the handoff in `docs/lanes/LANE-A.md`, commit, and stop.

### 13.5 Lane B: Auction, allocation, real-time & webhooks (branch `lane/b`, port 3002, Neon branch `lane-b`)

Plan sections: §2.6, §3.1–3.4, §6 (all), §7.6–7.10, §9 items 1–9 and 24–29, §12.

- [ ] **B1 Rules.** `nextValidBid` (flat raise and price bands), `canTeamBid` (returns the reason), custom-bid bounds, timer and break math, `allocateLeftovers`, and `unsoldPolicy` handling. **100% branch coverage.**
- [ ] **B2 `initializeAuction`.** Fill in the Phase 0 stub: create `auction_state`, the random pool order and starting purses.
- [ ] **B3 Auction service.** `settleDue` (lot expiry and break expiry), bids (`FOR UPDATE`, `expectedVersion`, custom amounts), commands (next / sold / unsold / pause / resume / undo / take control / start new round), release, auction again, assign, reset, `processed_commands` idempotency, audit log, and **publishing only after commit**.
- [ ] **B4 Endpoints.** `GET …/auction` (snapshot), `POST …/auction/bids`, `…/commands`, `…/tick`.
- [ ] **B5 Client auction state.** Zustand store, version-gap detection with snapshot refetch, server clock offset, a 10 s heartbeat, tick nudges when a countdown reaches 0, and Ably presence (online dots).
- [ ] **B6 Screens.** Auctioneer console with the controller lock and keyboard shortcuts. Command post (roster with Release / Auction again / Assign, Rules card, squads grid). Captain phone bidding view (quick-raise chips, custom amount, reasons, haptics). Soldier live status card component. Big-screen auction view. Sounds and confetti.
- [ ] **B7 Allocation.** Preview, the animated step-by-step run, override, confirm, then set the status to `GROUP_DRAW`.
- [ ] **B8 Webhooks.** Settings → Integrations UI, encrypted URL and secret, HMAC signing, the Discord embed formatter, the SSRF guard, delivery with `after()` and retries, the delivery log, redeliver, test event, and auto-disable.
- [ ] **B9 Tests.** Unit and service tests (PGlite). A **concurrency test on real Postgres** (Neon `lane-b` branch or Docker): 20 simultaneous bids, so exactly one winner per version, a purse that never goes negative and no double sale. Tenant-isolation tests. E2E `e2e/auction/**` with two captain browsers bidding against each other.
- [ ] **STOP: Lane B.** Run the checks, write the handoff in `docs/lanes/LANE-B.md`, commit, and stop.

### 13.6 Lane C: Format, matches & public pages (branch `lane/c`, port 3003, Neon branch `lane-c`)

Plan sections: §4 (all), §7 (visual direction, announcement, tournament home), §7.10a–7.13, §12.

- [ ] **C1 Rules.** `generateGroups`, `generateRoundRobin`, `computeStandings` (every tie-break), `seedKnockout`, `generateBracket`, `assignMatchOrder` and `buildTournamentTree`, including the small-tournament cases (2 teams, 3–5 teams). **100% branch coverage.**
- [ ] **C2 Group draw.** Fill in the `startGroupDraw` stub. Pots, random or manual draw, the ceremony UI, fixture and match-number generation, then set the status to `GROUP_STAGE`.
- [ ] **C3 Results and progression.** Per-game result modal (a tied game can't be saved), mark live, per-soldier stats, reordering within a stage, Generate knockout, knockout auto-advance, safe cascading when an earlier result is edited, then `KNOCKOUT` → `COMPLETED` and the champion screen.
- [ ] **C4 Matches hub** `/t/[id]/matches`. List and Tree toggle, "Now playing / Up next", My-team filter and path highlight, placeholders, PNG export, live updates, and 404 for anyone outside the tournament.
- [ ] **C5 Groups and knockout screens.** Standings with the Q badge and cut-off line, fixtures by matchday, and the knockout tree with zoom and pan.
- [ ] **C6 Tournament home and announcements.** `/t/[id]` with status badges, the hero section, **Rules of engagement generated from the settings**, and the announcement banner service (post / clear, live). Also the non-auction big-screen views (groups, bracket, champion).
- [ ] **C7 Extras.** Teams overview with image export, stats leaderboards, the audit-log viewer, the PWA manifest and offline shell, and reduced-motion support.
- [ ] **C8 Tests.** Unit and service tests, tenant-isolation tests, and e2e `e2e/format/**` (seed `--stage=allocated` → draw → results → knockout → champion).
- [ ] **STOP: Lane C.** Run the checks, write the handoff in `docs/lanes/LANE-C.md`, commit, and stop.

### 13.7 Running the lanes (what the user does)

1. Run Phase 0 with Claude 1 in the main folder (prompt below). Wait for the `foundation` tag.
2. In Neon, create the branches `lane-a`, `lane-b` and `lane-c` from `main`.
3. Create the worktrees:

   ```bash
   cd "C:/Users/Soft Suave/Documents/Oraclle/mpl"
   git worktree add ../mpl-lane-a -b lane/a foundation
   git worktree add ../mpl-lane-b -b lane/b foundation
   git worktree add ../mpl-lane-c -b lane/c foundation
   ```

4. In each worktree: copy `.env.local` and set `DATABASE_URL` / `DATABASE_URL_UNPOOLED` to that
   lane's Neon branch, then run `npm install` and `npm run db:migrate`.
5. Open three terminals, `cd` into `mpl-lane-a`, `mpl-lane-b` and `mpl-lane-c`, run `claude` in
   each, and paste that lane's prompt.
6. Each lane stops by itself at its STOP marker. When all three have stopped, open one Claude in the
   main folder and paste the integration prompt.

### 13.8 Phase 2: Integration (one Claude, in the main folder, after all three lanes stopped)

- [ ] **I1** Read all three `docs/lanes/LANE-*.md` handoffs. Merge `lane/a`, then `lane/b`, then `lane/c` into `main` (merge commits), resolving conflicts.
- [ ] **I2** Apply every integration note: schema changes as **one new migration**, new dependencies, and contract changes in `src/lib/schemas`.
- [ ] **I3** Wire the lanes together: Start → `initializeAuction` → auction → allocation → `GROUP_DRAW` → `startGroupDraw`. Add role-based navigation in the app shell. Link the dashboard cards to the auction, matches and home pages. Reuse Lane A's people components inside Lane B's command post where they overlap. Show the soldier live status card (B) on the soldier portal (A).
- [ ] **I4** Make sure `/dev/*` and the seed script can't run in production.
- [ ] **I5** **Full-journey e2e:** two unrelated organisers at the same time → people join through all three paths → Start → live auction with simultaneous bids → allocation → groups → knockout → champion. Plus a **tenant-isolation sweep** over every route.
- [ ] **I6** `npm run verify` passes, and `npm run test:concurrency` passes against a real Neon branch.
- [ ] **I7** Update `CLAUDE.md` (status table, real commands, gotchas from the lane notes) and fix any drift in `PLAN.md`.
- [ ] **I8** Deploy: Vercel project (functions in `sin1`), Neon production (`ap-southeast-1`), Ably key, environment variables, migrate, then smoke-test on two phones and the big screen.
- [ ] **I9** Remove the worktrees (`git worktree remove ../mpl-lane-a` and so on) once everything is merged.

### 13.9 Prompts

**Phase 0 (Claude 1, main folder):**

```text
You are doing Phase 0 (Foundation) of PLAN.md §13 for this repo, alone. Three other Claude sessions
will build lanes A, B and C on top of your work in parallel, so everything they share must be done
by you and must be stable: app scaffold, all dependencies, the complete Drizzle schema from §5 with
its first migration, contracts in src/lib/schemas, rule signatures in src/lib/rules/index.ts,
the cross-lane stubs, auth primitives + loadTournamentRole/requireRole, the real-time base, the
design base, the staged seed script with two unrelated organisers, /dev/login-as, and the
docs/lanes templates. Read CLAUDE.md and PLAN.md first (§5, §6, §8, §12, §13). Work through the
§13.3 checklist in order, committing as you go. Don't build any lane feature beyond the stubs.
Finish with `npm run verify` passing, a `chore: foundation` commit and the git tag `foundation`,
then stop and tell me it's ready for worktrees. If Neon or Ably credentials are missing, use
PGlite and placeholders, and list exactly what I need to fill in.
```

**Lane A (terminal in `mpl-lane-a`):**

```text
You are Lane A (Identity, people & setup) of 3 Claude sessions working in parallel on PLAN.md §13.
You are on branch lane/a in your own git worktree, with your own Neon branch and port 3001.
Read CLAUDE.md, then PLAN.md §13.1, §13.2 and §13.4, and every section §13.4 lists.
Work through tasks A1 to A10 in order. Write only files that §13.2 gives to Lane A. Never edit
shared files; put any needed shared change in docs/lanes/LANE-A.md under "Integration notes" and
work around it. Use `npm run db:seed -- --stage=...` and /dev/login-as for test data. Commit after
each task and tick it in docs/lanes/LANE-A.md. When you reach "STOP: Lane A": run lint,
type-check and tests, write the handoff in docs/lanes/LANE-A.md, commit, and stop. Don't merge
and don't start integration work.
```

**Lane B (terminal in `mpl-lane-b`):**

```text
You are Lane B (Auction, allocation, real-time & webhooks) of 3 Claude sessions working in
parallel on PLAN.md §13. You are on branch lane/b in your own git worktree, with your own Neon
branch and port 3002. Read CLAUDE.md, then PLAN.md §13.1, §13.2 and §13.5, and every section
§13.5 lists. Work through tasks B1 to B9 in order. Write only files that §13.2 gives to Lane B.
Never edit shared files; put any needed shared change in docs/lanes/LANE-B.md under "Integration
notes" and work around it. Use `npm run db:seed -- --stage=ready` or `--stage=auction` and
/dev/login-as to act as organisers and captains. The concurrency test must run against real
Postgres (my Neon lane-b branch, or Docker if available). Commit after each task and tick it in
docs/lanes/LANE-B.md. When you reach "STOP: Lane B": run lint, type-check and tests, write the
handoff, commit, and stop. Don't merge and don't start integration work.
```

**Lane C (terminal in `mpl-lane-c`):**

```text
You are Lane C (Format, matches & public pages) of 3 Claude sessions working in parallel on
PLAN.md §13. You are on branch lane/c in your own git worktree, with your own Neon branch and port
3003. Read CLAUDE.md, then PLAN.md §13.1, §13.2 and §13.6, and every section §13.6 lists. Work
through tasks C1 to C8 in order. Write only files that §13.2 gives to Lane C. Never edit shared
files; put any needed shared change in docs/lanes/LANE-C.md under "Integration notes" and work
around it. Use `npm run db:seed -- --stage=allocated|groups|knockout` and /dev/login-as for test
data. Commit after each task and tick it in docs/lanes/LANE-C.md. When you reach "STOP: Lane C":
run lint, type-check and tests, write the handoff, commit, and stop. Don't merge and don't start
integration work.
```

**Phase 2 (one Claude, main folder, after all three lanes stopped):**

```text
You are doing Phase 2 (Integration) of PLAN.md §13. Lanes A, B and C have finished on branches
lane/a, lane/b and lane/c. Read CLAUDE.md, PLAN.md §13.8 and all three docs/lanes/LANE-*.md
handoffs first. Then do I1 to I8 in order: merge A, then B, then C into main; apply every
integration note (schema changes as one new migration); wire the cross-lane flow and navigation;
run the full-journey e2e, the tenant-isolation sweep, `npm run verify` and the concurrency test on
real Postgres; update CLAUDE.md and PLAN.md. Before deploying (I8), stop and show me what you'll
deploy and which environment variables you need from me.
```
