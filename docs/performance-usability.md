# Performance and usability build

Branch: `build/performance-usability`.

## Changes

- Dashboard statistics, honours, recent form and season totals share the same paginated season dataset. Fixture detail batches visit reads instead of querying once per leg.
- First 9 averages use visit order. Form and team suggestions use the selected season and exclude incomplete two-leg matches, while retaining legacy draws.
- Performance charts load their chart library when expanded. AI summaries and exports can be expanded separately. Dashboard offers a direct link to resume a live match.
- Phone zoom is enabled. Route transitions have loading feedback, keyboard focus is visible, and scoring effects respect reduced motion.
- Derived league predictions are cached by the live data refresh version. Backtesting and residual analysis share one calculation. The Monday 8pm–Tuesday 11:59pm automatic-refresh schedule and manual refresh are retained.
- Scoring shows saving, saved and recoverable error states. Keypads and player selection are locked during an outstanding or failed request. Entries remain available after a failure; Retry uses the original request ID. Reload latest score handles an edit from another device without submitting the retained entry.
- League and normal practice scoring can return both the command outcome and the coherent updated state in a single database request. Existing server-side revision checks, idempotency, parent locking and permissions remain.

## Scoring migration

Apply `supabase/migrations/20261001090000_scoring_snapshots.sql` to enable the single-request path. The existing audit/scoring migration is a prerequisite.

The new SQL functions are security invoker functions with an empty search path; only the service role can execute them. They use the existing fixture/session lock and return revision, visits, player metadata and match summaries together. Migration tests run against an isolated PostgreSQL-compatible PGlite database, including repeat application, cross-team rejection and anonymous denial.

The application detects a genuinely missing snapshot RPC and falls back to the existing scoring command and stable reads using the same request ID. It does not fall back on general connection or permission errors.

This branch does not apply migrations to the production database.

## Measured build

The production build reports dashboard First Load JS of **113 kB**, compared with **221 kB** on the previous main build: approximately **49% less initial JavaScript**. This measures downloaded JavaScript, not elapsed loading time on a user's phone.

## Verification

`Build preview` runs Jest, database checks, TypeScript and the production build. The initial implementation passed 103 tests in 15 suites.

`Verify performance and scoring usability` builds and opens the real production app in Chromium at a 390 × 844 viewport. A restricted local REST adapter connects server actions to an isolated PGlite database; it uses synthetic fixtures and session credentials, with no production database access. Checks cover:

- Resume scoring and delayed chart-library loading.
- Mobile width and zoom settings.
- A database write whose HTTP response is deliberately lost: Retry must retain the request ID and create one visit.
- A normal visit using exactly one command-and-state RPC.
- A competing device revision followed by reload, retaining the typed entry.
- Practice checkout and undo, including next-leg cleanup.

Screenshots and request traces are uploaded as the `performance-usability-verification` Actions artifact. The adapter is deliberately limited to the tested REST queries; these checks do not replace a deployed Supabase/PostgREST smoke test.
