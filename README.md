# West Green Darts

A mobile-first team manager for the West Green darts team: live 501 scoring, fixtures, player and team statistics, practice drills, a live league table and AI-written match reviews. One shared PIN unlocks every device.

Built with Next.js 15 (App Router), React 19, Tailwind and Supabase Postgres.

## Start here

- [Getting started](docs/getting-started.md) — environment variables, database setup, running locally.
- [Architecture](docs/architecture.md) — how the app is put together.
- [Improvement plan](docs/improvement-plan.md) — the current work packages.

## Checks

Run these before pushing. CI runs the same set on every pull request.

```sh
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:database
npm run build
```
