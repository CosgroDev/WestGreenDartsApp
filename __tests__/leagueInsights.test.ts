import { buildLeagueInsights, projectSeason, fitStrengths, predictedHomeShare, backtest, type InsightResult } from "../src/lib/leagueInsights";
const teams = [
  { id: "w", name: "West Green", league_id: "l", number: 15 },
  { id: "a", name: "Alpha", league_id: "l", points_deduction: 4 },
  { id: "b", name: "Beta", league_id: "l" },
  { id: "bye", name: "No game", league_id: "l", number: 14 }
];
const fixture = (id: string, home: string, away: string, hs: number | null, as: number | null, week: number, played = true) =>
  ({ id, league_id: "l", home_team_id: home, away_team_id: away, home_score: hs, away_score: as, week, played });
const data = (fixtures: ReturnType<typeof fixture>[], weekDates: {id: string; league_id: string; week: number; tournament_name: string}[] = []) =>
  ({ league: { id: "l", name: "League" }, teams, fixtures, weekDates, checkedAt: "2026-09-30T00:00:00Z", source: "https://example.com/" });
test("links direct and common opponents, preserving deductions while separating incomplete scores", () => {
  const result = buildLeagueInsights(data([
    fixture("1", "w", "a", 8, 4, 1),
    fixture("2", "b", "w", 3, 9, 2),
    fixture("3", "a", "b", 7, 5, 2),
    fixture("cup", "w", "a", 12, 0, 3),
    fixture("bye", "w", "bye", 12, 0, 4),
    fixture("bad", "w", "a", null, 0, 5)
  ], [{ id: "cup-week", league_id: "l", week: 3, tournament_name: "Cup" }]));
  expect(result.results).toHaveLength(3);
  expect(result.omittedResults).toBe(1);
  const west = result.teams.find(t => t.teamId === "w")!;
  expect(west).toMatchObject({ played: 2, wins: 2, legsFor: 17, legsAgainst: 7 });
  expect(west.share).toBeCloseTo(17 / 24);
  expect(result.teams.find(t => t.teamId === "a")?.points).toBe(7);
  const opponent = result.opponents.find(t => t.teamId === "a")!;
  expect(opponent.direct).toHaveLength(1);
  expect(opponent.common).toEqual([{ team: "Beta", target: { played: 1, share: 9 / 12 }, opponent: { played: 1, share: 7 / 12 } }]);
});
test("draws, venues and form use schedule week, not fetched array order", () => {
  const result = buildLeagueInsights(data([fixture("1", "w", "a", 6, 6, 1), fixture("2", "a", "w", 8, 4, 2)]));
  expect(result.teams.find(t => t.teamId === "w")).toMatchObject({
    form: ["L", "D"], wins: 0, draws: 1, losses: 1,
    home: { played: 1, share: 0.5 }, away: { played: 1, share: 1 / 3 }
  });
});
test("neutral data stays neutral; repeated wins improve strength and venue reverses forecasts", () => {
  const neutral = fitStrengths(["w", "a"], []);
  expect(predictedHomeShare(neutral, "w", "a")).toBe(0.5);
  const results: InsightResult[] = Array.from({ length: 12 }, (_, i) => ({
    id: String(i), week: i + 1, homeId: i % 2 ? "a" : "w", awayId: i % 2 ? "w" : "a",
    home: "", away: "", homeScore: i % 2 ? 3 : 9, awayScore: i % 2 ? 9 : 3
  }));
  const model = fitStrengths(["w", "a"], results);
  expect(model.strengths.w).toBeGreaterThan(model.strengths.a);
  expect(predictedHomeShare(model, "w", "a")).toBeGreaterThan(0.5);
  expect(predictedHomeShare(model, "a", "w")).toBeLessThan(0.5);
  expect(model.home).toBeCloseTo(0);
});
test("forecasts require five samples, include earlier unplayed games and variable-length score estimates", () => {
  const played = Array.from({ length: 5 }, (_, i) => fixture(String(i), "w", "a", 8, 4, i + 1));
  const result = buildLeagueInsights(data([...played,
    fixture("next", "w", "a", null, null, 6, false),
    fixture("new", "w", "b", null, null, 7, false),
    fixture("missed", "w", "a", null, null, 1, false)]));
  expect(result.forecasts[0].expectedLegs).toBeGreaterThan(6);
  expect(result.forecasts.find(f => f.id === "new")?.share).toBeNull();
  expect(result.unresolvedFixtures).toBe(1);
  expect(result.forecasts).toHaveLength(3);
  expect(result.forecasts.find(f => f.id === "missed")?.unresolved).toBe(true);
  const mixed = buildLeagueInsights(data([...played, fixture("mixed", "w", "a", 6, 4, 6), fixture("next", "w", "a", null, null, 7, false)]));
  expect(mixed.matchLegs).toBeNull();
  expect(mixed.forecasts[0].expectedLegs).toBeNull();
  expect(mixed.forecasts[0].share).not.toBeNull();
});
test("backtest excludes the whole predicted week from training and reports both errors", () => {
  const training: InsightResult[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i), week: 1, homeId: "w", awayId: "a", home: "", away: "", homeScore: 6, awayScore: 6
  }));
  const heldOut = { ...training[0], id: "held", week: 2, homeScore: 12, awayScore: 0 };
  expect(backtest(["w", "a"], [...training, heldOut])).toEqual({ matches: 1, meanAbsoluteLegError: 6, baselineLegError: 6 });
  expect(backtest(["w", "a"], training).matches).toBe(0);
});

