# Improvement plan — November 2026

A hand-off plan built from a full scan of the repository at commit `6681385`. Each work package (WP) is written so one agent can pick it up cold: it states the problem with file references, the change wanted, and how to prove it is done.

## Baseline at scan time

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passes |
| `npx jest` | 20 suites, 151 tests pass |
| `npm run test:database` | Passes (PGlite) |
| `next build` | Passes; every route ~103–117 kB first-load JS |
| `npm run lint` | **Broken** — no ESLint config, so `next lint` opens an interactive prompt |
| `npm audit --omit=dev` | **3 advisories**: `next` ≤15.5.27 (critical), `sharp` <0.35.5 (high), `source-map-js` ≤1.2.1 (high) |

The scoring core is in good shape: transactional RPCs, revision checks, idempotent request IDs and a real-Postgres test script. The gaps are around it — access hardening, silent failures, CI coverage, schema management and type safety.

## Rules for every agent

- Run `npm run typecheck`, `npx jest`, `npm run test:database` and `npm run build` before pushing. Add `npm run lint` once WP-02 lands.
- Do not apply migrations to, or run scripts against, the live Supabase project. Ship SQL as a new timestamped file in `supabase/migrations/` and extend `scripts/test-database.mjs` to cover it.
- Do not change the scoring RPC contract (`wgd_score_command`, `wgd_score_command_state`, `wgd_score_snapshot`) unless the WP says so. Old and new app instances overlap during a deploy.
- `next build` rewrites the tracked `tsconfig.tsbuildinfo`; do not commit that change (WP-03 untracks it).
- One WP per branch and PR. Stay inside the WP's listed files where possible; the "Conflicts" notes say which WPs touch the same files.

## Order and parallelism

| Wave | Packages | Notes |
| --- | --- | --- |
| 1 | WP-01, WP-02, WP-03 | Independent of each other. Do first; WP-02 gives everyone a safety net. |
| 2 | WP-04, WP-05, WP-06 | WP-04 and WP-05 both touch server actions — run WP-04 first or assign to one agent. |
| 3 | WP-07, WP-08, WP-09 | WP-07 is easier after WP-06 (generated types need one schema source). |
| 4 | WP-10, WP-11, WP-12 | Product-facing polish; independent of each other. |

---

## P0 — security and safety net

### WP-01 Patch vulnerable dependencies

**Problem.** `npm audit --omit=dev` reports a critical advisory against `next` 15.5.24 (affected range ends at 15.5.27) plus high advisories in `sharp` and `source-map-js`.

**Do.**
- Bump `next` and `eslint-config-next` to the latest patched 15.5.x. Stay on 15 — the Next 16 upgrade is a separate decision.
- Run `npm audit fix` for `sharp` and `source-map-js`; add an `overrides` entry only if a transitive pin blocks the fix.
- Keep the existing `postcss` override unless the new Next release makes it redundant.

**Done when.** `npm audit --omit=dev` reports zero advisories and all baseline checks still pass.

### WP-02 CI on every pull request, and a working linter

**Problem.** `.github/workflows/build-preview.yml` runs only on pushes to `build/**`. Pull requests and other branches (including `claude/**`) merge with no automated check. Lint cannot run at all. Three other workflows are pinned to feature branches that have already merged.

**Do.**
- Add `eslint.config.mjs` (or `.eslintrc.json`) extending `next/core-web-vitals`, and change the `lint` script to call the ESLint CLI — `next lint` is deprecated. Fix or explicitly suppress what it finds; do not blanket-disable rules.
- Change the main workflow to trigger on `pull_request` and on pushes to `main`, running: `npm ci`, lint, typecheck, `npm test -- --runInBand`, `npm run test:database`, `npm run build`.
- Delete `investigate-league.yml` and `investigate-insights.yml` (one-off investigations on merged branches). Make `verify-performance.yml` `workflow_dispatch`-only, or fold it into the main workflow if it runs under ~3 minutes.

**Done when.** A PR shows a required-looking check that runs all six steps, and `npm run lint` exits 0 non-interactively.

**Conflicts.** WP-03 (both edit `package.json` scripts).

### WP-03 Repository hygiene

**Problem.** Dead or misplaced files confuse agents and inflate diffs.

