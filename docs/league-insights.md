# League insights
A separate /league-insights page consumes the same verified public League, Team,
Fixture and WeekDate requests as the league snapshot. /api/league-insights requires
the existing signed application session and shares a persistent public-data cache with the snapshot. Automatic refresh
runs every five minutes only from Monday 20:00 through Tuesday 23:59 in
Europe/London (including BST/GMT). Outside this window data remains cached.
The Refresh button sends ?refresh=1, invalidates that shared cache, and awaits
new upstream requests. A cold cache fetches once at any time; no background cron
is required. Automatic refresh runs while either page is open and visible.

Fixture league_id and home_team_id/away_team_id link completed results to teams.
Tournament weeks and placeholder teams are excluded using the source's existing
logic; official points and sorting retain deductions and tie-breakers. Insights
exclude missing, negative, fractional or zero-total scores rather than treating
unknown scores as losses. All performance sample counts are displayed.
This page uses external league match results, not individual player scoring records
from the local database. It does not infer other teams' averages or checkouts.

## Comparisons
Match W/D/L, leg share, last five by league week, home/away, all-team comparison,
selectable head-to-head and common-opponent leg shares with sample counts.
Common-opponent results are descriptive; venue, timing and line-ups can differ.
Same-week ties sort by fixture ID deterministically, not claimed actual play time.

## Forecast
Ridge least-squares model:
home leg share = 0.5 + home strength - away strength + venue coefficient.
Each fixture has equal weight; penalty 5 applies to all coefficients (five neutral
fixture equivalents). Outputs are clamped to 5–95%. Deduction points are excluded
from strength. At least five completed fixtures per participant are required.
Expected legs are supplied only if all valid observed games have the same total;
otherwise only expected leg share is displayed. No exact score, match win odds,
promotion probability or final position is claimed.
Upcoming fixtures must be later than the latest played league week. Earlier
unplayed fixtures are counted as unresolved, rather than mislabelled upcoming.

## Accuracy and limits
Walk-forward backtest fits only strictly earlier weeks, after 20 training games.
It reports mean absolute home-score error in legs and compares a training-only
league home-share baseline on exactly the same held-out fixtures. If the model
does not beat the baseline the page explicitly says so. Undated games are excluded
from form and backtesting. The test orders by schedule week; retroactively updated
results and postponements prevent claiming true historical forecast performance.
No confidence intervals or independent-leg win probabilities are invented.
The same source caps (500 fixtures globally, 300 WeekDate records) are preserved;
a reached cap is flagged. Third-party availability/schema and partial schedules
limit coverage. Returned API data includes only selected score fields, not raw
team login codes or source administrative metadata.

## Verification
Jest covers fixture links, common opponents, deductions, invalid scores, tournament/
bye exclusion, form, venue, model behaviour, minimum samples, variable match sizes,
unresolved fixtures and no same-week leakage in backtesting.
The Verify live league insights workflow compares the actual implementation with
browser-captured source records and all rendered standings, exercises authenticated
and unauthenticated API calls, navigates the mobile page, switches opponents,
checks horizontal overflow and saves mobile/desktop screenshots and live JSON.
