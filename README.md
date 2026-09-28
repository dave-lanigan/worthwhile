# Worthwhile

A single-user net worth estimator built with Nuxt 4, TypeScript, shadcn-vue, Unovis, and Turso (libSQL), with local SQLite storage available for offline use and tests.

## Run

Use Node.js 22.20+ and npm. Install the locked dependency versions:

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Nuxt. The app starts with an empty plan. Add income, investments, expenses, liabilities, and starting cash, then select **Save changes** to persist your plan. Edits update the chart immediately but are not stored until saved.

For the production server:

```sh
npm run build
npm start
```

Both scripts bind to `127.0.0.1`. Clerk authenticates visitors, and only one explicitly configured account can read or save the plan. Local runs reject nonlocal hosts; Vercel deployments accept hosted HTTPS same-origin requests. This is not a multi-user application.

## Authentication

The Clerk Nuxt module uses `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the server-only `NUXT_CLERK_SECRET_KEY`. Obtain development keys through `npx clerk@latest env pull`; never commit them. The current project has been linked to the Worthwhile development application.

Sign up at `/sign-up`, then copy your account ID from the locked-plan screen into the server-only `NUXT_OWNER_USER_ID` environment variable and restart the app. Until an owner is configured, no signed-in account can access the saved plan. Other accounts remain forbidden even if they can sign up. Authentication does not modify, migrate, or assign ownership of existing financial data automatically.

The account menu provides sign-out. The estimator page redirects signed-out visitors to `/sign-in`; both plan API handlers independently enforce the owner check before accessing storage. Plan responses are not cached, and changing accounts clears cached responses and recreates the page.

Choose **Continue without signing in** on either authentication page to open `/guest`. Guest mode starts with an empty, editable forecast held only in page memory. It never reads or writes the saved plan, and changes are discarded when leaving or reloading the page. Signing in does not import a guest draft. The saved-plan API remains owner-only.

## Deploy to Vercel

1. Import the repository into Vercel with this directory as the project root, or deploy the folder using the Vercel CLI. `vercel.json` selects Nuxt, `npm ci`, and `npm run build:vercel`; Node.js is pinned to 22.x. Leave the output directory at the framework default. Do not use `nuxt generate` or `npm start` on Vercel.
2. Add these variables in Vercel Project Settings > Environment Variables before building. `.env` is local only and excluded from uploads. `.env.example` lists the names without credentials.

| Variable | Value |
| --- | --- |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the target environment |
| `NUXT_CLERK_SECRET_KEY` | Matching Clerk secret key; server-only |
| `NUXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NUXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NUXT_OWNER_USER_ID` | Owner's Clerk `user_...` ID in that instance; server-only |
| `TURSO_DB_URL` | Remote `libsql://...turso.io` URL |
| `TURSO_DB_TOKEN` | Database token with read/write permissions; server-only |

3. Configure a Clerk production instance for your production domain and complete Clerk's domain/DNS setup. Use its production key pair for Vercel Production. Set Preview variables separately, using a development Clerk instance and a separate Turso database so preview saves cannot change production finances. Owner IDs are specific to the Clerk instance. Only `NUXT_OWNER_USER_ID` can read or save the single shared plan.
4. Deploy. Vercel supplies `VERCEL=1`, enabling hosted requests. Cross-origin requests and non-JSON writes remain blocked. Do not set `NUXT_DATABASE_PATH` on Vercel: the app requires remote Turso and refuses local filesystem storage. The table is created automatically; existing local data is not migrated or uploaded.
5. Verify the deployed URL: signed-out users reach sign-in and `/api/plan` returns 401; the configured owner can save and reload; another account receives 403. A missing owner ID blocks authenticated requests with 503. Verify persistence in the isolated Preview database before using Production. Redeploy after changing environment variables.

Check the deployment artifact locally with `npm run build:vercel`; output is generated under `.vercel/output`. Use `npm run build` again before running the standalone server or browser tests. These build commands do not perform a live deployment or remote database migration. Vercel's ephemeral filesystem is never used for hosted financial data.

## Forecast conventions

- All values are USD. Stored money and monthly balances are integer cents; booked returns and interest round to the nearest cent.
- Income is take-home income. Annual income and expenses are averaged across 12 months, rounded to cents each month; this does not model annual payment dates.
- Each investment has a current balance and an effective annual ROI. Its monthly growth factor is `(1 + ROI / 100) ** (1 / 12)`. Returns are fixed assumptions, not market predictions. Negative returns are supported down to -100%.
- Liabilities accrue monthly interest at `APR / 100 / 12`. Payments are capped at the amount owed and stop when the debt is cleared. Payments below interest cause the debt to grow and generate a warning. Do not duplicate debt payments under expenses.
- Each investment can use a monthly dollar target or a percentage allocation. After income, expenses and actual debt payments, dollar targets are funded first from positive surplus. When surplus cannot cover all dollar targets, they are reduced proportionally. Percentage allocations then apply to the remaining surplus and cannot total more than 100%; unallocated surplus stays in cash. Remainder cents go to the largest fractional shares, breaking ties by stable entry ID. Contributions arrive at month end and earn returns from the next month. Starting cash is not automatically invested. Existing saved plans without allocation settings retain equal percentage splits; editing or deleting an investment preserves the other allocations rather than redistributing them. Payroll deductions, employer matches, contribution limits, and account-specific tax rules are not inferred.
- Deficits draw down cash, then appear as negative cash with an unfunded-shortfall warning. Investments are never automatically sold; no interest is charged on negative cash. Subsequent surplus covers a cash deficit before new investment contributions.
- Net worth equals cash plus investments minus outstanding liabilities. Moving cash into investments or repaying debt principal does not itself change net worth.
- Month zero is the current calendar month. Projections extend 1-40 years. The projected net worth headline, time label, and projected change follow the selected-month slider. Chart hover previews a month in the tooltip without changing the selection. Changing the horizon selects its endpoint. There are no taxes, inflation, market volatility, investment fees, or dated one-time events. No estimate is guaranteed.
- Inputs and projections are bounded to prevent unsafe numeric results. Exceptionally large amounts, returns or long horizons may require reducing the assumptions before the plan can be saved.