**Do.**
- Untrack `tsconfig.tsbuildinfo` and add `*.tsbuildinfo` to `.gitignore`.
- Remove unused code: `src/lib/supabaseClient.ts` (no importers; references an anon key the app deliberately does not use) and the `@tanstack/react-query` dependency (never imported).
- Move `highest_finish_check.sql` and `highest_finish_rows.sql` to `scripts/sql/`. Move `West Green Darts — Product Requiremt.txt` to `docs/prd.md`.
- Remove `/api/health` from `PUBLIC_PATHS` in `src/middleware.ts` — the route does not exist — or add the route if uptime checks are wanted.
- Rewrite `docs/architecture.md` to match reality. It still describes Next 14, Supabase-issued JWTs, RLS keyed on `auth.jwt()`, react-query reads and a browser Supabase client; the app is Next 15, HMAC-signed cookie sessions, service-role access from the server only.
- Add a root `README.md` (short: what it is, link to `docs/getting-started.md`, the four verification commands) and a `CLAUDE.md` carrying the "Rules for every agent" section above.

**Done when.** `git ls-files` shows none of the removed files, build and tests pass, and the architecture doc contains no claim the code contradicts.

---

## P1 — correctness and robustness

### WP-04 Harden the PIN gate and session

**Problem.**
- `src/app/pin/actions.ts` has no attempt limiting. A 4–8 digit PIN can be enumerated by calling the server action in a loop.
- The PIN hash is one round of SHA-256 with a default salt (`wgd-salt`) baked into the code and `.env.example`.
- `src/lib/session.ts` falls back to `SUPABASE_SERVICE_ROLE_KEY` as the signing secret when `SESSION_SECRET` is unset.
- There is no sign-out, and the action still calls an `auth_pin` RPC that no migration defines before falling through to the hash check.
- `next.config.mjs` sets no security headers.
- Export route handlers call `supabaseServer()`, which redirects to `/pin` on a bad session; API clients get an HTML redirect instead of a 401.

