import {
  fieldAverage,
  gameDifficulty,
  signed,
  summariseOpposition,
  threeDartAvg,
  totalsByGame
} from "../src/lib/opposition";

const e = (game_id: string, score: number, extra: Partial<{ darts: number; is_bust: boolean }> = {}) => ({
  game_id,
  score,
  darts: 3,
  is_bust: false,
  ...extra
});

describe("totalsByGame", () => {
  it("counts a bust's darts but not its points", () => {
    const totals = totalsByGame([e("a", 100), e("a", 60, { is_bust: true }), e("b", 41, { darts: 1 })]);
    expect(totals.get("a")).toEqual({ points: 100, darts: 6 });
    expect(totals.get("b")).toEqual({ points: 41, darts: 1 });
    expect(threeDartAvg(totals.get("a"))).toBe(50);
    expect(threeDartAvg(undefined)).toBeNull();
  });
});

describe("summariseOpposition", () => {
  const own = totalsByGame([e("a", 60), e("b", 100), e("old", 180)]);
  const opp = totalsByGame([e("a", 45), e("b", 85)]);

  it("compares like with like: legs without opponent visits are left out on both sides", () => {
    const s = summariseOpposition(["a", "b", "old"], own, opp);
    expect(s.opp_legs).toBe(2);
    expect(s.opp_three_dart_avg).toBe(65);
    // 80 over legs a and b, not 113.3 with the 180 from the leg nobody scored for the opponent.
    expect(s.avg_vs_opp).toBe(15);
  });

  it("is empty when no opponent visits were recorded", () => {
    expect(summariseOpposition(["old"], own, opp)).toEqual({ opp_legs: 0, opp_three_dart_avg: null, avg_vs_opp: null });
  });
});

describe("gameDifficulty", () => {
  it("rates the opponent against the season's typical opponent", () => {
    expect(gameDifficulty(54, 50)).toBe("hard");
    expect(gameDifficulty(53.9, 50)).toBe("even");
    expect(gameDifficulty(46.1, 50)).toBe("even");
    expect(gameDifficulty(46, 50)).toBe("easy");
  });

  it("declines to rate without an opponent average or a yardstick", () => {
    expect(gameDifficulty(null, 50)).toBeNull();
    expect(gameDifficulty(54, null)).toBeNull();
  });

  it("only trusts the season average once enough legs are behind it", () => {
    expect(fieldAverage({ opp_legs: 9, opp_three_dart_avg: 48, avg_vs_opp: 1 })).toBeNull();
    expect(fieldAverage({ opp_legs: 10, opp_three_dart_avg: 48, avg_vs_opp: 1 })).toBe(48);
    expect(fieldAverage(null)).toBeNull();
  });

  it("formats an average difference with its sign", () => {
    expect([signed(3.24), signed(-1.5), signed(0), signed(null)]).toEqual(["+3.2", "−1.5", "+0.0", "–"]);
  });
});