## Wealth percentiles and annual income

The current and slider-selected net worth show approximate percentiles among **U.S. households, all ages**, including housing wealth, against the [Federal Reserve's 2022 Survey of Consumer Finances](https://www.federalreserve.gov/econres/scfindex.htm). These are not worldwide or individual-adult rankings. Enter all relevant assets and debts for a comparable household total.

The benchmark comes from the official [SCFP2022 CSV extract](https://www.federalreserve.gov/econres/files/scfp2022excel.zip), retrieved September 27, 2026. Sort its 22,975 public records by `NETWORTH`, accumulate `WGT`, and take the first value at or above each 1%-99% cumulative-weight target. All five implicates are included; dividing every weight by five leaves percentile thresholds unchanged. Thresholds are stored as whole 2022 dollars in `shared/utils/wealth-percentile.ts`; estimates interpolate linearly between thresholds and display rounded percentiles. Values outside the table are labeled below the 1st or above the 99th percentile, not extrapolated. The median threshold is $192,700. Survey uncertainty is not modeled.

Comparisons are nominal and **not inflation-adjusted**: future projected net worth is compared with that same historical distribution, not a prediction of future wealth rankings. Percentile calculations run locally using the bundled benchmark. When Turso is configured, saved financial plans are sent to your Turso database.

Income displays monthly and yearly totals both per source and for the whole section. Annual entries retain their exact entered amount for yearly totals; monthly entries are multiplied by 12. This avoids carrying the forecast's monthly cent-rounding into annual income totals.

## Storage

Set the following server-only variables in `.env`:

```dotenv
TURSO_DB_URL=libsql://your-database.turso.io
TURSO_DB_TOKEN=your-database-auth-token
```

Both `npm run dev` and `npm start` load `.env`; credentials are read at runtime and are not bundled into the client or build. Both scripts enable Node's system certificate trust without disabling TLS verification. Restart the server after changing credentials. The plan table is created automatically, and the application validates documents and saves them transactionally. A revision check prevents silent overwrites from another browser tab; a conflict requires reloading the saved plan. Connection errors are reported, never silently redirected to local storage.

Without Turso settings, storage defaults to `.data/networth.sqlite`, relative to the directory where the server is started. Set `NUXT_DATABASE_PATH=/absolute/path/plan.sqlite` to explicitly select local SQLite even when Turso credentials are present. Tests use this override so they never write to Turso. Existing SQLite files remain compatible and untouched when switching to Turso, but their data is not automatically copied. To return to the previous local database, set this override and restart; changes saved only to Turso will not appear locally.

Database files, SQLite sidecars, generated files, and `.env` are excluded from Git. No personal or demo records are included. Keep the Turso token private. Local financial data is not encrypted at rest; protect it with your operating-system account and disk encryption. Manage remote backups and recovery through Turso.

To back up a local database, stop the server and copy the entire `.data` directory, including any `-wal` and `-shm` sidecars, to a private location. Restore with the server stopped. Do not copy just the main SQLite file while the server is running. A corrupt or incompatible database is reported as an error and is never silently replaced.

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover financial invariants, negative returns, exact allocation, payoff, deficit recovery, SQLite persistence, revision conflicts, corrupt documents, request guards, and owner authorization. Browser tests start the production server on `127.0.0.1:4178` with a separate temporary SQLite database and refuse to reuse an existing server on that port. Signed-out checks run with Clerk development keys alone. Authenticated tests require `E2E_CLERK_USER_ID` and `E2E_CLERK_USER_EMAIL` for a dedicated development account; the non-owner check also requires `E2E_CLERK_OTHER_EMAIL` for a different account. These tests are explicitly skipped when their accounts are not configured. The test server overrides the real plan owner and storage settings, and no test accounts are created automatically. Screenshots go into the ignored `test-results` directory; traces are disabled to avoid recording session credentials.

On networks using certificates trusted by macOS but not Node's bundled store, prefix browser/component downloads with `NODE_USE_SYSTEM_CA=1`. Do not disable TLS verification. TypeScript is pinned to 5.9.3 for compatibility with the Vue typechecker.
