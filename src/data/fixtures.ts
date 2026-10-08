import { summariseFixture, type FixtureLeg } from "@/lib/fixtureState";
import { allRows } from "@/lib/database";
import { supabaseServer } from "@/lib/supabaseServer";

export type Fixture = {
  id: string;
  season: string;
  starts_at: string;
  opponent: string;
  venue: string | null;
  notes: string | null;
  home: boolean;
  games_count: number;
  matches_count: number;
  completed_matches: number;
  status?: "win" | "loss" | "draw" | "in_progress" | "scheduled";
  games?: FixtureLeg[];
};

export type FixtureDetail = {
  id: string;
  season: string;
  starts_at: string;
  opponent: string;
  venue: string | null;
  notes: string | null;
  home: boolean;
  aiTeamReview: string | null;
  aiTeamReviewAt: string | null;
};

export async function getFixtures(seasonId?: string, includeGames = true): Promise<Fixture[]> {
  const supabase = await supabaseServer();
  if (!supabase) return [];

  const { data, error } = await allRows(() => {
    let query = supabase
    .from("fixtures")
    .select(
      `id, starts_at, opponent, venue, notes, home,
       seasons(name)
       ${includeGames ? ", games:games(id,match_id,fixture_id,west_green_player_id,opponent_player,status,winner,deleted,created_at)" : ""}`
    )
    .order("starts_at", { ascending: true }).order("id", { ascending: true });
    if (seasonId) query = query.eq("season_id", seasonId);
    return query;
  });

  if (error || !data) return [];

  return data.map((f: any) => {
    const seasonName = Array.isArray(f.seasons) ? f.seasons[0]?.name ?? "" : f.seasons?.name ?? "";
    const activeGames = (f.games || []).filter((g: any) => g.deleted !== true);
    const state = summariseFixture(activeGames);
    return {
      id: f.id,
      season: seasonName,
      starts_at: f.starts_at,
      opponent: f.opponent,
      venue: f.venue,
      notes: f.notes,
      home: f.home,
      games_count: activeGames.length,
      games: includeGames ? activeGames : undefined,
      matches_count: state.matches.length,
      completed_matches: state.completedMatches,
      status: includeGames ? state.status : undefined
    };
  });
}

export async function getFixtureById(id: string): Promise<FixtureDetail | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("fixtures")
    .select("id, starts_at, opponent, venue, notes, home, ai_team_review, ai_team_review_at, seasons(name)")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(`Unable to load fixture: ${error.message}`);
  if (!data) return null;

  const seasonName = Array.isArray(data.seasons)
    ? (data.seasons[0] as any)?.name ?? ""
    : (data.seasons as any)?.name ?? "";

  return {
    id: data.id,
    season: seasonName,
    starts_at: data.starts_at,
    opponent: data.opponent,
    venue: data.venue,
    notes: data.notes,
    home: data.home,
    aiTeamReview: (data as any).ai_team_review ?? null,
    aiTeamReviewAt: (data as any).ai_team_review_at ?? null
  };
}

export async function getTeamRecord(seasonIds?: string[]): Promise<{
  legWins: number;
  legLosses: number;
  legDraws: number;
  legsFor: number;
  legsAgainst: number;
}> {
  const supabase = await supabaseServer();
  if (!supabase)
    return { legWins: 0, legLosses: 0, legDraws: 0, legsFor: 0, legsAgainst: 0 };

  // Fetch games joined to fixtures to filter by season ids
  let gameQuery = supabase
    .from("games")
    .select("winner, status, fixtures!inner(season_id)")
    .eq("deleted", false)
    .eq("status", "completed");

  if (seasonIds && seasonIds.length) {
    gameQuery = gameQuery.in("fixtures.season_id", seasonIds);
  }

  const { data, error } = await gameQuery;

  if (error || !data)
    return { legWins: 0, legLosses: 0, legDraws: 0, legsFor: 0, legsAgainst: 0 };

  const legWins = data.filter((g: any) => g.winner === "west_green").length;
  const legLosses = data.filter((g: any) => g.winner === "opponent").length;
  const legDraws = data.filter((g: any) => g.winner === null).length;
  const legsFor = legWins + legDraws;
  const legsAgainst = legLosses + legDraws;
  return { legWins, legLosses, legDraws, legsFor, legsAgainst };
}
