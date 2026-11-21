# Deploying MPL (PLAN §13.8 I8)

One Next.js app on **Vercel**, state in **Neon Postgres**, live events through **Ably**. No other
servers. Region: Vercel functions in `sin1` (Singapore), Neon in AWS `ap-southeast-1`, next to
players in India (PLAN §8).

## What gets deployed

- The `main` branch, built with `next build`. Vercel runs Route Handlers and Server Actions on
  the Node.js runtime (the default).
- `vercel.json` pins functions to `sin1` (added in the deploy step, together with `vercel-build`).
- Migrations: `drizzle/*.sql`, applied by `npm run db:migrate` against the **direct** Neon URL.
  They run in the Vercel build (`vercel-build` script) so every deployment, including previews on
  their own Neon branch, gets a migrated database before the new code goes live.
- No seed and no dev tools: `/dev/*` answers 404 in production, and `npm run db:seed` refuses
  non-local databases unless `SEED_ALLOW_REMOTE=1`.

## Accounts and values needed

| Variable                | Where it comes from                                                             | Notes                                                                      |
| ----------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`          | Neon → project (`ap-southeast-1`) → Connection details → **pooled**             | Host contains `-pooler`. The Vercel–Neon integration sets it automatically |
| `DATABASE_URL_UNPOOLED` | Same, **direct** connection                                                     | Used only by migrations. The integration also sets it                      |
| `ABLY_API_KEY`          | Ably → app → API keys → root key (or a key with publish + subscribe + presence) | Server only. Browsers get subscribe-only tokens                            |
| `JWT_SECRET`            | Generate (below)                                                                | Session cookies                                                            |
| `INVITE_LINK_SECRET`    | Generate                                                                        | Changing it later breaks unclaimed personal links                          |
| `APP_ENCRYPTION_KEY`    | Generate                                                                        | Changing it later makes stored webhook URLs unreadable                     |
| `PUBLIC_APP_URL`        | The production URL, e.g. `https://mpl.vercel.app` or your domain                | Used in invite / reset links. No trailing slash                            |
| `LOG_LEVEL`             | Optional, `info`                                                                |                                                                            |

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Steps

1. **Neon:** create a project in `AWS ap-southeast-1 (Singapore)`. Copy the pooled and direct
   connection strings (or connect the Vercel–Neon integration in step 2 instead).
2. **Vercel:** import the Git repository (or `vercel link` from this folder). Framework: Next.js.
   Add the variables above for **Production** (and Preview, with the Neon integration giving each
   preview its own branch).
3. **Ably:** create an app and paste its key into `ABLY_API_KEY`.
4. **Deploy:** push `main` (or `vercel --prod`). The build runs the migrations, then `next build`.
5. **Smoke test** (two phones + a laptop for the big screen):
   - `/api/health` answers ok (the database is reachable).
   - Register an organiser, create a tournament, share the organiser key; two phones sign up as
     captains with it; approve them; add three soldiers; captains set up teams; Start.
   - Open the big screen from the tournament home (`/live/<code>`). Run a lot: both phones bid,
     the console, phones and big screen update **without** the 2-second polling lag (that means
     Ably is live: the command post shows "Live", not "Polling").
   - Finish the auction, allocate, draw, enter a result, and check the matches hub on a phone.
6. **Neon cold starts:** the free tier sleeps after ~5 minutes idle. Open the auction console a few
   minutes before the auction so the first bid isn't slow.

## Rollback

Vercel keeps every deployment: promote the previous one from the dashboard. Migrations are
forward-only; take a Neon branch snapshot before deploying a migration that changes existing data.
