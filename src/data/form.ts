import { supabaseServer } from "@/lib/supabaseServer";

export type MatchResult = {
  result: "W" | "D" | "L";
  date: string;
  opponent: string;
  fixture_id: string;
};

export type PlayerForm = {
  player_id: string;
  name: string;
  /** Completed matches, most recent first. */
  matches: MatchResult[];
};

/**
 * Recent match form per active player. A "match" is the best-of-2 group of
 * game (leg) records for one player vs one opponent within a fixture —
 * the same grouping the fixture detail page uses.
 */
export async function getPlayerForm(): Promise<PlayerForm[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data: activePlayers, error: playersErr } = await supabase
    .from("players")
    .select("id, name")
    .eq("active", true);
  if (playersErr || !activePlayers || !activePlayers.length) return [];

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id, fixture_id, west_green_player_id, opponent_player, winner, status, created_at, completed_at")
    .eq("deleted", false)
    .eq("status", "completed")
    .in("west_green_player_id", activePlayers.map((p: any) => p.id))
    .order("created_at", { ascending: true });
  if (gamesErr || !games) return [];

  type Group = {
    player_id: string;
    fixture_id: string;
    opponent: string;
    westWins: number;
    oppWins: number;
    drawFlag: boolean;
    lastDate: string;
  };
  const groups = new Map<string, Group>();
  games.forEach((g: any) => {
    if (!g.west_green_player_id) return;
    const key = `${g.fixture_id}|${g.west_green_player_id}|${(g.opponent_player || "").trim().toLowerCase()}`;
    const entry =
      groups.get(key) ||
      ({
        player_id: g.west_green_player_id,
        fixture_id: g.fixture_id,
        opponent: g.opponent_player || "Opponent",
        westWins: 0,
        oppWins: 0,
        drawFlag: false,
        lastDate: g.created_at
      } as Group);
    if (g.winner === "west_green") entry.westWins += 1;
    else if (g.winner === "opponent") entry.oppWins += 1;
    // a single completed record with no winner is the legacy draw representation
    else entry.drawFlag = true;
    const date = g.completed_at || g.created_at;
    if (date > entry.lastDate) entry.lastDate = date;
    groups.set(key, entry);
  });

  const perPlayer = new Map<string, MatchResult[]>();
  groups.forEach((m) => {
    const result: "W" | "D" | "L" =
      m.drawFlag || m.westWins === m.oppWins ? "D" : m.westWins > m.oppWins ? "W" : "L";
    const list = perPlayer.get(m.player_id) || [];
    list.push({ result, date: m.lastDate, opponent: m.opponent, fixture_id: m.fixture_id });
    perPlayer.set(m.player_id, list);
  });

  return activePlayers
    .map((p: any) => ({
      player_id: p.id,
      name: p.name,
      matches: (perPlayer.get(p.id) || []).sort((a, b) => b.date.localeCompare(a.date))
    }))
    .filter((p) => p.matches.length > 0);
}

export type TeamSuggestion = {
  /** Players who qualify automatically, with the rule they satisfied. */
  picks: { player_id: string; name: string; reason: string; form: ("W" | "D" | "L")[] }[];
  openSpots: number;
  teamSize: number;
};

/**
 * Suggested team for the next fixture:
 * - won their last match -> in
 * - exactly one draw (and no loss) across their last two matches -> in
 * Anything else leaves the spot up for grabs.
 */
export function suggestTeam(form: PlayerForm[], teamSize = 6): TeamSuggestion {
  const qualified = form
    .map((p) => {
      const lastTwo = p.matches.slice(0, 2).map((m) => m.result);
      const last = lastTwo[0];
      const draws = lastTwo.filter((r) => r === "D").length;
      const losses = lastTwo.filter((r) => r === "L").length;

      let reason: string | null = null;
      if (last === "W") reason = "Won last match";
      else if (draws === 1 && losses === 0) reason = "Drew 1 of last 2";
      if (!reason) return null;

      const wins = lastTwo.filter((r) => r === "W").length;
      return {
        player_id: p.player_id,
        name: p.name,
        reason,
        form: p.matches.slice(0, 5).map((m) => m.result),
        wins,
        lastDate: p.matches[0]?.date ?? ""
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.wins - a.wins || b.lastDate.localeCompare(a.lastDate));

  const picks = qualified.slice(0, teamSize).map(({ player_id, name, reason, form }) => ({
    player_id,
    name,
    reason,
    form
  }));
  return { picks, openSpots: Math.max(0, teamSize - picks.length), teamSize };
}
