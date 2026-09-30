# Live league snapshot

The dashboard reads Barnsley Townend Monday Night League 2 from the public
[league website](https://barnsley-darts-flow.base44.app/). No standings or points
are stored as constants. Work is on `build/live-league-snapshot`.

## Investigation

Chromium was run against the public SPA in a fresh browser session. Its home
page already shows both league tables; no league selector is needed. The
investigation also opens West Green's fixtures and returns to League Tables.
Network responses and the loaded JavaScript were inspected, not just HTML.

- App ID: `69c9134c04089b8c59d07d0e`
- API root: `https://barnsley-darts-flow.base44.app/api/apps/69c9134c04089b8c59d07d0e/entities/`
- Investigated bundle: `https://barnsley-darts-flow.base44.app/assets/index-eIT8_834.js`
- League ID observed: `69c97c9a7b6e3a7a0957fb8e`
- West Green team ID observed: `69ca24604c3ee17528ed2d9e`

IDs above document the investigation. The implementation resolves the league and
team from names on each fetch rather than relying on these record IDs.

## Exact requests

All four table requests use GET and return JSON arrays:

1. `https://barnsley-darts-flow.base44.app/api/apps/69c9134c04089b8c59d07d0e/entities/League`
2. `https://barnsley-darts-flow.base44.app/api/apps/69c9134c04089b8c59d07d0e/entities/Team`
3. `https://barnsley-darts-flow.base44.app/api/apps/69c9134c04089b8c59d07d0e/entities/Fixture?sort=-updated_date&limit=500`

4. `https://barnsley-darts-flow.base44.app/api/apps/69c9134c04089b8c59d07d0e/entities/WeekDate?sort=-created_date&limit=300`

League and Team have no query parameters. Fixture uses descending update time
and a global limit of 500, exactly as `Fixture.list("-updated_date", 500)`
in the site's home-page code. The initial investigation returned 2 leagues,
28 teams, 393 fixtures and 85 WeekDate records.

The home page also loads `Stat?sort=-created_date&limit=300` for individual
achievements; it does not affect standings. WeekDate is
essential: tournament weeks are excluded from the table before aggregation. No separate standings
entity/request was used: the table is computed client-side.

## Relevant raw response fields

Observed Team response containing West Green (unrelated code and creator
metadata omitted):

```json
{
  "name": "West Green",
  "number": 15,
  "league_id": "69c97c9a7b6e3a7a0957fb8e",
  "id": "69ca24604c3ee17528ed2d9e",
  "created_date": "2026-03-30T07:21:04.988000",
  "updated_date": "2026-03-30T11:07:12.974000",
  "is_sample": false
}
```

Observed latest completed West Green fixture, selected fields:

```json
{
  "id": "69ca3a28bb5bf212131711dd",
  "league_id": "69c97c9a7b6e3a7a0957fb8e",
  "home_team_id": "69ca24604c3ee17528ed2d9e",
  "home_team_name": "West Green",
  "away_team_id": "69ca25256070a8a06da7b56d",
  "away_team_name": "Ring o Bells",
  "home_score": 10,
  "away_score": 2,
  "played": true,
  "week": 25
}
```

League records provide `id` and `name`. Teams and fixtures link through
`league_id`; fixture home/away IDs link to Team IDs. Deductions are on Team's
`points_deduction` field. Results are home/away scores on Fixture records.

## Source calculation

The bundle's `rD` table component:

1. Takes teams and fixtures for the league. For each fixture, the homepage finds
   the first WeekDate record with matching league_id and week. If that record has
   a truthy tournament_name, the fixture is excluded, even if marked played.
   Tournament and knockout results therefore do not contribute league points.
2. Excludes teams whose number is 14 or whose lower-case name contains "no game".
3. For each team, includes fixtures marked `played` where it is home or away.
4. Counts those fixtures as played; sums its own scores as legs for and opposing
   scores as legs against. Null/absent scores on played fixtures count as zero.
5. Computes `legDiff = legsFor - legsAgainst`.
6. Computes `points = legsFor - (points_deduction || 0)`.
7. Sorts descending by points, then leg difference, then legs for. Fully tied
   teams retain incoming Team API order, using stable JavaScript sort.
8. Assigns positions sequentially from one; it does not assign shared positions.

There is no extra win/draw points bonus or alphabetical tie-break in that code.
For Barugh Green Club the observed legs-for value is 90, deduction 4, points 86.

## Working code and output

- `src/lib/liveLeague.ts`: direct anonymous reader
  `getWestGreenLeagueContext()`, source calculation and window selection.
- `src/data/leagueSnapshot.ts`: five-minute server cache.
- `src/app/api/league-snapshot/route.ts`: signed-session GET route.
- `src/app/dashboard/LeagueSnapshot.tsx`: dashboard panel.
- `__tests__/liveLeague.test.ts`: deductions, tie-breaks, stable ties, window
  boundaries, missing targets, API failures and schema changes.
- `scripts/investigate-league.mjs`: live Chromium parity check.
- `.github/workflows/investigate-league.yml`: runs that check when the
  investigation script changes on the build branch.

Usage:

```ts
import { getWestGreenLeagueContext } from "@/lib/liveLeague";
const context = await getWestGreenLeagueContext();
```

The function returns league, leagueId, targetTeam, targetPosition, targetPoints,
standings, checkedAt and source. Each row has position, teamId, team, points,
played, legsFor, legsAgainst, legDiff and deduction; only West Green has
`target: true`. The window clamps to league boundaries and never wraps or
fills from the other side.

Live verification output is recorded in the Actions job and its
`public-league-investigation` artifact as `live-result.json`.
The script compares all 14 calculated rows against the rendered source table,
then separately calls the anonymous server reader and checks the returned
window against the rendered table.

## Authentication and reliability

No administrator login is performed. The source browser's `User/me` request
returns 401 while its public league records return 200. The live verification
separately tests Node fetch with no cookies or Authorization header. Our own
application's API route still requires its existing signed team session.

This is an undocumented third-party API. Changes to entity permissions, schema,
app ID, record names, or the source's calculation may require an update.
The source's 500-fixture cap is deliberately preserved for parity; if the source
grows beyond these limits, its displayed table may itself omit results. Do not increase
our cap alone without verifying the website's behaviour.

The app refreshes on opening the dashboard and every five minutes while visible.
The server cache may serve an earlier result while revalidating; the actual
source-check timestamp is displayed. Errors never produce invented standings.
Previously loaded data remains visible with a refresh-failure message, or an
unavailable message is shown if no result was obtained. The full source table
link remains available. A future API/calc change should be investigated again
using the supplied live verification script.

## Verified live result

At 2026-09-30 22:15 UTC, the public site and direct anonymous server fetch agreed:

| Position | Team | Points |
| --- | --- | --- |
| 1 | Cons Club | 117 |
| 2 | West Green | 117 |
| 3 | Pack | 112 |
| 4 | Staincross | 111 |
| 5 | Higham B | 110 |

These figures document a live verification run; they are not application data
or a fallback. [Live browser/API verification run](https://github.com/CosgroDev/WestGreenDartsApp/actions/runs/36784447495)
compared all 14 rows, including the deduction, and separately checked the server
reader's dynamic window. Subsequent verification also starts our production
Next server with a temporary local test session, checks signed-session protection
and API parity, and checks the rendered snapshot at a 390-pixel mobile viewport.
\n\n## Scheduled refresh (updated)\nBoth snapshot and insights share persistent source data. Automatic checks run every\nfive minutes only Monday 20:00 through Tuesday 23:59 Europe/London while a page is\nopen and visible. Off-window navigation uses cached data; a cold cache fills once.\nManual Refresh always requests ?refresh=1, invalidates the shared source tag and\nawaits a fresh upstream response. Scheduled age checks also run server-side.\nThis supersedes the earlier unconditional five-minute cache descriptions.\n