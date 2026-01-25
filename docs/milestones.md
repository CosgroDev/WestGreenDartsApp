# Implementation Plan (mapped to PRD)

## Phase 1 – Foundation (PIN + Players)
- Next.js App Router scaffold, Tailwind, env wiring.
- Supabase client setup + RLS policies.
- PIN gate page (`/pin`) with server action `loginWithPin`; sets secure cookie.
- Basic layout shell with nav tabs.
- Players CRUD (list, create, deactivate). Mobile forms. (Photos removed from scope.)
- Seed `teams` + initial PIN migration.

## Phase 2 – Seasons & Fixtures
- Seasons CRUD with `is_current` toggle (enforce single current via trigger).
- Fixtures CRUD linked to seasons; list grouped by season with badges.
- Fixture detail showing games and quick-create game form.

## Phase 3 – Live Scoring (501)
- Game model finalized; scoring screen with numpad, finish suggestions, undo.
- Event write API (`recordVisit`, `undoLastVisit`) + optimistic UI.
- Checkout validation (double-out) and bust logic.
- Post-game summary and ability to mark winner.

## Phase 4 – Stats, Dashboards, Export
- SQL views for player and team stats (3DA, first 9, keep/break, checkout%, buckets).
- Player dashboard with filters (season, opponent, home/away, date range).
- Team dashboard + season comparison cards.
- Exports: CSV for players, team, fixtures, events; JSON for events.

## Phase 5 – Polish / Resilience
- Performance check (Lighthouse mobile; 4G target <2s).
- Offline guardrail on scoring page (retain local state if connection blips).
- Accessibility sweep (focus order, hit targets, contrasts).

## Sequencing Notes
- Prioritize server actions for all writes; reads via Supabase JS with caching.
- Add Supabase Realtime on games/fixtures after base CRUD is stable.
- Build finish suggestion lookup as static `finish-routes.ts` to keep client fast.
