# West Green Darts — Technical Architecture (v0.1)

## Goals
- Mobile-first Next.js (App Router) app deployed to Vercel.
- Supabase (Postgres + Storage + Auth) as the single backend.
- Shared PIN gate for one team; no per-user accounts.
- Event-based scoring to enable undo, fast stats, and multi-device concurrency.

## High-Level System
- **Frontend**: Next.js 14 (app directory), React Server Components where possible, Tailwind for layout + mobile touch UI, client components for scoring UI and charts (e.g., `@tanstack/react-query` for data fetching, `recharts` for charts).
- **Backend**: Supabase hosted Postgres with row-level security (RLS) keyed to a single `team_id`. REST + Realtime via Supabase client; server actions for sensitive operations.
- **Auth/Access**: PIN hashed and stored in Supabase. A successful PIN exchange issues a signed JWT (Supabase auth) stored in httpOnly cookie for 30 days.
- **Data Sync**: All writes go to Supabase. Live scoring uses optimistic UI; optional Supabase Realtime subscription keeps fixtures/game state fresh on multiple devices.
- **Deploy/Dev**: Vercel for frontend. Supabase migrations via SQL in `supabase/schema.sql` and `supabase/policies.sql`. Local dev uses `supabase` CLI if available; otherwise connect to hosted instance.

## Core Data Model (entities)
- `teams` (one row for West Green)
- `pins` (hashed pin, rotation history)
- `players` (no photo/avatar field needed)
- `seasons`
- `fixtures`
- `games` (one leg = one game in v1)
- `scoring_events` (visit-level entries)
- `exports` (logged export actions for auditing)

See `supabase/schema.sql` for columns and keys.

## RLS / Security
- All tables scoped to `team_id`.
- Policies: allow read/write only when `auth.jwt()` contains matching `team_id`; `pins` verified via RPC `auth_pin`.
- HTTPS enforced at Vercel; Supabase anon key used only server-side; client uses service role via server actions only where needed.

## API Surface
- **Server Actions** (preferred): `loginWithPin`, `createPlayer`, `updatePlayer`, `createSeason`, `createFixture`, `createGame`, `recordVisit`, `undoLastVisit`, `exportCsv`.
- **Client Data**: use `react-query` with Supabase JS client for reads; writes go through server actions to keep keys secret and enforce validation.

## Scoring Logic (501 double-out)
- Game starts at 501. Each `scoring_event` stores: `game_id`, `throw_index`, `score`, `remaining_after`, `is_bust`, `is_checkout`, `darts_thrown` (1–3), `created_at`.
- Finish guidance: lookup table for 2–170. Implement as static map in frontend.
- Undo: delete latest `scoring_event` for game (or mark `is_deleted` soft flag for audit).

## Stats Calculation Strategy
- Derived on-demand in SQL views / materialized views:
  - `player_leg_stats_view`: legs played/won, 3DA, first 9, keep/break, checkout%.
  - `score_buckets_view`: counts of 60+, 80+, 100+, 120+, 140+, 170+, 180.
  - `team_season_summary_view`: aggregate legs won/lost, averages by season.
- Keep compute in SQL to reuse across dashboards and exports.

## UX Notes
- First screen: PIN gate. Persist session cookie 30 days.
- Navigation tabs: Dashboard, Fixtures, Players, Exports.
- Live scoring UI: numeric pad, large buttons, quick undo, finish suggestions chip.
- Dashboards: minimal charts first (3DA trend, checkout trend, score distribution).

## Milestone Mapping
- Phase 1: scaffold + PIN gate + players CRUD.
- Phase 2: seasons/fixtures/games CRUD.
- Phase 3: scoring + undo + finish helper.
- Phase 4: stats views + dashboards + exports.
- Phase 5: polish + optional offline guardrails (retain scoring screen state if offline).
