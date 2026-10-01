# Season performance leaderboard

The dashboard defaults to Overall performance, with Leg win % available as an alternative. This is a transparent descriptive index, not a fitted model or probability of winning.

| Measure | Weight | Team-average prior |
|---|---:|---:|
| Leg win rate | 35% | 12 completed legs |
| Three-dart average | 25% | 90 recorded darts |
| First 9 average | 15% | 6 recorded opening nines |
| Checkout visit success | 15% | 20 finishing visits |
| 100+ visit rate | 10% | 60 recorded visits |

Raw season rates come from the existing completed league-leg statistics; practice is excluded. Three-dart average is credited points / recorded darts × 3: busts contribute zero points and their darts still count. First 9 pools the first three West Green visits in completed legs with nine recorded opening darts, using total opening points / opening darts × 3. Team baselines pool active players and weight each raw value by its relevant exposure. No further database reads are required.

For each measure:

1. Adjusted value = (sample × raw player value + prior × pooled team value) / (sample + prior).
2. Percentile = 100 × (number of comparison players below + half the number tied) / comparison group size.
3. Points contributed = percentile × weight / 100.
4. Overall performance = the sum of the five contributions.

For example, 4 wins in 4 legs with a 50% team baseline adjusts from 100% to 62.5% using the 12-leg prior. Priors represent a fixed smoothing budget; they are not actual additional games or confidence intervals.

A player qualifies after six completed legs, thirty recorded visits and observations for all five measures. Qualified players appear first; other players are explicitly provisional with the missing requirements shown. Qualified players form the percentile reference group. Until anyone qualifies, recorded provisional players form the reference, and no official ranking positions are awarded. Missing components receive neutral 50-percentile credit, never a fabricated raw zero. A player with no observations has no overall score.

Tied qualifying scores share a competition rank (1, 1, 3). Display ordering within a tie uses name, then player ID. Calculations and sorting use full precision; the UI rounds to one decimal place. A one-player or completely tied reference group has a neutral score of 50. As a relative index, the score can change when the reference group changes; it should not be compared across seasons as an absolute ability rating.

Scoring measures are correlated, so weights are deliberately budgeted rather than assigning points to every visible count. 140+ and 180 visits are already included in the 100+ rate and scoring averages. Highest checkout is a single achievement. Darts per won leg conditions on winning. Those figures, 60+ visits, 26s, match appearances and recent form remain visible as context.

Checkout success counts checkouts divided by visits starting on a possible finish, including busts. The app does not record the number of darts actually aimed at doubles. Opponent strength is not incorporated in this player index.

The weights, priors and qualification thresholds are explicit product choices, not empirically proven optimal coefficients. The player breakdown and “How the performance score is calculated” explanation expose every calculation input. If the team later wants a predictive ability ranking, that requires reliable opponent-level histories and evaluation on held-out results.

Implementation: `src/lib/playerPerformance.ts`.
