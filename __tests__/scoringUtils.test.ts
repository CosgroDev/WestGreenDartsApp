import { canFinishFrom, computeRemaining, buildLegStats, ScoringVisit } from "../src/lib/scoringUtils";

describe("canFinishFrom", () => {
  it("allows standard finishes", () => {
    [2, 32, 40, 100, 158, 160, 161, 164, 167, 170].forEach((n) => {
      expect(canFinishFrom(n)).toBe(true);
    });
  });

  it("rejects bogey numbers", () => {
    [159, 162, 163, 165, 166, 168, 169].forEach((n) => {
      expect(canFinishFrom(n)).toBe(false);
    });
  });

  it("rejects scores above 170 and below 2", () => {
    expect(canFinishFrom(171)).toBe(false);
    expect(canFinishFrom(180)).toBe(false);
    expect(canFinishFrom(1)).toBe(false);
    expect(canFinishFrom(0)).toBe(false);
  });
});

describe("buildLegStats", () => {
  const visit = (score: number, opts: Partial<ScoringVisit> = {}): ScoringVisit => ({
    score,
    darts: 3,
    remaining_after: 0,
    is_bust: false,
    is_checkout: false,
    ...opts
  });

  it("excludes bust visits from scoring averages", () => {
    const visits = [visit(100), visit(60, { is_bust: true }), visit(140)];
    const stats = buildLegStats(visits);
    expect(stats.totalDarts).toBe(9);
    expect(stats.threeDartAvg).toBeCloseTo(80);
  });

  it("computes remaining from the last visit", () => {
    const visits = [visit(100, { remaining_after: 401 }), visit(60, { remaining_after: 341 })];
    expect(computeRemaining(visits)).toBe(341);
    expect(computeRemaining([])).toBe(501);
  });
});
