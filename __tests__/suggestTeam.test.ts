import { halfPreference, suggestTeam, type MatchResult, type PlayerForm } from "../src/data/form";

const match = (result: "W" | "D" | "L", i: number, half: 1 | 2 = 1): MatchResult => ({
  result,
  date: `2026-06-${String(20 - i).padStart(2, "0")}`,
  opponent: "Opp",
  fixture_id: `f${i}`,
  half
});

const player = (id: string, results: ("W" | "D" | "L")[]): PlayerForm => ({
  player_id: id,
  name: id,
  // most recent first; dates descend to match
  matches: results.map((result, i) => match(result, i))
});

describe("suggestTeam", () => {
  it("picks players who won their last match", () => {
    const res = suggestTeam([player("won-last", ["W", "L"]), player("lost-last", ["L", "W"])]);
    expect(res.picks.map((p) => p.player_id)).toEqual(["won-last"]);
    expect(res.openSpots).toBe(5);
  });

  it("picks players who drew their last match unless it's two draws on the bounce", () => {
    const res = suggestTeam([
      player("draw-then-win", ["D", "W"]),
      player("draw-then-loss", ["D", "L"]),
      player("two-draws", ["D", "D"])
    ]);
    // A loss before the draw doesn't cost the spot; two draws in a row does.
    expect(res.picks.map((p) => p.player_id).sort()).toEqual(["draw-then-loss", "draw-then-win"]);
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

describe("halfPreference", () => {
  it("suggests the half with the better win rate", () => {
    const matches = [match("W", 0, 1), match("W", 1, 1), match("L", 2, 2), match("W", 3, 2)];
    expect(halfPreference(matches)).toEqual({ half: 1, note: "wins 2/2 early" });
  });

  it("suggests late when the second half record is stronger", () => {
    const matches = [match("L", 0, 1), match("W", 1, 2), match("W", 2, 2)];
    expect(halfPreference(matches)).toEqual({ half: 2, note: "wins 2/2 late" });
  });

  it("returns null without data in both halves", () => {
    expect(halfPreference([match("W", 0, 1), match("W", 1, 1)])).toBeNull();
  });

  it("returns null when the halves are level", () => {
    expect(halfPreference([match("W", 0, 1), match("W", 1, 2)])).toBeNull();
  });
});
