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
  status?: "win" | "loss" | "draw" | "in_progress";
  games?: { winner: string | null; status: string }[];
};

export type FixtureDetail = {
  id: string;
  season: string;
  starts_at: string;
  opponent: string;
  venue: string | null;
  notes: string | null;
  home: boolean;
};

export async function getFixtures(): Promise<Fixture[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("fixtures")
    .select(
      `id, starts_at, opponent, venue, notes, home,
       seasons(name),
       games:games(status,winner)`
    )
    .order("starts_at", { ascending: true });

  if (error || !data) return [];

  return data.map((f: any) => ({
    id: f.id,
    season: f.seasons?.name || "",
    starts_at: f.starts_at,
    opponent: f.opponent,
    venue: f.venue,
    notes: f.notes,
    home: f.home,
    games_count: f.games?.length ?? 0,
    games: f.games || [],
    status: (() => {
      const completed = (f.games || []).filter((g: any) => g.status === "completed");
      const wins = completed.filter((g: any) => g.winner === "west_green").length;
      const losses = completed.filter((g: any) => g.winner === "opponent").length;
      if (completed.length === 0) return "in_progress";
      if (wins > losses) return "win";
      if (losses > wins) return "loss";
      return "draw";
    })()
  }));
}

export async function getFixtureById(id: string): Promise<FixtureDetail | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("fixtures")
    .select("id, starts_at, opponent, venue, notes, home, seasons(name)")
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    season: data.seasons?.name || "",
    starts_at: data.starts_at,
    opponent: data.opponent,
    venue: data.venue,
    notes: data.notes,
    home: data.home
  };
}

export async function getTeamRecord(seasonIds?: string[]): Promise<{
  legWins: number;
  legLosses: number;
  legDraws: number;
  legsFor: number;
  legsAgainst: number;
}> {
  const supabase = supabaseServer();
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