const standing = (id: string, legsFor: number, legsAgainst: number, deduction = 0) => ({
  teamId: id, team: id, position: id === "w" ? 1 : 2, played: 5,
  legsFor, legsAgainst, deduction, legDiff: legsFor - legsAgainst, points: legsFor - deduction
});
test("season projection preserves fixture totals, deductions and official tie breaks", () => {
  const rows = [standing("w", 12, 12), standing("a", 16, 12, 4)];
  const projection = projectSeason(rows, [{ id: "last", week: 6, homeId: "w", awayId: "a" }],
    fitStrengths(["w", "a"], []), 12, "w", ["w", "a"], []);
  expect(projection.table.reduce((sum, t) => sum + t.legsFor, 0)).toBe(40);
  expect(projection.table.reduce((sum, t) => sum + t.legsAgainst, 0)).toBe(36);
  expect(projection.table.reduce((sum, t) => sum + t.points, 0)).toBe(36);
  expect(projection.target).toMatchObject({ points: 18, position: 2, remaining: 1, additionalLegs: 6 });
  expect(projection.table.find(t => t.teamId === "a")?.deduction).toBe(4);
  expect(projection.positionRange).toBeNull();
  expect(rows[0].points).toBe(12); // source standings are never mutated
});
test("projected exact ties retain Team API order rather than current table order", () => {
  const p = projectSeason([standing("w", 12, 12), standing("a", 12, 12)],
    [{ id: "last", week: 6, homeId: "w", awayId: "a" }], fitStrengths(["w", "a"], []),
    12, "w", ["a", "w"], []);
  expect(p.target.position).toBe(2);
});
test("historical-error season scenarios are repeatable and keep integer scores within bounds", () => {
  const args = [[standing("w", 12, 12), standing("a", 12, 12)],
    [{ id: "last", week: 6, homeId: "w", awayId: "a" }], fitStrengths(["w", "a"], []),
    12, "w", ["w", "a"], Array.from({ length: 24 }, (_, i) => [-1, 0, 1][i % 3])] as const;
  const p = projectSeason([...args[0]], [...args[1]], args[2], args[3], args[4], [...args[5]], [...args[6]]);
  const again = projectSeason([...args[0]], [...args[1]], args[2], args[3], args[4], [...args[5]], [...args[6]]);
  expect(p).toEqual(again);
  expect(p.iterations).toBe(2000);
  expect(p.distribution.reduce((sum, r) => sum + r.fraction, 0)).toBeCloseTo(1);
  expect(p.pointsRange!.low).toBeGreaterThanOrEqual(12);
  expect(p.pointsRange!.high).toBeLessThanOrEqual(24);
  expect(Number.isInteger(p.pointsRange!.low)).toBe(true);
});
test("all unplayed fixtures, including earlier weeks, are included in the final forecast", () => {
  const played = Array.from({ length: 6 }, (_, i) => [
    fixture("wa"+i, "w", "a", 8, 4, i+1),
    fixture("ab"+i, "a", "b", 6, 6, i+1),
    fixture("bw"+i, "b", "w", 5, 7, i+1)
  ]).flat();
  const result = buildLeagueInsights(data([...played,
    fixture("late", "w", "a", null, null, 1, false),
    fixture("future", "a", "b", null, null, 8, false)]));
  expect(result.projection).not.toBeNull();
  expect(result.projection!.target.remaining).toBe(1);
  expect(result.remainingMatches).toBe(2);
  expect(result.coverageVerified).toBe(false);
  expect(result.projection!.table.reduce((sum, t) => sum + t.additionalLegs, 0)).toBeCloseTo(24);
});
test("final-position forecasts stop for missing scores, inconsistent match length or truncated data", () => {
  const played = Array.from({ length: 5 }, (_, i) => fixture(String(i), "w", "a", 8, 4, i+1));
  const incomplete = buildLeagueInsights(data([...played, fixture("bad", "w", "a", null, 3, 6)]));
  expect(incomplete.projection).toBeNull();
  expect(incomplete.projectionUnavailable).toContain("missing or invalid");
  const mixed = buildLeagueInsights(data([...played, fixture("short", "w", "a", 6, 4, 6)]));
  expect(mixed.projection).toBeNull();
  const capped = buildLeagueInsights(data(Array.from({ length: 500 }, (_, i) => fixture(String(i), "w", "a", 8, 4, i+1))));
  expect(capped.projection).toBeNull();
  expect(capped.projectionUnavailable).toContain("record limit");
});
test("a finished season has no additional legs and its current ranking is final", () => {
  const p = projectSeason([standing("w", 20, 10), standing("a", 10, 20)], [],
    fitStrengths(["w", "a"], []), 12, "w", ["w", "a"], []);
  expect(p.target).toMatchObject({ points: 20, position: 1, remaining: 0, additionalLegs: 0 });
  expect(p.positionRange).toEqual({ low: 1, high: 1 });
});
