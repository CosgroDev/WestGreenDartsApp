import type { PlayerCard } from "../src/data/stats";
import { AURA_METRICS, AURA_TIERS, auraTier, buildPlayerAuras } from "../src/lib/playerAura";

const player = (name: string, o: Partial<PlayerCard> = {}): PlayerCard => ({
  player_id: name, name, legs_played: 12, legs_won: 6, three_dart_avg: 50, first_nine_avg: 60,
  checkout_pct: 20, twenty_six: 4, one_eighty: 0, high_finish: 80, sixty_plus: 30, hundred_plus: 12,
  hundred_forty_plus: 0, darts_per_leg_won: 30, total_darts: 300, matches_played: 6,
  scoring_visits: 100, checkout_attempts: 20, checkout_hits: 4, first_nine_legs: 12, recorded_wins: 6, ...o,
});

it("budgets 100 points and has descending tier thresholds", () => {
  expect(AURA_METRICS.reduce((t, m) => t + m.weight, 0)).toBe(100);
  expect(AURA_TIERS.map(t => t.min)).toEqual([...AURA_TIERS.map(t => t.min)].sort((a, b) => b - a));
  expect(auraTier(85).id).toBe("inferno");
  expect(auraTier(0).id).toBe("steady");
});
it("gives the flashier player the bigger aura and names their trait", () => {
  const flash = player("Flash", { one_eighty: 4, hundred_forty_plus: 10, high_finish: 164, darts_per_leg_won: 20 });
  const plain = player("Plain");
  const auras = buildPlayerAuras([flash, plain]);
  expect(auras.get("Flash")!.score!).toBeGreaterThan(auras.get("Plain")!.score!);
  expect(auras.get("Flash")!.tier!.min).toBeGreaterThan(auras.get("Plain")!.tier!.min);
  expect(auras.get("Flash")!.trait).toBe("Maximum merchant");
});
it("rewards fewer darts per win and earns nothing for spectacle never produced", () => {
  const quick = player("Quick", { darts_per_leg_won: 18 });
  const slow = player("Slow", { darts_per_leg_won: 40 });
  const a = buildPlayerAuras([quick, slow]);
  const speed = (n: string) => a.get(n)!.components.find(c => c.id === "speed")!.percentile;
  expect(speed("Quick")).toBeGreaterThan(speed("Slow"));
  expect(a.get("Slow")!.components.find(c => c.id === "maximums")!.percentile).toBe(0);
});
it("flags provisional players and gives no aura without a record", () => {
  const a = buildPlayerAuras([player("Rookie", { legs_played: 2 }), player("Nobody", { legs_played: 0, scoring_visits: 0, high_finish: null })]);
  expect(a.get("Rookie")!.provisional).toBe(true);
  expect(a.get("Nobody")!.score).toBeNull();
  expect(a.get("Nobody")!.tier).toBeNull();
});
