type RankedPlayer = {
  legs_played: number;
  legs_won: number;
  three_dart_avg: number | null;
  name: string;
  player_id: string;
};

// Rank by the unrounded rate; players with no completed legs come last.
export function compareLeaderboardPlayers(a: RankedPlayer, b: RankedPlayer): number {
  const rate = (p: RankedPlayer) => p.legs_played > 0 ? p.legs_won / p.legs_played : -1;
  return rate(b) - rate(a) ||
    b.legs_won - a.legs_won ||
    (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0) ||
    a.name.localeCompare(b.name) ||
    a.player_id.localeCompare(b.player_id);
}
