import { analyseMatch } from "../src/lib/matchInsights";
import type { MatchSummary } from "../src/data/matchSummary";

const emptyBands = { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 };

const baseMatch = (overrides: Partial<MatchSummary>): MatchSummary => ({
  fixtureId: "f1",
  fixtureLabel: "Home vs The Crown",
  westPlayerName: "Dave",
  opponentPlayer: "Steve",
  westLegs: 2,
  oppLegs: 0,
  result: "win",
  legs: [],
  dartsTotal: 45,
  pointsTotal: 1002,
  threeDartAvg: 66.8,
  firstNineAvg: 70,
  checkoutAttempts: 3,
  checkoutHits: 2,
  checkoutPct: 66.7,
  highFinish: 86,
  bestLegDarts: 17,
  busts: 0,
  bands: { ...emptyBands, sixtyPlus: 6, hundredPlus: 3, oneFortyPlus: 1 },
  opponent: null,
  ...overrides
});

describe("analyseMatch", () => {
  it("praises heavy scoring, clinical finishing and a big checkout", () => {
    const res = analyseMatch(baseMatch({}));
    expect(res.headline).toContain("Dave beat Steve 2-0");
    expect(res.strengths.join(" ")).toMatch(/Heavy scoring/);
    expect(res.strengths.join(" ")).toMatch(/Clinical on the doubles/);
    expect(res.strengths.join(" ")).toMatch(/86 finish/);
    expect(res.strengths.join(" ")).toMatch(/17 darts/);
  });

  it("flags poor checkout conversion and suggests the 121 Challenge", () => {
    const res = analyseMatch(
      baseMatch({
        result: "loss",
        westLegs: 0,
        oppLegs: 2,
        checkoutAttempts: 8,
        checkoutHits: 1,
        checkoutPct: 12.5,
        highFinish: 40,
        bestLegDarts: null
      })
    );
    expect(res.workOns.join(" ")).toMatch(/1 of 8 visits on a finish/);
    expect(res.practice.map((p) => p.title)).toContain("121 Challenge");
  });

  it("flags slow starts when first 9 trails the overall average", () => {
    const res = analyseMatch(baseMatch({ threeDartAvg: 52, firstNineAvg: 40 }));
    expect(res.workOns.join(" ")).toMatch(/Slow starts/);
    expect(res.practice.map((p) => p.title)).toContain("Practice 501 session");
  });

  it("flags repeated 26s and bust trouble", () => {
    const res = analyseMatch(
      baseMatch({ busts: 3, bands: { ...emptyBands, twentySix: 3 } })
    );
    expect(res.workOns.join(" ")).toMatch(/3 busts/);
    expect(res.workOns.join(" ")).toMatch(/3 × 26/);
  });

  it("never suggests the same practice game twice and caps at three", () => {
    const res = analyseMatch(
      baseMatch({
        threeDartAvg: 35,
        firstNineAvg: 25,
        checkoutAttempts: 6,
        checkoutHits: 0,
        checkoutPct: 0,
        busts: 4,
        bands: { ...emptyBands, twentySix: 4 }
      })
    );
    const titles = res.practice.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.length).toBeLessThanOrEqual(3);
  });

  describe("with the opponent's visits", () => {
    const opponent = (threeDartAvg: number, playerThreeDartAvg: number) => ({
      dartsTotal: 40, pointsTotal: 0, threeDartAvg, firstNineAvg: null, checkoutAttempts: 2, checkoutHits: 1,
      highFinish: 40, busts: 0, bands: emptyBands, legsWithVisits: 2, checkoutPct: 50, bestLegDarts: 20, playerThreeDartAvg
    });

    it("puts both averages in the headline and rates a hard game", () => {
      const res = analyseMatch(baseMatch({ result: "loss", westLegs: 0, oppLegs: 2, threeDartAvg: 52, opponent: opponent(61.4, 52) }), 48);
      expect(res.headline).toBe("Dave went down 0-2 to Steve averaging 52 to 61.4.");
      expect(res.difficulty).toBe("hard");
      expect(res.strengths.join(" ")).toMatch(/A hard game: Steve averaged 61.4, well above the 48/);
    });

    it("says when a match was lost on the finish rather than the scoring", () => {
      const res = analyseMatch(baseMatch({ result: "loss", westLegs: 0, oppLegs: 2, threeDartAvg: 58, opponent: opponent(47, 58) }), 48);
      expect(res.difficulty).toBe("even");
      expect(res.workOns.join(" ")).toMatch(/Out-scored the opponent 58 to Steve's 47 and lost/);
    });

    it("calls out an easy game that got away", () => {
      const res = analyseMatch(baseMatch({ result: "draw", westLegs: 1, oppLegs: 1, threeDartAvg: 44, opponent: opponent(40, 44) }), 48);
      expect(res.difficulty).toBe("easy");
      expect(res.workOns.join(" ")).toMatch(/there to be won/);
    });

    it("leaves difficulty unrated without opponent visits or a season yardstick", () => {
      expect(analyseMatch(baseMatch({}), 48).difficulty).toBeNull();
      expect(analyseMatch(baseMatch({ opponent: opponent(60, 66.8) }), null).difficulty).toBeNull();
    });
  });
});