**Do.**
- Add attempt limiting backed by the database (a small `pin_attempts` table keyed by a hash of client IP, with lockout and backoff). In-memory counters do not survive serverless instances.
- Require `SESSION_SECRET` in production; fail loudly at startup rather than falling back.
- Remove the dead `auth_pin` call, or define the RPC — pick one path.
- Add a sign-out action and a button on `/settings`.
- Add headers in `next.config.mjs`: `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, and a CSP that the app actually passes under.
- Return 401 JSON from `/api/*` handlers when the session is invalid.
- Optional, flag in the PR for the owner to decide: move the PIN hash to scrypt or PBKDF2. This changes `PIN_HASH` format and needs a coordinated env update.

**Done when.** Tests cover lockout after N failures, lockout expiry, sign-out invalidating access, and a 401 from an export route without a cookie. Existing sessions keep working.

**Conflicts.** WP-05 (`src/lib/supabaseServer.ts`, route handlers).

### WP-05 Stop swallowing errors and validate input in server actions

**Problem.**
- Actions fail silently. `src/app/players/actions.ts`, `src/app/seasons/actions.ts` and `src/app/fixtures/actions.ts` use `if (error) return;`, so the user sees nothing when a write fails.
- `src/data/players.ts` returns `mockPlayers` when the database errors. In production a transient outage shows three fake players instead of an error.
- `getPlayers` and `updatePlayerAction` retry without `dart_model`/`stem_length`/`flight_type` when the error message contains "column" — a workaround for schema drift that `schema.sql` no longer has.
- Form inputs are cast (`formData.get(...) as string`) with no length, format or UUID checks.
- Multi-step writes are not atomic: `setCurrentSeasonAction` clears every season then sets one (a failure between leaves no current season), and `deleteFixtureAction` soft-deletes events, hard-deletes games, then deletes the fixture in three calls.
- Most `update`/`delete` calls filter by `id` only, without `team_id`. Harmless with one team, but the schema was built for more.

**Do.**
- Return a typed `{ ok, message }` result from every action and surface it in the form (the fixtures form already does this with `useActionState` — copy that pattern).
- Delete `src/data/mock.ts` and the fallbacks; let failures reach `src/app/error.tsx`.
- Remove the "column" retry paths.
- Add a small validation helper (zod, or hand-rolled to avoid the dependency) for names, UUIDs, dates and score ranges, and use it in every action.
- Move the season switch and fixture delete into SQL functions in a new migration so each is one transaction. Add a partial unique index enforcing one current season per team.
- Add `.eq("team_id", TEAM_ID)` to every action and data-layer query that lacks it, through one shared helper rather than by hand.

**Done when.** A forced database failure in each action shows a visible error; `scripts/test-database.mjs` covers the two new functions and the unique index; no file imports `data/mock`.

**Conflicts.** WP-04, WP-07 (same action files).

### WP-06 One source of truth for the database schema

**Problem.** `supabase/migrations/` holds two parallel layouts — timestamped files and per-feature folders (`game121/001_…`, `practice/001_…`) — with several scripts duplicated across both. `schema.sql` is a third partial copy. `docs/audit-fixes.md` already notes that `supabase db push` cannot initialise the project. Columns the code reads (`games.ai_review`, `games.revision`, practice tables) are not in `schema.sql`.

**Do.**
- Produce a single ordered, timestamped migration chain that builds the complete schema from an empty database. Fold the per-feature folders into it and delete them.
- Either regenerate `schema.sql` as a dump of the end state and label it reference-only, or delete it.
- Make `scripts/test-database.mjs` build the database from the migration chain alone, then run its existing assertions.
- Document in `docs/getting-started.md` how an existing installation marks the consolidated migrations as already applied (`supabase migration repair`). Do not run this against production — hand the steps to the owner.

**Done when.** `npm run test:database` passes starting from an empty PGlite instance using only `supabase/migrations/*.sql`, and no SQL file exists in two places.

### WP-07 Type safety across the data layer

**Problem.** 135 uses of `any` across 26 files, concentrated in `src/data/*` and the server actions. Scoring actions return `Promise<any>` (`src/app/scoring/actions.ts`), so the 517-line `ScoringClient.tsx` consumes untyped state. `allRows`/`rowsForIds` in `src/lib/database.ts` default to `any`.

**Do.**
- Generate Supabase types from the consolidated schema (`supabase gen types`) into `src/lib/database.types.ts` and pass them to `createClient`.
- Define explicit result types for the scoring snapshot and command results in `src/lib/scoreSnapshot.ts` and use them in both scoring clients.
- Work through `src/data/` file by file removing `any`. Start with `stats.ts`, `matchSummary.ts`, `form.ts`.
- Add `@typescript-eslint/no-explicit-any` as a warning, then an error once the count reaches zero.

**Done when.** `grep -rnE ": any\b|as any\b|any\[\]" src` returns fewer than 10 hits, each with a comment explaining why.

**Conflicts.** WP-05, WP-08. Best done after WP-06.

---

## P2 — performance and maintainability

### WP-08 Dashboard and stats read path

**Problem.**
- `loadSeasonStatistics` in `src/data/stats.ts` pages every scoring event for the season out of PostgREST in 500-row pages and aggregates in JavaScript, on every dashboard request. All 25 dynamic routes are `force-dynamic` with no caching, so cost grows with every leg played.
- `getLegSummariesAction` in `src/app/scoring/actions.ts` issues one query per leg.
- The SQL views in `schema.sql` (`player_stats_view`, `team_stats_view`) exist but the app computes the same figures in TypeScript, so two definitions can diverge.
- `generateSeasonAiSummaryAction` loads a game log per player in parallel, each re-reading the season.

**Do.**
- Measure first: add timing around `getDashboardStatistics` and record the query count and duration against a seeded season (extend `scripts/verify-performance.mjs`).
- Pick one definition of each statistic. Recommended: keep the tested TypeScript aggregators as the source of truth, drop the unused views, and cache the loaded season with `unstable_cache` under a `season-stats:<id>` tag that the scoring, undo and delete actions invalidate with `revalidateTag`.
- Replace the per-leg loop with a single `in("game_id", …)` query.
- Share one loaded season across the per-player calls in the AI summary action.

**Done when.** A warm dashboard load issues a fixed, small number of queries regardless of season size, a score entered on one device appears on the dashboard on the next load, and the existing stats tests pass unchanged.

**Conflicts.** WP-07 (`src/data/stats.ts`).

### WP-09 Consolidate the AI review code

**Problem.** Four server actions — match (`src/app/matches/[gameId]/actions.ts`), fixture (`src/app/fixtures/[id]/actions.ts`), season and player (`src/app/dashboard/actions.ts`) — each repeat the same Anthropic call, refusal handling, text extraction and store-back. Nothing stops two devices generating the same review at once, which pays for two calls.

**Do.**
- Extract one `generateReview({ system, payload, effort })` helper in `src/lib/` that owns the client, model constants, fallback, refusal handling and error mapping. Read the `claude-api` skill or current SDK docs before touching request parameters; do not change models or prompts.
- Guard against duplicate generation: claim the row before calling the API (a conditional update on a `generating_at` column), and have the second caller read back the stored result.
- Add unit tests for the helper with the SDK mocked: success, refusal, API error, missing key.

**Done when.** The four actions contain no direct `client.beta.messages.create` call, review output for a fixed payload is unchanged, and a concurrent double-click produces one API call.

### WP-10 Test the untested layers

**Problem.** Pure logic is well covered; the edges are not. No tests import `src/lib/killerEngine.ts`, `doublesPractice.ts`, `session.ts`/`auth.ts`, `drillCommand.ts`, `scoringCommand.ts` or `stableRead.ts`, nor `src/data/` modules for fixtures, players, seasons, practice or the drills. There are no component tests, and the only browser check is a manually triggered script.

**Do.**
- Unit tests for `killerEngine` (229 lines of game rules), `doublesPractice`, and `session` (expiry, tampered signature, wrong context, over-long expiry).
- Tests for `scoringCommand` and `stableRead` against a stubbed client: stale revision, missing-RPC fallback, retry exhaustion.
- A Playwright smoke test wired into CI that reuses the localhost adapter from `scripts/verify-performance.mjs`: PIN login, score a leg to checkout, undo, start leg two, view the dashboard.
- Add coverage reporting to Jest with a floor set at the measured level, so it cannot regress.

**Done when.** Every module in `src/lib/` that is not a React hook has a test file, and the smoke test runs in CI on pull requests.

---

## P3 — product polish

### WP-11 Break up the largest client components

**Problem.** `KillerClient.tsx` (736 lines), `ScoringClient.tsx` (517) and `PracticeScoringClient.tsx` (456) mix state machines, network calls and markup. The league and practice scorers duplicate the numpad, undo and save-status handling.

**Do.**
- Extract a shared `ScorePad` and a `useScoringSession` hook used by both scorers. Keep `useScoreTask`'s retry-with-same-request-ID behaviour intact.
- Split `KillerClient` into setup, board and summary components over the existing `killerEngine`.
- Behaviour-preserving only. Requires WP-10's smoke test to be in place first.

**Done when.** No client component exceeds ~300 lines, and the smoke test and `scripts/verify-performance.mjs` pass unchanged.

### WP-12 Match-night resilience and accessibility

**Problem.** The PRD's Phase 5 (`docs/milestones.md`) is unbuilt. Scoring happens in a pub on mobile data, but a dropped connection leaves only a retry button — there is no web manifest, no offline indication, and an unsent visit is lost if the tab reloads. No accessibility pass has been done.

**Do.**
- Add `app/manifest.ts` and icons so the app installs to a home screen.
- On the scoring screens, show connection state and persist the one in-flight visit (with its request ID) to `localStorage` so it re-sends after a reload. The server's idempotent request IDs already make the replay safe. Do not build a general offline queue.
- Run an accessibility pass on PIN, scoring and dashboard: focus order, accessible names on numpad and icon buttons, contrast on the dark theme, `prefers-reduced-motion` for the celebration animations.

**Done when.** Lighthouse mobile reports the app as installable with an accessibility score ≥ 95 on those three screens, and killing the network mid-visit then reloading re-sends exactly one visit.

---

## Decisions for the owner

These change behaviour or cost and should not be decided by an agent:

1. **Next 16 / Tailwind 4 / ESLint 10 / Jest 30 upgrades.** All are a major version behind. WP-01 stays on current majors.
2. **PIN hash algorithm** (WP-04). Stronger hashing means regenerating `PIN_HASH`.
3. **Hard versus soft delete.** Deleting a fixture is permanent today. Deleting a player who has games is blocked by the `games.west_green_player_id` foreign key, and the action fails silently (see WP-05). Decide whether players should be soft-deleted instead; that is a schema change.
4. **League data source.** `src/lib/liveLeague.ts` reads an undocumented API of a third-party site and ports its standings logic. It will break without warning when that site changes; worth asking the league for a supported feed.
