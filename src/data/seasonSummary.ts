import { allRows } from "@/lib/database";
import { summariseFixture, MATCHES_PER_FIXTURE } from "@/lib/fixtureState";
import { supabaseServer } from "@/lib/supabaseServer";

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

export type SeasonFixtureAnomaly = {
  fixtureId: string;
  opponent: string;
  startsAt: string;
  matchesFound: number;
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
  /** Nights with settled matches but an incomplete lineup remain visible
   *  for the captain to review; they never count as completed fixtures. */
  anomalies: SeasonFixtureAnomaly[];
};

/**
 * Season-to-date fixture results: every *completed* fixture in the season
 * (all 6 matches in, none still in progress) rolled up to a win/draw/loss and
 * leg count, most recent last. `completedFixtures` is the fingerprint the
 * dashboard uses to decide when the AI season summary needs regenerating.
 */
export async function getSeasonToDate(seasonId: string, sharedGames?: any[]): Promise<SeasonToDate | null> {
  const supabase = sharedGames ? null : await supabaseServer();
  if ((!supabase && !sharedGames) || !seasonId) return null;

  const { data: games, error } = sharedGames ? { data: sharedGames, error: null } : await allRows(() => supabase!
    .from("games")
    .select(
      "id, match_id, fixture_id, west_green_player_id, opponent_player, winner, status, created_at, fixtures!inner(id, opponent, home, starts_at, season_id)"
    )
    .eq("deleted", false)
    .eq("fixtures.season_id", seasonId).order("id", { ascending: true }));
  if (error || !games) return null;

  // Group games -> fixtures -> matches (player + opponent), like the fixture page.
  const byFixture = new Map<string, any[]>();
  games.forEach((g: any) => {
    if (g.deleted === true) return;
    const list = byFixture.get(g.fixture_id) ?? [];
    list.push(g);
    byFixture.set(g.fixture_id, list);
  });

  const fixtures: SeasonFixtureResult[] = [];
  const anomalies: SeasonFixtureAnomaly[] = [];
  for (const list of byFixture.values()) {
    const state = summariseFixture(list);
    const matchesFound = state.matches.length;
    if (matchesFound !== MATCHES_PER_FIXTURE && state.completedMatches === matchesFound) {
      const f = list[0].fixtures;
      anomalies.push({ fixtureId: f.id, opponent: f.opponent, startsAt: f.starts_at, matchesFound });
    }
    if (!state.complete) continue;
    const { matchWins, matchDraws, matchLosses, legsFor, legsAgainst } = state;

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
    fixtureLosses: fixtures.filter((f) => f.result === "loss").length,
    anomalies
  };
}

// The stored summary is read defensively (separate query) so the dashboard
// still renders if the ai_season_summary columns haven't been migrated yet.
export async function getStoredSeasonSummary(
  seasonId: string
): Promise<{ summary: string | null; at: string | null; fixtures: number | null }> {
  const supabase = await supabaseServer();
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
