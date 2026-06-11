import { supabaseServer } from "@/lib/supabaseServer";

// A fixture is a night of up to 6 singles matches (each West Green player vs
// one opponent, played over a set of legs). Mirrors the fixture page.
const MATCHES_PER_FIXTURE = 6;

export type SeasonFixtureResult = {
  fixtureId: string;
  opponent: string;
  home: boolean;
  startsAt: string;
  result: "win" | "loss" | "draw";
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  legsFor: number;
  legsAgainst: number;
};

export type SeasonToDate = {
  seasonId: string;
  /** Completed fixtures act as the summary's fingerprint — it is regenerated
   *  whenever this count changes (i.e. another fixture has finished). */
  completedFixtures: number;
  fixtures: SeasonFixtureResult[];
  fixtureWins: number;
  fixtureDraws: number;
  fixtureLosses: number;
};

/**
 * Season-to-date fixture results: every *completed* fixture in the season
 * (all 6 matches in, none still in progress) rolled up to a win/draw/loss and
 * leg count, most recent last. `completedFixtures` is the fingerprint the
 * dashboard uses to decide when the AI season summary needs regenerating.
 */
export async function getSeasonToDate(seasonId: string): Promise<SeasonToDate | null> {
  const supabase = supabaseServer();
  if (!supabase || !seasonId) return null;

  const { data: games, error } = await supabase
    .from("games")
    .select(
      "id, fixture_id, west_green_player_id, opponent_player, winner, status, created_at, fixtures!inner(id, opponent, home, starts_at, season_id)"
    )
    .eq("deleted", false)
    .eq("fixtures.season_id", seasonId);
  if (error || !games) return null;

  // Group games -> fixtures -> matches (player + opponent), like the fixture page.
  const byFixture = new Map<string, any[]>();
  games.forEach((g: any) => {
    const list = byFixture.get(g.fixture_id) ?? [];
    list.push(g);
    byFixture.set(g.fixture_id, list);
  });

  const fixtures: SeasonFixtureResult[] = [];
  for (const list of byFixture.values()) {
    const matches = new Map<string, any[]>();
    list.forEach((g: any) => {
      const key = `${g.west_green_player_id || "none"}|${(g.opponent_player || "").trim().toLowerCase()}`;
      const arr = matches.get(key) ?? [];
      arr.push(g);
      matches.set(key, arr);
    });

    const anyInProgress = list.some((g: any) => g.status === "in_progress");
    // Only count a fixture once it is fully played out.
    if (matches.size < MATCHES_PER_FIXTURE || anyInProgress) continue;

    let matchWins = 0;
    let matchDraws = 0;
    let matchLosses = 0;
    let legsFor = 0;
    let legsAgainst = 0;
    for (const arr of matches.values()) {
      const completed = arr.filter((g: any) => g.status === "completed");
      const westWins = completed.filter((g: any) => g.winner === "west_green").length;
      const oppWins = completed.filter((g: any) => g.winner === "opponent").length;
      legsFor += westWins;
      legsAgainst += oppWins;
      if (westWins > oppWins) matchWins += 1;
      else if (oppWins > westWins) matchLosses += 1;
      else matchDraws += 1;
    }

    const f = list[0].fixtures;
    fixtures.push({
      fixtureId: f.id,
      opponent: f.opponent,
      home: f.home,
      startsAt: f.starts_at,
      result: matchWins > matchLosses ? "win" : matchLosses > matchWins ? "loss" : "draw",
      matchWins,
      matchDraws,
      matchLosses,
      legsFor,
      legsAgainst
    });
  }

  fixtures.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    seasonId,
    completedFixtures: fixtures.length,
    fixtures,
    fixtureWins: fixtures.filter((f) => f.result === "win").length,
    fixtureDraws: fixtures.filter((f) => f.result === "draw").length,
    fixtureLosses: fixtures.filter((f) => f.result === "loss").length
  };
}

// The stored summary is read defensively (separate query) so the dashboard
// still renders if the ai_season_summary columns haven't been migrated yet.
export async function getStoredSeasonSummary(
  seasonId: string
): Promise<{ summary: string | null; at: string | null; fixtures: number | null }> {
  const supabase = supabaseServer();
  if (!supabase || !seasonId) return { summary: null, at: null, fixtures: null };

  const { data, error } = await supabase
    .from("seasons")
    .select("ai_season_summary, ai_season_summary_at, ai_season_summary_fixtures")
    .eq("id", seasonId)
    .single();
  if (error || !data) return { summary: null, at: null, fixtures: null };

  return {
    summary: (data as any).ai_season_summary ?? null,
    at: (data as any).ai_season_summary_at ?? null,
    fixtures: (data as any).ai_season_summary_fixtures ?? null
  };
}
