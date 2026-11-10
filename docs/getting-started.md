# Getting started

Use Node.js 22 or newer (verification used Node 24), then install the locked dependencies:

```sh
npm ci
```

## Database

All SQL lives in `supabase/migrations/` as one timestamped chain. Applied in filename order it builds the complete schema from an empty database, and every file is safe to apply twice.

**New, empty Supabase project.** Link the project and run `supabase db push`, or paste each file into the SQL editor in filename order.

**Existing installation.** The first three files (`20260101000000_base_schema.sql`, `20260201000000_practice_tables.sql`, `20260301000000_game121_tables.sql`) replace the old `schema.sql` and per-feature scripts that were applied by hand. Your database already has those objects, so record them as applied rather than running them:

```sh
supabase migration list            # see what the project has recorded
supabase migration repair --status applied 20260101000000 20260201000000 20260301000000
```

Repeat `migration repair` for any later file that `migration list` shows as missing remotely but that you know was applied by hand. Then `supabase db push` applies only what is genuinely new. Back up first. See [the audit notes](audit-fixes.md) for the history of the September 2026 migration.

After pulling a change that adds a migration, apply it **before** deploying the matching application. The one exception is PIN attempt limiting: if `20261110090000_pin_limits_and_atomic_admin.sql` is not applied yet, the app falls back to a per-instance limiter, but switching the current season and deleting a fixture will fail until it is.

## Configuration

Create a team row and copy its ID into `TEAM_ID`. Copy `.env.example` to `.env.local` and set the Supabase URL, server-only service role key and team ID. Set `SESSION_SECRET` to a random secret; for example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Set `PIN_HASH` to the SHA-256 digest of `PIN_SALT:your-pin`. The default salt is `wgd-salt`. Keep the PIN, its hash, the service key, and signing secret out of Git. A verified PIN creates a signed, expiring cookie; all privileged server operations independently check it. Five wrong PINs from one client lock it out for 30 seconds, doubling up to 15 minutes.

If `SESSION_SECRET` is unset the app signs sessions with the service role key and logs an error in production. Set it: adding or changing it signs every device out once.

## Run and verify

```sh
npm run dev
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:database
npm run build
```

`npm run test:smoke` drives the built app in a browser (sign-in, lockout, scoring a leg, undo, dashboard). It needs Playwright and a build made with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3101`; set `PLAYWRIGHT_MODULE_PATH` if Playwright is installed outside the project.

Open [the local app](http://localhost:3000) and enter the configured PIN. The database tests use an isolated, in-memory PostgreSQL instance and do not require Supabase credentials.
