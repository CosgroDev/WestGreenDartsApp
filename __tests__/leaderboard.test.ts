import { compareLeaderboardPlayers } from "../src/lib/leaderboard";

const player = (name: string, won: number, played: number, avg = 50) => ({
  name, player_id: name, legs_won: won, legs_played: played, three_dart_avg: avg
});

describe("leaderboard ranking", () => {
  it("puts a higher win percentage ahead of more wins", () => {
    const players = [player("More wins", 10, 20), player("Higher rate", 6, 8)];
    expect(players.sort(compareLeaderboardPlayers)[0].name).toBe("Higher rate");
  });
  it("uses wins then average to break equal-rate ties", () => {
    const players = [player("Low average", 4, 8, 40), player("Fewer wins", 2, 4, 80), player("High average", 4, 8, 60)];
    expect(players.sort(compareLeaderboardPlayers).map(p => p.name)).toEqual(["High average", "Low average", "Fewer wins"]);
  });
  it("puts unplayed players below players with losses", () => {
    expect([player("Unplayed", 0, 0), player("Played", 0, 2)].sort(compareLeaderboardPlayers)[0].name).toBe("Played");
  });
  it("compares rates before rounding", () => {
    expect([player("Lower", 50, 101), player("Higher", 1, 2)].sort(compareLeaderboardPlayers)[0].name).toBe("Higher");
  });
});
