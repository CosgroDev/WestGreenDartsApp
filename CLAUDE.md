# West Green Darts — notes for agents

Next.js 15 App Router app backed by Supabase Postgres. Read `docs/architecture.md` first.

## Checks

Run all of these before pushing:

```sh
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:database
npm run build   # set NEXT_PUBLIC_SUPABASE_URL to any URL if no .env.local
```

## Rules

- Never apply migrations to, or run scripts against, the live Supabase project. Ship SQL as a new timestamped file in `supabase/migrations/` and cover it in `scripts/test-database.mjs`.
- Do not change the scoring RPC contract (`wgd_score_command`, `wgd_score_command_state`, `wgd_score_snapshot`) without a coordinated plan: old and new app instances overlap during a deploy.
- All database access is server-side through `supabaseServer()` in `src/lib/supabaseServer.ts`, which checks the signed session first. There is no browser Supabase client; do not add one.
- Server actions return a typed `{ ok, message }` result and never swallow a database error.
- Pure logic lives in `src/lib/` and has a Jest test in `__tests__/`. Database reads live in `src/data/`.
