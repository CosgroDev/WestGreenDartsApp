import { suggestTeam, type PlayerForm } from "../src/data/form";

const player = (id: string, results: ("W" | "D" | "L")[]): PlayerForm => ({
  player_id: id,
  name: id,
  // most recent first; dates descend to match
  matches: results.map((result, i) => ({
    result,
    date: `2026-06-${String(20 - i).padStart(2, "0")}`,
    opponent: "Opp",
    fixture_id: `f${i}`
  }))
});

describe("suggestTeam", () => {
  it("picks players who won their last match", () => {
    const res = suggestTeam([player("won-last", ["W", "L"]), player("lost-last", ["L", "W"])]);
    expect(res.picks.map((p) => p.player_id)).toEqual(["won-last"]);
    expect(res.openSpots).toBe(5);
  });

  it("picks players with exactly one draw and no loss in their last two", () => {
    const res = suggestTeam([
      player("draw-then-win", ["D", "W"]),
      player("two-draws", ["D", "D"]),
      player("draw-then-loss", ["D", "L"])
    ]);
    expect(res.picks.map((p) => p.player_id)).toEqual(["draw-then-win"]);
  });

  it("a single drawn match still qualifies", () => {
    const res = suggestTeam([player("one-draw", ["D"])]);
    expect(res.picks.map((p) => p.player_id)).toEqual(["one-draw"]);
  });

  it("caps picks at the team size, preferring more recent wins", () => {
    const winners = Array.from({ length: 7 }, (_, i) => player(`w${i}`, ["W", "W"]));
    const res = suggestTeam(winners);
    expect(res.picks).toHaveLength(6);
    expect(res.openSpots).toBe(0);
  });

  it("reports all spots open when nobody qualifies", () => {
    const res = suggestTeam([player("cold", ["L", "L"])]);
    expect(res.picks).toHaveLength(0);
    expect(res.openSpots).toBe(6);
  });
});
