# West Green Darts — technical architecture

## Overview

- **Frontend and server**: Next.js 15 (App Router) on React 19, deployed to Vercel. Pages are server components; scoring screens, charts and forms are client components. Tailwind for styling, `recharts` for charts.
- **Database**: Supabase-hosted Postgres. The app talks to it only from the server, through PostgREST with the service-role key.
- **Access**: one shared team PIN. No per-user accounts.
- **AI**: match, fixture-night, season and player reviews are generated with the Anthropic API and stored in the database.
- **League table**: standings are read from the league's public site and cached.

## Directory map

| Path | Contents |
| --- | --- |
| `src/app/` | Routes. Each feature folder holds its page, client components and an `actions.ts` of server actions. |
| `src/app/api/` | Route handlers: CSV/JSON exports and the league snapshot/insights endpoints. |
| `src/data/` | Database reads. One module per feature; all go through `supabaseServer()`. |
| `src/lib/` | Pure logic (scoring rules, finish routes, statistics, AI prompt building) plus the session, validation and database helpers. |
| `src/components/` | Shared UI. |
| `supabase/migrations/` | Timestamped SQL migrations. The chain builds the full schema from an empty database. |
| `__tests__/` | Jest unit tests. |
| `scripts/test-database.mjs` | Applies the migrations to an in-memory Postgres (PGlite) and exercises the scoring RPCs. |

## Access and sessions

1. `/pin` posts the PIN to `enterPinAction` (`src/app/pin/actions.ts`). Failed attempts are counted per client in the `pin_attempts` table and locked out after repeated failures.
2. The PIN is checked against `PIN_HASH` (SHA-256 of `PIN_SALT:pin`).
3. On success the server sets `wgd_session`: an httpOnly cookie holding an expiry, a random ID and an HMAC-SHA-256 signature keyed by `SESSION_SECRET` (`src/lib/session.ts`). It lasts 30 days. Changing the secret, the team ID or the PIN hash invalidates every session.
4. `src/middleware.ts` verifies the cookie on every non-public route. Pages redirect to `/pin`; `/api/*` returns 401.
5. `supabaseServer()` verifies the session again before creating a database client, so a server action or route handler cannot reach the database without one.

There is no browser Supabase client and no anon-key access. Row-level security is enabled on every table with all grants revoked from `anon` and `authenticated`; only `service_role` can read or write.

## Data model

Core tables: `teams`, `players`, `seasons`, `fixtures`, `games` (one row per leg; legs of one match share `match_id`), `scoring_events` (one row per visit, for both sides).

Practice and drills: `practice_sessions`/`practice_games`/`practice_events`, `game_121_*`, `checkout_practice_*`, `doubles_practice_*`.

Stored AI output: `games.ai_review`, `fixtures.ai_team_review`, `seasons.ai_summary`, `player_ai_insights`.

Every table carries `team_id`. The app serves one team, set by the `TEAM_ID` environment variable.

## Scoring

Scoring is event-based: each visit is a `scoring_events` row, and state is rebuilt from the rows.

- Writes go through one transactional RPC, `wgd_score_command` (record, undo, new leg), or `wgd_score_command_state`, which also returns the new state. The function locks the parent row, checks the caller's `revision` against the stored one and rejects stale requests, so two devices cannot interleave.
- Each request carries a client-generated request ID. Replaying the same ID is a no-op, which makes retry after a lost response safe.
- `wgd_score_snapshot` returns a consistent view of a game in one call. `src/lib/stableRead.ts` is the fallback when the RPC is absent.
- Double-out rules, bust handling and checkout validation live in `src/lib/scoringUtils.ts` and are mirrored in the RPC.

- The league scoring screen keeps the one unconfirmed visit in local storage (`src/lib/pendingVisit.ts`) and resends it, with the same request ID, if the page reloads before the server answers.

Do not change these RPC signatures without a plan for old and new app instances running side by side during a deploy.

## Statistics

Statistics are computed in TypeScript from the season's games and events (`src/data/stats.ts`, `src/data/form.ts`, `src/data/seasonSummary.ts`). The loaded season is cached per season and invalidated whenever a score, undo or deletion changes it. Busts count darts but not points; averages are points over darts across legs, not a mean of leg averages.

## AI reviews

`src/lib/aiCoaching.ts` holds the prompts and the derived numbers fed to the model; `src/lib/playerInsights.ts` holds the season-long derivations. `src/lib/aiReview.ts` owns the API call. Each review is generated once and stored; the season summary and player insight regenerate when new results arrive.

What the model is shown decides how much a review can say, so the payloads are built from every visit rather than from the stat tiles:

- Both throwers' visits are read in throw order (`splitLegEvents` in `src/data/matchSummary.ts`), so each visit carries what the other player had left at the time. Legs scored before opponent visits were stored have none; every opponent block is then null and the prompts tell the model to say nothing about the opponent.
- `deriveMatch` works out how each leg was lost (with finish chances, or never reaching one), what was left, one-dart-finish conversion, the leg record with and against the throw, and the comparison with what the opponent threw (who out-scored whom, who reached a finish first, finishing with the opponent also on a finish).
- The season review adds a squad-wide profile and a night-by-night timeline (`deriveSquadSeason`) and the league table when the league site can be read. The player insight adds the player's logged practice (`practiceContext`).

When changing a payload, change the description of it in the matching system prompt too: the prompt is the only thing that tells the model what a field means.

## Caching

- Pages are dynamic. Season statistics are cached with `unstable_cache` under a per-season tag.
- The league source is cached and refreshed on a schedule around match night (`src/data/liveLeague.ts`, `src/lib/leagueRefresh.ts`).

## Testing

- `npm test` — Jest unit tests for the pure logic and data aggregators.
- `npm run test:database` — migrations and scoring RPCs against a real Postgres engine (PGlite).
- `scripts/verify-performance.mjs` — browser check of the scoring screens against a local adapter, run manually.
