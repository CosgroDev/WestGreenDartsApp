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
});
