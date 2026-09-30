import { finishRoutes } from "../src/lib/finishRoutes";
import { canFinishFrom } from "../src/lib/scoringUtils";

function dartScore(dart: string) {
  if (dart === "Bull") return 50;
  const match = /^([STD]?)(\d+)$/.exec(dart);
  if (!match) throw new Error(`Invalid dart: ${dart}`);
  return Number(match[2]) * (match[1] === "T" ? 3 : match[1] === "D" ? 2 : 1);
}

describe("checkout hints", () => {
  it("provides a valid double-out route for every finishable score", () => {
    for (let score = 2; score <= 170; score++) {
      if (!canFinishFrom(score)) {
        expect(finishRoutes[score]).toBeUndefined();
        continue;
      }
      expect(finishRoutes[score]).toBeDefined();
      const darts = finishRoutes[score].split(" ");
      expect(darts.length).toBeLessThanOrEqual(3);
      expect(darts.reduce((total, dart) => total + dartScore(dart), 0)).toBe(score);
      expect(darts[darts.length - 1]).toMatch(/^(D([1-9]|1[0-9]|20)|Bull)$/);
    }
  });
  it("covers previously missing small doubles and odd finishes", () => {
    expect(finishRoutes[30]).toBe("D15");
    expect(finishRoutes[34]).toBe("D17");
    for (const score of [3, 35, 42, 99, 121, 143]) {
      expect(finishRoutes[score]).toBeDefined();
    }
  });
});
