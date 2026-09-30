import { buildLeagueInsights, fitStrengths, predictedHomeShare, backtest, type InsightResult } from "../src/lib/leagueInsights";
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
test("forecasts require five samples, reject earlier unplayed games and variable-length score estimates", () => {
  const played = Array.from({ length: 5 }, (_, i) => fixture(String(i), "w", "a", 8, 4, i + 1));
  const result = buildLeagueInsights(data([...played,
    fixture("next", "w", "a", null, null, 6, false),
    fixture("new", "w", "b", null, null, 7, false),
    fixture("missed", "w", "a", null, null, 1, false)]));
  expect(result.forecasts[0].expectedLegs).toBeGreaterThan(6);
  expect(result.forecasts[1].share).toBeNull();
  expect(result.unresolvedFixtures).toBe(1);
  expect(result.forecasts).toHaveLength(2);
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
