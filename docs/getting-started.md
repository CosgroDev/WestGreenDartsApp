# Getting started

Use Node.js 22 or newer (verification used Node 24), then install the locked dependencies:

```sh
npm ci
```

For an existing deployment, follow [the audit migration instructions](audit-fixes.md) before updating the application.

For a new, empty Supabase project, apply these SQL files in order:

1. `supabase/schema.sql`.
2. The feature SQL files in the subdirectories of `supabase/migrations`, in numeric order within each directory. These are legacy scripts; the Supabase CLI does not automatically discover them as timestamped migrations.
3. `supabase/migrations/20260908193204_audit_scoring_and_access_fixes.sql`. This installs the scoring transactions and server-only access rules; it also includes the rules in `supabase/policies.sql`.

Create a team row and copy its ID into `TEAM_ID`. Copy `.env.example` to `.env.local` and set the Supabase URL, server-only service role key and team ID. Set `SESSION_SECRET` to a random secret; for example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Set `PIN_HASH` to the SHA-256 digest of `PIN_SALT:your-pin`. The default salt is `wgd-salt`. Keep the PIN, its hash, the service key, and signing secret out of Git. The app can verify the configured hash without an `auth_pin` database RPC. A verified PIN creates a signed, expiring cookie; all privileged server operations independently check it.

```sh
npm test -- --runInBand
npm run test:database
npm run build
npm run dev
```

Open [the local app](http://localhost:3000) and enter the configured PIN. The database tests use an isolated, in-memory PostgreSQL instance and do not require Supabase credentials.
