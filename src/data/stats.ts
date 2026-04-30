import { supabaseServer } from "@/lib/supabaseServer";

export type PlayerCard = {
  player_id: string;
  name: string;
  legs_played: number;
  legs_won: number;
  three_dart_avg: number | null;
  checkout_pct: number | null;
  first_nine_avg: number | null;
  twenty_six: number;
  one_eighty: number;
  high_finish: number | null;
};

export type TeamCard = {
  legs_played: number;
  legs_won: number;
  three_dart_avg: number | null;
  high_finish: number | null;
};

export async function getPlayerCards(seasonId?: string): Promise<PlayerCard[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  // Active players
  const { data: activePlayers, error: playersErr } = await supabase
    .from("players")
    .select("id, name")
    .eq("active", true);
  if (playersErr || !activePlayers || !activePlayers.length) return [];
  const activeIds = new Set(activePlayers.map((p: any) => p.id));

  // Completed games for active players, optionally scoped to a season via fixture join
  let gamesQuery = supabase
    .from("games")
    .select(
      seasonId
        ? "id, west_green_player_id, winner, status, completed_at, fixtures!inner(season_id)"
        : "id, west_green_player_id, winner, status, completed_at"
    )
    .eq("deleted", false)
    .eq("status", "completed")
    .in("west_green_player_id", Array.from(activeIds))
    .order("completed_at", { ascending: true });

  if (seasonId) {
    gamesQuery = (gamesQuery as any).eq("fixtures.season_id", seasonId);
  }

  const { data: games, error: gamesErr } = await gamesQuery;
  if (gamesErr || !games || !games.length) return [];

  // Map games to players and collect game IDs
  const perPlayer = new Map<
    string,
    {
      played: number;
      won: number;
      high_finish: number | null;
      totalScore: number;
      totalDarts: number;
      first9Score: number;
      first9Darts: number;
      t26: number;
      t180: number;
      gameIds: string[];
    }
  >();
  games.forEach((g: any) => {
    const pid = g.west_green_player_id;
    if (!pid) return;
    const entry =
      perPlayer.get(pid) || {
        played: 0,
        won: 0,
        high_finish: null,
        totalScore: 0,
        totalDarts: 0,
        first9Score: 0,
        first9Darts: 0,
        t26: 0,
        t180: 0,
        gameIds: []
      };
    entry.played += 1;
    if (g.winner === "west_green") entry.won += 1;
    entry.gameIds.push(g.id);
    perPlayer.set(pid, entry);
  });

  // Fetch scoring events for all those games to compute 3DA and high finish
  const allGameIds = games.map((g: any) => g.id);
  const { data: events, error: evErr } = await supabase
    .from("scoring_events")
    .select("game_id, score, darts, is_checkout, remaining_after, is_deleted")
    .in("game_id", allGameIds)
    .eq("is_deleted", false);
  if (evErr) {
    console.warn("player stats events error", evErr.message);
  }

  if (events) {
    const gameToPlayer = new Map<string, string>();
    perPlayer.forEach((v, pid) => {
      v.gameIds.forEach((gid) => gameToPlayer.set(gid, pid));
    });

    // Collect first 3 events per game to compute first 9 darts per leg
    const first3ByGame = new Map<string, any[]>();
    events.forEach((e: any) => {
      const pid = gameToPlayer.get(e.game_id);
      if (!pid) return;
      const entry = perPlayer.get(pid);
      if (!entry) return;
      if (typeof e.score === "number") entry.totalScore += e.score;
      if (typeof e.darts === "number") entry.totalDarts += e.darts;
      if (e.score === 26) entry.t26 += 1;
      if (e.score === 180) entry.t180 += 1;
      const arr = first3ByGame.get(e.game_id) || [];
      if (arr.length < 3) {
        arr.push(e);
        first3ByGame.set(e.game_id, arr);
      }
      if (e.is_checkout) {
        const finish =
          typeof e.score === "number"
            ? e.score
            : typeof e.remaining_after === "number"
            ? 501 - e.remaining_after
            : null;
        if (typeof finish === "number") {
          entry.high_finish = entry.high_finish === null ? finish : Math.max(entry.high_finish, finish);
        }
      }
    });

    first3ByGame.forEach((arr, gameId) => {
      const pid = gameToPlayer.get(gameId);
      if (!pid) return;
      const entry = perPlayer.get(pid);
      if (!entry) return;
      const darts = arr.reduce((s, v) => s + (typeof v.darts === "number" ? v.darts : 0), 0);
      const pts = arr.reduce((s, v) => s + (typeof v.score === "number" ? v.score : 0), 0);
      if (darts > 0) {
        entry.first9Darts += darts;
        entry.first9Score += pts;
      }
    });
  }

  const players: PlayerCard[] = [];
  for (const [pid, val] of perPlayer.entries()) {
    const name = activePlayers.find((p: any) => p.id === pid)?.name ?? pid;
    const three_dart_avg =
      val.totalDarts > 0 ? (val.totalScore / val.totalDarts) * 3 : null;
    const first_nine_avg = val.first9Darts > 0 ? (val.first9Score / val.first9Darts) * 3 : null;
    players.push({
      player_id: pid,
      name,
      legs_played: val.played,
      legs_won: val.won,
      three_dart_avg,
      checkout_pct: null,
      first_nine_avg,
      twenty_six: val.t26,
      one_eighty: val.t180,
      high_finish: val.high_finish
    });
  }

  players.sort((a, b) => b.legs_won - a.legs_won || (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  return players;
}

export async function getTeamCard(seasonId?: string): Promise<TeamCard> {
  const supabase = supabaseServer();
  if (!supabase) return { legs_played: 0, legs_won: 0, three_dart_avg: null, high_finish: null };

  // Fetch completed games (ignore deleted), optionally scoped to a season via fixture join
  let gamesQuery = supabase
    .from("games")
    .select(
      seasonId
        ? "id, winner, fixtures!inner(season_id)"
        : "id, winner"
    )
    .eq("deleted", false)
    .eq("status", "completed");

  if (seasonId) {
    gamesQuery = (gamesQuery as any).eq("fixtures.season_id", seasonId);
  }

  const { data: games, error: gamesErr } = await gamesQuery;

  if (gamesErr || !games) {
    console.warn("team stats fallback", gamesErr?.message);
    return { legs_played: 0, legs_won: 0, three_dart_avg: null, high_finish: null };
  }

  const legs_played = games.length;
  const legs_won = games.filter((g: any) => g.winner === "west_green").length;

  // Compute 3DA and high finish from scoring_events for these games
  let three_dart_avg: number | null = null;
  let high_finish: number | null = null;

  if (games.length) {
    const gameIds = games.map((g: any) => g.id);
    const { data: events, error: evErr } = await supabase
      .from("scoring_events")
      .select("game_id, score, darts, is_bust, is_checkout, remaining_after")
      .in("game_id", gameIds)
      .eq("is_deleted", false);

    if (!evErr && events) {
      const totalScore = events.reduce((sum, e: any) => sum + (typeof e.score === "number" ? e.score : 0), 0);
      const totalDarts = events.reduce((sum, e: any) => sum + (typeof e.darts === "number" ? e.darts : 0), 0);
      if (totalDarts > 0) three_dart_avg = (totalScore / totalDarts) * 3;

      const checkoutScores = events
        .filter((e: any) => e.is_checkout)
        .map((e: any) =>
          typeof e.score === "number"
            ? e.score
            : typeof e.remaining_after === "number"
            ? 501 - e.remaining_after
            : null
        )
        .filter((x: any) => typeof x === "number") as number[];
      if (checkoutScores.length) high_finish = Math.max(...checkoutScores);
    }
  }

  return {
    legs_played,
    legs_won,
    three_dart_avg,
    high_finish
  };
}
