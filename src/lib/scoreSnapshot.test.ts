import { leagueScoreSnapshot } from "./scoreSnapshot";

describe("league correction turn", () => {
  const snapshot = {
    meta: { west_green_starts: true },
    events: [
      { thrower: "west_green", score: 180, remaining_after: 321 },
      { thrower: "west_green", score: 180, remaining_after: 141 },
    ],
  };

  it("returns the undone player's turn after consecutive manually selected visits", () => {
    expect(leagueScoreSnapshot(snapshot).meta.activeSide).toBe("opponent");
    const corrected = leagueScoreSnapshot(snapshot, "west_green");
    expect(corrected.meta.activeSide).toBe("west");
    expect(corrected.remaining).toBe(141);
  });

  it("returns an undone opponent's turn regardless of the preceding visit", () => {
    const opponentSnapshot = { ...snapshot, events: [{ thrower: "opponent", remaining_after: 141 }] };
    expect(leagueScoreSnapshot(opponentSnapshot, "opponent").meta.activeSide).toBe("opponent");
  });

  it("keeps the existing initial turn when no visit was undone", () => {
    expect(leagueScoreSnapshot({ ...snapshot, events: [] }).meta.activeSide).toBe("west");
    expect(leagueScoreSnapshot({ meta: { west_green_starts: false }, events: [] }).meta.activeSide).toBe("opponent");
  });
});
