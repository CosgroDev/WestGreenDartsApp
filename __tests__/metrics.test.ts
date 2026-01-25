import { describe, it, expect } from "@jest/globals";

type Visit = { score: number; darts: number; is_bust?: boolean; is_checkout?: boolean; remaining_after?: number };

function computeLegStats(visits: Visit[]) {
  const darts = visits.reduce((s, v) => s + v.darts, 0);
  const points = visits.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const threeDA = darts > 0 ? (points / darts) * 3 : null;

  const firstThree = visits.slice(0, 3);
  const first9Darts = firstThree.reduce((s, v) => s + v.darts, 0);
  const first9Points = firstThree.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const first9 = first9Darts === 9 ? (first9Points / first9Darts) * 3 : null;

  const t26 = visits.filter((v) => v.score === 26).length;

  const highFinish = visits
    .filter((v) => v.is_checkout || v.remaining_after === 0)
    .map((v) => v.score)
    .reduce<number | null>((max, s) => (max === null ? s : Math.max(max, s)), null);

  return { darts, points, threeDA, first9, t26, highFinish };
}

describe("leg stat calculations", () => {
  it("computes 3DA and first9 correctly", () => {
    const visits: Visit[] = [
      { score: 100, darts: 3 },
      { score: 60, darts: 3 },
      { score: 26, darts: 3 },
      { score: 140, darts: 3 },
      { score: 75, darts: 3, is_checkout: true }
    ];
    const stats = computeLegStats(visits);
    // total score = 401, darts = 15 => avg = (401/15)*3 ≈ 80.2
    expect(stats.threeDA && stats.threeDA).toBeCloseTo((401 / 15) * 3, 1);
    // first 9 darts = first 3 visits => score 186, darts 9 => (186/9)*3 = 62.0
    expect(stats.first9 && stats.first9).toBeCloseTo((186 / 9) * 3, 1);
    expect(stats.t26).toBe(1);
    expect(stats.highFinish).toBe(75);
  });

  it("handles busts by zeroing that visit's score", () => {
    const visits: Visit[] = [
      { score: 100, darts: 3 },
      { score: 60, darts: 3 },
      { score: 50, darts: 3, is_bust: true },
      { score: 40, darts: 2, is_checkout: true }
    ];
    const stats = computeLegStats(visits);
    // bust visit contributes 0 points
    const points = 100 + 60 + 0 + 40;
    const darts = 3 + 3 + 3 + 2;
    expect(stats.threeDA && stats.threeDA).toBeCloseTo((points / darts) * 3, 1);
    expect(stats.highFinish).toBe(40);
  });

  it("returns null for averages when not enough darts", () => {
    const visits: Visit[] = [{ score: 60, darts: 3 }];
    const stats = computeLegStats(visits);
    expect(stats.first9).toBeNull();
  });
});
