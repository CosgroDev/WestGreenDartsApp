import {
  buildSeasonBaseline,
  compareToBaseline,
  deriveMatch,
  playerForm,
  MATCH_SYSTEM_PROMPT,
  FIXTURE_SYSTEM_PROMPT,
  SEASON_SYSTEM_PROMPT
} from "../src/lib/aiCoaching";
import type { LegSummary, Visit } from "../src/data/matchSummary";
import type { PlayerCard, PlayerGameStat } from "../src/data/stats";

const emptyBands = { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 };

const v = (score: number, remainingAfter: number, extra: Partial<Visit> = {}): Visit => ({
  score,
  darts: 3,
  remainingAfter,
  isBust: false,
  isCheckout: false,
  ...extra
});

const leg = (gameId: string, winner: LegSummary["winner"], visits: Visit[]): LegSummary => ({
  gameId,
  winner,
  visits,
  dartsTotal: visits.reduce((s, x) => s + x.darts, 0),
  pointsTotal: 0,
  threeDartAvg: null,
  firstNineAvg: null,
  checkoutAttempts: 0,
  checkoutHits: 0,
  highFinish: null,
  busts: visits.filter((x) => x.isBust).length,
  bands: emptyBands
});

// Leg 1 won: heavy scoring, on a finish after 9 darts, out in 6 more.
const wonLeg = leg("g1", "west", [
  v(100, 401),
  v(140, 261),
  v(100, 161),
  v(121, 40),
  v(40, 0, { isCheckout: true })
]);
// Leg 2 lost: scrappy start, reached 129 and bust it, then the opponent won.
const lostLeg = leg("g2", "opponent", [
  v(26, 475),
  v(45, 430),
  v(60, 370),
  v(81, 289),
  v(100, 189),
  v(60, 129),
  v(140, 129, { isBust: true })
]);

describe("deriveMatch", () => {
  const d = deriveMatch([wonLeg, lostLeg]);

  it("separates the scoring phase from set-up and finishing visits", () => {
    expect(d.scoringPhaseVisits).toBe(9);
    expect(d.scoringPhaseAvg).toBe(79.1);
    expect(d.scoringPhase60PlusPct).toBe(78);
    expect(d.lowVisits).toBe(1);
  });

  it("works out how quickly a finish was reached and converted", () => {
    expect(d.avgDartsToReachFinish).toBe(13.5);
    expect(d.avgDartsOnFinishInLegsWon).toBe(6);
  });

  it("flags legs lost while on a finish", () => {
    expect(d.legsLostWithFinishChances).toBe(1);
    expect(d.missedFinishVisitsInLostLegs).toBe(1);
    expect(d.legsLostNeverOnFinish).toBe(0);
  });

  it("ignores busts for the best visit and tells each leg's story", () => {
    expect(d.bestVisit).toBe(140);
    expect(d.legStory[0]).toMatchObject({ leg: 1, won: true, dartsToReachFinish: 9, checkout: 40 });
    expect(d.legStory[1]).toMatchObject({ leg: 2, won: false, dartsToReachFinish: 18, busts: 1, checkout: null });
  });

  it("counts a lost leg that never reached a finish as out-scored", () => {
    const outscored = leg("g3", "opponent", [v(41, 460), v(45, 415)]);
    const r = deriveMatch([outscored]);
    expect(r.legsLostNeverOnFinish).toBe(1);
    expect(r.legsLostWithFinishChances).toBe(0);
    expect(r.avgDartsToReachFinish).toBeNull();
  });
});

const card = (overrides: Partial<PlayerCard> = {}): PlayerCard => ({
  player_id: "p1",
  name: "Dave",
  legs_played: 20,
  legs_won: 11,
  three_dart_avg: 44.04,
  checkout_pct: 28.3,
  first_nine_avg: 50.2,
  twenty_six: 4,
  one_eighty: 0,
  high_finish: 96,
  sixty_plus: 70,
  hundred_plus: 12,
  hundred_forty_plus: 2,
  darts_per_leg_won: 24.5,
  total_darts: 500,
  matches_played: 7,
  scoring_visits: 160,
  checkout_attempts: 46,
  checkout_hits: 13,
  first_nine_legs: 20,
  recorded_wins: 11,
  ...overrides
});

const logEntry = (game_id: string, avg: number | null): PlayerGameStat => ({
  game_id,
  date: "2026-10-01",
  opponent: "Opp",
  won: true,
  three_dart_avg: avg,
  first_nine_avg: null,
  darts_thrown: null,
  high_finish: null,
  checkout: null,
  twenty_six: 0,
  hundred_plus: 0,
  hundred_forty_plus: 0,
  one_eighty: 0
});

describe("buildSeasonBaseline", () => {
  it("uses legs before this match for recent form and excludes this match's legs", () => {
    // most recent first: g1/g2 are tonight's legs
    const log = [logEntry("g1", 70), logEntry("g2", 68), logEntry("a", 40), logEntry("b", 42), logEntry("c", 44)];
    const base = buildSeasonBaseline(card(), log, new Set(["g1", "g2"]));
    expect(base).toMatchObject({ threeDartAvg: 44, recentForm: 42, bestLegAvgBefore: 44, checkoutAttempts: 46 });
    expect(compareToBaseline({ threeDartAvg: 52.5, firstNineAvg: 55, checkoutPct: null }, base)).toEqual({
      threeDartAvg: 8.5,
      firstNineAvg: 4.8,
      checkoutPct: null,
      vsRecentForm: 10.5
    });
  });

  it("ignores legs played after the reviewed match", () => {
    // most recent first: "later" was thrown after tonight's legs g1/g2
    const log = [logEntry("later", 80), logEntry("g1", 70), logEntry("g2", 68), logEntry("a", 40), logEntry("b", 42), logEntry("c", 44)];
    const base = buildSeasonBaseline(card(), log, new Set(["g1", "g2"]));
    expect(base).toMatchObject({ recentForm: 42, bestLegAvgBefore: 44 });
  });

  it("returns null without a season card", () => {
    expect(buildSeasonBaseline(undefined, [], new Set())).toBeNull();
    expect(buildSeasonBaseline(card({ legs_played: 0 }), [], new Set())).toBeNull();
  });
});

describe("playerForm", () => {
  it("compares recent legs with the rest of the season", () => {
    const log = [50, 50, 50, 50, 50, 50, 40, 40, 40].map((a, i) => logEntry(`g${i}`, a));
    expect(playerForm(log)).toEqual({ recentLegs: 6, recentAvg: 50, earlierAvg: 40, change: 10 });
  });

  it("needs enough legs to call a trend", () => {
    expect(playerForm([logEntry("a", 40), logEntry("b", 50)])).toBeNull();
  });
});

describe("system prompts", () => {
  it.each([MATCH_SYSTEM_PROMPT, FIXTURE_SYSTEM_PROMPT, SEASON_SYSTEM_PROMPT])(
    "ask for what went well, what to work on, and a targeted drill",
    (prompt) => {
      expect(prompt).toMatch(/Keep doing:/);
      expect(prompt).toMatch(/Work on:/);
      expect(prompt).toMatch(/Practice:/);
      expect(prompt).toMatch(/Random Checkout/);
      expect(prompt).toMatch(/Doubles Switch/);
      expect(prompt).toMatch(/never state or guess what an opponent/);
    }
  );
});
