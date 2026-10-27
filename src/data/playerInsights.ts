import { allRows, rowsForIds } from "@/lib/database";
import { matchKey } from "@/lib/matchKey";
import { supabaseServer } from "@/lib/supabaseServer";
import type { InsightMatch } from "@/lib/playerInsights";
import { summariseLeg, type Visit } from "./matchSummary";

type Db = NonNullable<Awaited<ReturnType<typeof supabaseServer>>>;

/**
 * Every leg the player has in the season, grouped into matches. Matches with
 * a leg still in progress are left out, so a live match doesn't half-count.
 * `completedLegs` is the insight's freshness fingerprint.
 */
async function loadPlayerSeasonGames(supabase: Db, playerId: string, seasonId: string) {
  const { data: games } = await allRows(() =>
    supabase
      .from("games")
      .select(
        "id, match_id, fixture_id, west_green_player_id, opponent_player, winner, status, west_green_starts, created_at, fixtures!inner(opponent, home, starts_at, season_id)"
      )
      .eq("deleted", false)
      .eq("west_green_player_id", playerId)
      .eq("fixtures.season_id", seasonId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
  );

  const byMatch = new Map<string, any[]>();
  games.forEach((g: any) => {
    const key = matchKey(g);
    byMatch.set(key, [...(byMatch.get(key) ?? []), g]);
  });
  const matches = [...byMatch.values()]
    .filter((list) => !list.some((g) => g.status === "in_progress"))
    .map((list) => list.filter((g) => g.status === "completed"))
    .filter((list) => list.length > 0);

  return { matches, completedLegs: matches.reduce((n, list) => n + list.length, 0) };
}

/** Completed legs in completed matches — cheap, no scoring events. */
export async function countPlayerSeasonLegs(playerId: string, seasonId: string): Promise<number> {
  const supabase = await supabaseServer();
  if (!supabase || !playerId || !seasonId) return 0;
  return (await loadPlayerSeasonGames(supabase, playerId, seasonId)).completedLegs;
}

/** Every visit of the player's season, as matches of legs in the order played. */
export async function getPlayerSeasonMatches(
  playerId: string,
  seasonId: string
): Promise<{ matches: InsightMatch[]; completedLegs: number } | null> {
  const supabase = await supabaseServer();
  if (!supabase || !playerId || !seasonId) return null;

  const { matches: grouped, completedLegs } = await loadPlayerSeasonGames(supabase, playerId, seasonId);
  const gameIds = grouped.flat().map((g: any) => g.id);
  const events = await rowsForIds(gameIds, (ids) =>
    supabase
      .from("scoring_events")
      .select("id, game_id, score, darts, remaining_after, is_bust, is_checkout, throw_index")
      .in("game_id", ids)
      .eq("thrower", "west_green")
      .eq("is_deleted", false)
      .order("throw_index", { ascending: true })
      .order("id", { ascending: true })
  );

  const visitsByGame = new Map<string, Visit[]>();
  events.forEach((e: any) => {
    const list = visitsByGame.get(e.game_id) ?? [];
    list.push({
      score: typeof e.score === "number" ? e.score : 0,
      darts: typeof e.darts === "number" ? e.darts : 3,
      remainingAfter: typeof e.remaining_after === "number" ? e.remaining_after : 0,
      isBust: e.is_bust === true,
      isCheckout: e.is_checkout === true
    });
    visitsByGame.set(e.game_id, list);
  });

  const matches: InsightMatch[] = grouped.map((list) => {
    const f = list[0].fixtures;
    return {
      date: f.starts_at,
      opponentTeam: f.opponent,
      opponentPlayer: list[0].opponent_player || "Opponent",
      home: f.home === true,
      legs: list.map((g: any) => ({
        ...summariseLeg(
          g.id,
          g.winner === "west_green" ? "west" : g.winner === "opponent" ? "opponent" : "draw",
          visitsByGame.get(g.id) ?? []
        ),
        westStarted: typeof g.west_green_starts === "boolean" ? g.west_green_starts : null
      }))
    };
  });

  return { matches, completedLegs };
}

export type StoredPlayerInsight = { summary: string | null; at: string | null; legs: number | null };

// Read defensively so the leaderboard still works before the
// player_ai_insights table has been migrated.
export async function getStoredPlayerInsight(playerId: string, seasonId: string): Promise<StoredPlayerInsight> {
  const supabase = await supabaseServer();
  if (!supabase || !playerId || !seasonId) return { summary: null, at: null, legs: null };

  const { data, error } = await supabase
    .from("player_ai_insights")
    .select("summary, generated_at, legs_covered")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .maybeSingle();
  if (error || !data) return { summary: null, at: null, legs: null };

  return { summary: data.summary ?? null, at: data.generated_at ?? null, legs: data.legs_covered ?? null };
}
