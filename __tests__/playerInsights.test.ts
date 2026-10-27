import { summariseLeg, type Visit } from "../src/data/matchSummary";
import type { PlayerCard } from "../src/data/stats";
import { derivePlayerSeason, squadContext, type InsightLeg, type InsightMatch } from "../src/lib/playerInsights";
import { PLAYER_SYSTEM_PROMPT } from "../src/lib/aiCoaching";

const v = (score: number, remainingAfter: number, extra: Partial<Visit> = {}): Visit => ({
  score,
  darts: 3,
  remainingAfter,
  isBust: false,
  isCheckout: false,
  ...extra
});

const leg = (id: string, winner: "west" | "opponent", visits: Visit[], westStarted: boolean | null): InsightLeg => ({
  ...summariseLeg(id, winner, visits),
  westStarted
});

// 15-darter: on 40 after 12 darts, out with the first dart at the double.
const quickWin = (id: string, westStarted = true) =>
  leg(id, "west", [v(100, 401), v(140, 261), v(100, 161), v(121, 40), v(40, 0, { isCheckout: true, darts: 1 })], westStarted);
// Lost while on 129: bust it, then the opponent won.
const lostOnFinish = (id: string, westStarted = false) =>
  leg(id, "opponent", [v(26, 475), v(45, 430), v(60, 370), v(81, 289), v(100, 189), v(60, 129), v(140, 129, { isBust: true })], westStarted);

const match = (date: string, home: boolean, legs: InsightLeg[]): InsightMatch => ({
  date,
  opponentTeam: "Red Lion",
  opponentPlayer: "Bob",
  home,
  legs
});

describe("derivePlayerSeason", () => {
  // Match 1 (home): lost the opener, won the next two — a comeback via a decider.
  // Match 2 (away): won the opener, lost the next two.
  const d = derivePlayerSeason([
    match("2026-10-08T19:30:00Z", false, [quickWin("b1"), lostOnFinish("b2"), lostOnFinish("b3", true)]),
    match("2026-10-01T19:30:00Z", true, [lostOnFinish("a1"), quickWin("a2", false), quickWin("a3")])
  ]);

  it("orders the timeline by date and rolls up each match", () => {
    expect(d.record).toMatchObject({ matches: 2, matchWins: 1, matchLosses: 1, legsWon: 3, legsLost: 3 });
    expect(d.matchTimeline.map((m) => m.date)).toEqual(["2026-10-01", "2026-10-08"]);
    expect(d.matchTimeline[0]).toMatchObject({ venue: "home", result: "win", legs: "2-1", bestLegDarts: 13 });
  });

  it("splits legs by throw order", () => {
    expect(d.throwOrder?.throwingFirst).toMatchObject({ legs: 3, won: 2 });
    expect(d.throwOrder?.throwingSecond).toMatchObject({ legs: 3, won: 1 });
  });

  it("reads pressure legs: openers, deciders and comebacks", () => {
    expect(d.pressure.openingLegs).toMatchObject({ legs: 2, won: 1 });
    expect(d.pressure.deciders).toMatchObject({ legs: 2, won: 1 });
    expect(d.pressure.matchesAfterLosingFirstLeg).toBe(1);
    expect(d.pressure.comebackWins).toBe(1);
  });

  it("breaks finishing down by the range each visit started from", () => {
    const byRange = Object.fromEntries(d.finishing.byRange.map((r) => [r.range, r]));
    expect(byRange["2-40"]).toMatchObject({ visits: 3, hits: 3, pct: 100 });
    expect(byRange["101-130"]).toMatchObject({ visits: 3, hits: 0, busts: 3 });
    expect(byRange["131-170"]).toMatchObject({ visits: 3, hits: 0 });
    expect(d.finishing.oneDartFinishes).toBe(3);
    expect(d.finishing.favouriteCheckouts).toEqual([{ finish: 40, times: 3 }]);
  });

  it("separates home from away and won legs from lost legs", () => {
    expect(d.venue.home).toMatchObject({ legs: 3, won: 2 });
    expect(d.venue.away).toMatchObject({ legs: 3, won: 1 });
    expect(d.wonVsLostLegs.won.threeDartAvg!).toBeGreaterThan(d.wonVsLostLegs.lost.threeDartAvg!);
    expect(d.speed).toMatchObject({ fastestLegDarts: 13, legsWonIn18OrFewer: 3 });
  });

  it("holds back the trend until there are enough matches", () => {
    expect(d.trend).toBeNull();
  });
});

const card = (player_id: string, overrides: Partial<PlayerCard> = {}): PlayerCard => ({
  player_id, name: player_id, legs_played: 12, legs_won: 6, three_dart_avg: 45, first_nine_avg: 50,
  checkout_pct: 25, twenty_six: 2, one_eighty: 0, high_finish: 80, sixty_plus: 30, hundred_plus: 10,
  hundred_forty_plus: 2, darts_per_leg_won: 24, total_darts: 300, matches_played: 4, scoring_visits: 100,
  checkout_attempts: 24, checkout_hits: 6, first_nine_legs: 12, recorded_wins: 6, ...overrides
});

describe("squadContext", () => {
  const cards = [
    card("me", { three_dart_avg: 52, darts_per_leg_won: 20 }),
    card("a", { three_dart_avg: 55, darts_per_leg_won: 22 }),
    card("b", { three_dart_avg: 40, darts_per_leg_won: 26 }),
    card("idle", { legs_played: 0, legs_won: 0, three_dart_avg: null })
  ];

  it("ranks the player against squad members who have played", () => {
    const s = squadContext("me", cards)!;
    expect(s.squadSize).toBe(3);
    expect(s.threeDartAvg).toMatchObject({ value: 52, rank: 2, of: 3 });
    // Fewer darts per leg won is better.
    expect(s.dartsPerLegWon).toMatchObject({ rank: 1, of: 3 });
    expect(s.performanceRating).not.toBeNull();
  });

  it("returns null for a player with no legs", () => {
    expect(squadContext("idle", cards)).toBeNull();
  });
});

describe("PLAYER_SYSTEM_PROMPT", () => {
  it("asks for the labelled sections the leaderboard renders", () => {
    for (const label of ["Strengths:", "Holding you back:", "Hidden pattern:", "Practice plan:"]) {
      expect(PLAYER_SYSTEM_PROMPT).toContain(label);
    }
  });
});
