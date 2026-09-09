# Audit fixes — September 2026

This change addresses the 18 findings from the source audit of commit `a43fdc38fc8864ec82e62f8507ef9d6089f8d1ac`. It has been implemented and verified locally. No live database migration, deployment, commit, or push was performed.

## Changes

| Finding | Fix |
| --- | --- |
| 1. Fabricated session cookie | Signed, expiring team sessions; server actions and exports authenticate before creating a privileged client. |
| 2. Vulnerable framework | Next.js 15.5.24, React 19, updated dependencies, and a patched PostCSS override. Async page props and cookies updated for Next 15. Node 22+ is required by the locked Supabase SDK. |
| 3. Overlapping score requests | Transactional RPCs lock the parent fixture/session and reject stale revisions. Request IDs make a repeated command idempotent. Client guards prevent duplicate submissions. |
| 4. Opponent state lost on refresh | Both sides' visits are stored. Scores, next thrower and undo history are reconstructed from the database. |
| 5. Busts inflate statistics | Bust points and score bands are excluded; darts still count. Player, team, practice and match data readers use the corrected calculation. |
| 6. False success after write failure | Scoring and drill event/state updates commit together. Database errors propagate instead of reporting a completed game. |
| 7. Completed practice winner overwritten | Status and revision checks execute inside the scoring transaction. |
| 8. Wrong leg-two starter | Each league leg stores its starter; new legs alternate it. Navigation preserves fixture/home context. |
| 9. Impossible checkouts | Shared double-out validation, including the number of darts, applies to league and practice. An impossible zero in 121 is a bust. |
| 10. Incomplete practice undo | Undo clears completion metadata, reopens the session and removes empty successor legs. It refuses to undo an earlier checkout once a later leg has live visits. |
| 11. Matches merged in results | Form and season summaries group by stable match ID. |
| 12. Unachieved 121 best checkout | The leaderboard reads successful turns rather than the current target. |
| 13. Invalid setup SQL | Views aggregate per leg before aggregating players/teams. Access scripts use valid grants and RLS statements. Historical SQL BOMs removed. |
| 14. Unrelated/undone events exported | Inner fixture filtering and explicit deletion filters constrain exports. |
| 15. Truncated histories | Statistics, exports and drill histories page through all rows. Large history ID filters are chunked. |
| 16. Unweighted match average | Fixture averages use total points divided by total darts across the match. |
| 17. Three darts forced on practice checkout | The scorer chooses one, two or three darts, subject to checkout validation. |
| 18. Broken CSV fields | Shared CSV quoting handles commas, quotes and line breaks. |

State loaders also retry when a revision changes during their multiple reads, so a newer revision is not attached to an older displayed score.

## Apply to an existing installation

1. Back up the database and finish any live scoring session. Older clients do not persist opponent visits and cannot participate in the new revision checks.
2. Confirm the legacy feature tables already exist: regular practice, 121, checkout practice and doubles practice. Apply any missing feature scripts in numeric order. Do not rerun `schema.sql` as an upgrade procedure.
3. Apply `supabase/migrations/20260908193204_audit_scoring_and_access_fixes.sql` to the intended database. It runs in a transaction, backfills missing match IDs, normalizes starters and visit indexes, and installs the RPCs and access rules. The migration was tested both initially and on repeat application. Existing installations that have manually different view definitions should test the migration against a restored backup first.
4. Deploy the matching application with Node 22+, the updated lockfile, existing Supabase/PIN/team settings, and a random server-only `SESSION_SECRET`. If omitted, signing falls back to the service role key. Do not expose either secret through a `NEXT_PUBLIC_` variable.
5. Sign in again and verify a fresh league leg plus a practice checkout/undo. Old unsigned cookies are intentionally invalid.

The top-level timestamped migration is suitable for the Supabase CLI once the legacy schema is present and its migration history is reconciled. `supabase db push` alone cannot initialize this repository's legacy subdirectory scripts. Keep the application and database upgrade coordinated: old application instances bypass the new command transactions.

The migration preserves recorded visits. It cannot reconstruct opponent scores that an older browser never saved, distinguish already-merged legacy matches without reliable IDs, or infer the intended winner of a previously corrupted game. Those historical records may need individual correction.

## Verification

- Production `next build`: passed, including lint and generated route type checks.
- Jest: 34 tests across 6 suites passed, including actual player/season/121 data aggregators.
- `npm run test:database`: real PostgreSQL engine through PGlite; fresh schema, repeat migration, access restrictions, stale revision rejection, duplicate-request handling, persisted opponent visits, bust totals, checkout dart validation, next-leg starter, practice undo/session reopening, completion failure rollback, and all three drill transactions passed.
- Local browser: PIN login; forged-cookie rejection; opponent score after refresh and undo; league checkout and leg-two scoring; one-dart practice checkout and undo; 121 progression; checkout drill; doubles scoring. No browser errors were reported. Browser requests used a localhost test adapter backed by the migrated PostgreSQL engine, not the live Supabase project.
- Dependency audit: zero known vulnerabilities in the final installed tree.

Live Supabase configuration and production multi-connection load were not tested. The PostgreSQL tests exercise transactions and stale requests; PGlite itself uses one connection.

Repeat the automated checks with `npm ci`, `npm test -- --runInBand`, `npm run test:database`, and `npm run build`.
