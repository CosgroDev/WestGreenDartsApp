# West Green Darts — notes for agents

Next.js 15 App Router app backed by Supabase Postgres. Read `docs/architecture.md` first.

## Checks

Run all of these before pushing:

```sh
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:database
npm run build        # set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3101 if there is no .env.local
npm run test:smoke   # browser check of the build; needs Playwright (PLAYWRIGHT_MODULE_PATH)
```

## Rules

- Never apply migrations to, or run scripts against, the live Supabase project. Ship SQL as a new timestamped file in `supabase/migrations/` and cover it in `scripts/test-database.mjs`.
- Do not change the scoring RPC contract (`wgd_score_command`, `wgd_score_command_state`, `wgd_score_snapshot`) without a coordinated plan: old and new app instances overlap during a deploy.
- All database access is server-side through `supabaseServer()` in `src/lib/supabaseServer.ts`, which checks the signed session first. There is no browser Supabase client; do not add one.
- Server actions never swallow a failure. Expected, user-fixable problems return `{ ok: false, message }` or call `backWithError()`; database failures are thrown (`must()` in `src/lib/actionResult.ts`). Validate form input with `src/lib/validation.ts`.
- Pure logic lives in `src/lib/` and has a Jest test in `__tests__/`. Database reads live in `src/data/`.
