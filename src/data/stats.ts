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
  sixty_plus: number;
  hundred_plus: number;
  hundred_forty_plus: number;
  darts_per_leg_won: number | null;
};

export type TeamCard = {
  legs_played: number;
  legs_won: number;
  three_dart_avg: number | null;
  high_finish: number | null;
  checkout_pct: number | null;
  darts_per_leg_won: number | null;
  sixty_plus: number;
  hundred_plus: number;
  hundred_forty_plus: number;
  one_eighty_count: number;
};

const TEAM_CARD_EMPTY: TeamCard = {
  legs_played: 0,
  legs_won: 0,
  three_dart_avg: null,
  high_finish: null,
  checkout_pct: null,
  darts_per_leg_won: null,
  sixty_plus: 0,
  hundred_plus: 0,
  hundred_forty_plus: 0,
  one_eighty_count: 0,
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
        ? "id, west_green_player_id, winner, status, completed_at, darts_thrown, fixtures!inner(season_id)"
        : "id, west_green_player_id, winner, status, completed_at, darts_thrown"
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
      t60plus: number;
      t100plus: number;
      t140plus: number;
      checkoutAttempts: number;
      checkoutHits: number;
      wonDarts: number[];
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
        t60plus: 0,
        t100plus: 0,
        t140plus: 0,
        checkoutAttempts: 0,
        checkoutHits: 0,
        wonDarts: [] as number[],
        gameIds: [] as string[]
      };
    entry.played += 1;
    if (g.winner === "west_green") {
      entry.won += 1;
      if (typeof g.darts_thrown === "number" && g.darts_thrown > 0) {
        entry.wonDarts.push(g.darts_thrown);
      }
    }
    entry.gameIds.push(g.id);
    perPlayer.set(pid, entry);
  });

  // Fetch scoring events for all those games
  const allGameIds = games.map((g: any) => g.id);
  const { data: events, error: evErr } = await supabase
    .from("scoring_events")
    .select("game_id, score, darts, is_bust, is_checkout, remaining_after, is_deleted")
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
      if (typeof e.score === "number" && e.score >= 60) entry.t60plus += 1;
      if (typeof e.score === "number" && e.score >= 100) entry.t100plus += 1;
      if (typeof e.score === "number" && e.score >= 140) entry.t140plus += 1;

      // Checkout % — a visit counts as an attempt when remaining before was ≤ 170.
      // For non-bust visits: remaining_before = remaining_after + score.
      // For bust visits: remaining_before = remaining_after (score wasn't subtracted).
      const remaining_before =
        e.is_bust
          ? (typeof e.remaining_after === "number" ? e.remaining_after : 501)
          : (typeof e.remaining_after === "number" && typeof e.score === "number"
              ? e.remaining_after + e.score
              : 501);
      if (remaining_before <= 170) {
        entry.checkoutAttempts += 1;
        if (e.is_checkout) entry.checkoutHits += 1;
      }

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
    const checkout_pct =
      val.checkoutAttempts > 0 ? (val.checkoutHits / val.checkoutAttempts) * 100 : null;
    const darts_per_leg_won =
      val.wonDarts.length > 0
        ? val.wonDarts.reduce((s, v) => s + v, 0) / val.wonDarts.length
        : null;
    players.push({
      player_id: pid,
      name,
      legs_played: val.played,
      legs_won: val.won,
      three_dart_avg,
      checkout_pct,
      first_nine_avg,
      twenty_six: val.t26,
      one_eighty: val.t180,
      high_finish: val.high_finish,
      sixty_plus: val.t60plus,
      hundred_plus: val.t100plus,
      hundred_forty_plus: val.t140plus,
      darts_per_leg_won,
    });
  }

  players.sort((a, b) => b.legs_won - a.legs_won || (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  return players;
}

export async function getTeamCard(seasonId?: string): Promise<TeamCard> {
  const supabase = supabaseServer();
  if (!supabase) return TEAM_CARD_EMPTY;

  // Fetch completed games (ignore deleted), optionally scoped to a season via fixture join
  let gamesQuery = supabase
    .from("games")
    .select(
      seasonId
        ? "id, winner, darts_thrown, fixtures!inner(season_id)"
        : "id, winner, darts_thrown"
    )
    .eq("deleted", false)
    .eq("status", "completed");

  if (seasonId) {
    gamesQuery = (gamesQuery as any).eq("fixtures.season_id", seasonId);
  }

  const { data: games, error: gamesErr } = await gamesQuery;

  if (gamesErr || !games) {
    console.warn("team stats fallback", gamesErr?.message);
    return TEAM_CARD_EMPTY;
  }

  const legs_played = games.length;
  const legs_won = games.filter((g: any) => g.winner === "west_green").length;

  const wonDarts = games
    .filter((g: any) => g.winner === "west_green" && typeof g.darts_thrown === "number" && g.darts_thrown > 0)
    .map((g: any) => g.darts_thrown as number);
  const darts_per_leg_won =
    wonDarts.length > 0 ? wonDarts.reduce((s, v) => s + v, 0) / wonDarts.length : null;

  let three_dart_avg: number | null = null;
  let high_finish: number | null = null;
  let checkout_pct: number | null = null;
  let sixty_plus = 0;
  let hundred_plus = 0;
  let hundred_forty_plus = 0;
  let one_eighty_count = 0;

  if (games.length) {
    const gameIds = games.map((g: any) => g.id);
    const { data: events, error: evErr } = await supabase
      .from("scoring_events")
      .select("score, darts, is_bust, is_checkout, remaining_after")
      .in("game_id", gameIds)
      .eq("is_deleted", false);

    if (!evErr && events) {
      let totalScore = 0;
      let totalDarts = 0;
      let checkoutAttempts = 0;
      let checkoutHits = 0;

      events.forEach((e: any) => {
        if (typeof e.score === "number") totalScore += e.score;
        if (typeof e.darts === "number") totalDarts += e.darts;

        if (typeof e.score === "number") {
          if (e.score >= 60) sixty_plus += 1;
          if (e.score >= 100) hundred_plus += 1;
          if (e.score >= 140) hundred_forty_plus += 1;
          if (e.score === 180) one_eighty_count += 1;
        }

        const remaining_before =
          e.is_bust
            ? (typeof e.remaining_after === "number" ? e.remaining_after : 501)
            : (typeof e.remaining_after === "number" && typeof e.score === "number"
                ? e.remaining_after + e.score
                : 501);
        if (remaining_before <= 170) {
          checkoutAttempts += 1;
          if (e.is_checkout) checkoutHits += 1;
        }

        if (e.is_checkout && typeof e.score === "number") {
          high_finish = high_finish === null ? e.score : Math.max(high_finish, e.score);
        }
      });

      if (totalDarts > 0) three_dart_avg = (totalScore / totalDarts) * 3;
      if (checkoutAttempts > 0) checkout_pct = (checkoutHits / checkoutAttempts) * 100;
    }
  }

  return {
    legs_played,
    legs_won,
    three_dart_avg,
    high_finish,
    checkout_pct,
    darts_per_leg_won,
    sixty_plus,
    hundred_plus,
    hundred_forty_plus,
    one_eighty_count,
  };
}
