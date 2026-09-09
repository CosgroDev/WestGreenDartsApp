export function matchKey(game: { match_id?: string | null; fixture_id?: string; west_green_player_id: string | null; opponent_player: string | null }) {
  return game.match_id || `${game.fixture_id || ""}|${game.west_green_player_id || "none"}|${(game.opponent_player || "").trim().toLowerCase()}`;
}
