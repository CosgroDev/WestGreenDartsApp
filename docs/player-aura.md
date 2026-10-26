# Player aura (flair)

Aura is a flair index out of 100, separate from the performance score. Performance measures how good a player is; aura measures how exciting they are to watch. It uses only the existing season `PlayerCard` stats, so no extra database reads are needed.

| Measure | Weight | Notes |
|---|---:|---|
| 180 rate | 30% | 180s per visit, smoothed toward the team rate (60-visit prior) |
| 140+ rate | 25% | 140+ visits per visit, smoothed (60-visit prior) |
| Biggest checkout | 20% | Single best finish; an achievement, so not smoothed |
| Darts per leg won | 15% | Fewer is flashier; smoothed (3-win prior) |
| First 9 average | 10% | Bold starts; smoothed (6-opening-nine prior) |

Each measure is turned into a midrank percentile against players with 6+ completed legs (everyone with a recorded leg until anyone reaches six), using the same smoothing and percentile helpers as the performance score. 180s, 140+ visits and big finishes earn zero if the player has never produced one, however quiet the field is. Missing evidence (e.g. no recorded wins) gets a neutral 50.

| Score | Aura |
|---:|---|
| 80+ | 🔥 Inferno |
| 60+ | ⚡ Electric |
| 40+ | ✨ Sparkling |
| 20+ | 🌙 Glimmer |
| <20 | 🪨 Steady |

Players under six legs show "(forming)". A signature trait (Maximum merchant, Heavy hitter, Big-fish hunter, Speed demon, Fast starter) is shown when a measure is at the 60th percentile or above, picking the one with the largest weighted percentile.

26s are deliberately excluded. Like the performance index, aura is relative: it changes with the comparison group and is not an absolute rating. Weights, priors and tier cut-offs are team policy.

Implementation: `src/lib/playerAura.ts`; shown on the dashboard leaderboard.
