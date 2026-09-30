import { getHonours } from "../src/lib/honours";
import type { PlayerCard } from "../src/data/stats";

const player = (name: string, overrides: Partial<PlayerCard> = {}): PlayerCard => ({
  player_id: name, name, legs_played: 8, legs_won: 4,
  matches_played: 4, three_dart_avg: 55, first_nine_avg: 65,
  checkout_pct: 40, checkout_attempts: 10, checkout_hits: 4,
  first_nine_legs: 8, recorded_wins: 4, darts_per_leg_won: 24,
  total_darts: 200, scoring_visits: 70, hundred_plus: 14,
  hundred_forty_plus: 2, sixty_plus: 30, twenty_six: 1,
  one_eighty: 0, high_finish: 100, ...overrides
});
const award = (players: PlayerCard[], id: string) => getHonours(players).find(h => h.id === id)!;

it("requires six legs for rate awards but preserves single checkout achievements", () => {
  const rookie = player("Rookie", { legs_played: 1, legs_won: 1, three_dart_avg: 100, high_finish: 170 });
  expect(award([rookie], "scoring").leaders).toHaveLength(0);
  expect(award([rookie], "high-finish").leaders[0].player.name).toBe("Rookie");
  expect(award([], "scoring").value).toBe("—");
});
it("compares win rates rather than volume", () => {
  const more = player("More", { legs_played: 20, legs_won: 10 });
  const better = player("Better", { legs_played: 8, legs_won: 6 });
  expect(award([more, better], "win-rate").leaders[0].player.name).toBe("Better");
});
it("normalises tons by visits so a longer schedule does not win automatically", () => {
  const more = player("More", { scoring_visits: 200, hundred_plus: 30 });
  const better = player("Better", { scoring_visits: 50, hundred_plus: 10 });
  expect(award([more, better], "tons").leaders[0].player.name).toBe("Better");
});
it("requires enough recorded samples for specialist awards", () => {
  const sparse = player("Sparse", { first_nine_legs: 5, checkout_attempts: 9, recorded_wins: 2, scoring_visits: 29 });
  for (const id of ["first-nine", "checkout", "speed", "tons"]) {
    expect(award([sparse], id).leaders).toHaveLength(0);
  }
});
it("rewards a lower finishing dart average", () => {
  expect(award([player("Slow"), player("Fast", { darts_per_leg_won: 21 })], "speed").leaders[0].player.name).toBe("Fast");
});
it("shares honours for exact equal rates despite different appearances", () => {
  const a = player("A", { legs_played: 8, legs_won: 4 });
  const b = player("B", { legs_played: 12, legs_won: 6 });
  expect(award([b, a], "win-rate").leaders.map(l => l.player.name)).toEqual(["A", "B"]);
});
it("does not treat rounded equal display values as equal performances", () => {
  expect(award([player("A", { three_dart_avg: 55.01 }), player("B", { three_dart_avg: 55.02 })], "scoring").leaders.map(l => l.player.name)).toEqual(["B"]);
});
it("ignores missing or non-finite measurements", () => {
  expect(award([player("Missing", { three_dart_avg: null }), player("Invalid", { three_dart_avg: NaN })], "scoring").leaders).toHaveLength(0);
});
