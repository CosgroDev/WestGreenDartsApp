
"use server";
import { isUuid } from "@/lib/validation";

import { randomUUID } from "crypto";
import { generateOnce, requestReview } from "@/lib/aiReview";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { getFixtureTeamSummary } from "@/data/matchSummary";
import { getPlayerCards, getPlayerGameLog } from "@/data/stats";
import {
  FIXTURE_SYSTEM_PROMPT,
  REVIEW_EFFORT,
  buildSeasonBaseline,
  compareToBaseline,
  deriveMatch,
  round1
} from "@/lib/aiCoaching";

const TEAM_ID = process.env.TEAM_ID;

export type TeamAiReviewResult =
  | { ok: true; review: string }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

export async function generateTeamAiReviewAction(fixtureId: string): Promise<TeamAiReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, reason: "error", message: "Supabase not configured" };

  // The review is the night's summary — generate it once, then read it back.
  const { data: existing } = await supabase
    .from("fixtures")
    .select("ai_team_review")
    .eq("id", fixtureId)
    .single();
  if (existing?.ai_team_review) {
    return { ok: true, review: existing.ai_team_review };
  }

  const summary = await getFixtureTeamSummary(fixtureId);
  if (!summary) return { ok: false, reason: "no_data" };

  // Each player's season norm, so the review can tell a good night for them
  // from a good night in general.
  const cards = summary.seasonId ? await getPlayerCards(summary.seasonId, true) : [];
  const matches = await Promise.all(
    summary.matches.map(async (m) => {
      const log =
        m.westPlayerId && summary.seasonId ? await getPlayerGameLog(m.westPlayerId, summary.seasonId) : [];
      const baseline = buildSeasonBaseline(
        cards.find((c) => c.player_id === m.westPlayerId),
        log,
        new Set(m.legs.map((l) => l.gameId))
      );
      return { m, derived: deriveMatch(m.legs), vsSeason: compareToBaseline(m, baseline), baseline };
    })
  );

  const byVsSeason = matches
    .filter((x) => x.vsSeason?.threeDartAvg !== null && x.vsSeason?.threeDartAvg !== undefined)
    .map((x) => ({ player: x.m.westPlayerName, vsSeasonAvg: x.vsSeason!.threeDartAvg as number }))
    .sort((p, q) => q.vsSeasonAvg - p.vsSeasonAvg);

  const payload = {
    fixture: {
      label: summary.fixtureLabel,
      opponent: summary.opponent,
      teamResult: summary.teamResult,
      matchesPlayed: summary.matchesPlayed,
      matchRecord: `${summary.matchWins}W-${summary.matchDraws}D-${summary.matchLosses}L`,
      legs: `${summary.legsFor}-${summary.legsAgainst}`,
      teamThreeDartAvg: round1(summary.threeDartAvg),
      teamFirstNineAvg: round1(summary.firstNineAvg),
      teamCheckout: {
        hits: summary.checkoutHits,
        attempts: summary.checkoutAttempts,
        pct: round1(summary.checkoutPct)
      },
      teamHighFinish: summary.highFinish,
      teamBestLegDarts: summary.bestLegDarts,
      teamBusts: summary.busts,
      teamBands: summary.bands
    },
    teamDerived: {
      legsLostWithFinishChances: matches.reduce((s, x) => s + x.derived.legsLostWithFinishChances, 0),
      legsLostNeverOnFinish: matches.reduce((s, x) => s + x.derived.legsLostNeverOnFinish, 0),
      lowVisits: matches.reduce((s, x) => s + x.derived.lowVisits, 0),
      scoringPhaseVisits: matches.reduce((s, x) => s + x.derived.scoringPhaseVisits, 0),
      aboveSeasonNorm: byVsSeason.filter((p) => p.vsSeasonAvg >= 3),
      belowSeasonNorm: byVsSeason.filter((p) => p.vsSeasonAvg <= -3).reverse()
    },
    matches: matches.map(({ m, derived, vsSeason, baseline }) => ({
      player: m.westPlayerName,
      opponent: m.opponentPlayer,
      result: m.result,
      legs: `${m.westLegs}-${m.oppLegs}`,
      threeDartAvg: round1(m.threeDartAvg),
      firstNineAvg: round1(m.firstNineAvg),
      checkout: { hits: m.checkoutHits, attempts: m.checkoutAttempts },
      highFinish: m.highFinish,
      bestLegDarts: m.bestLegDarts,
      busts: m.busts,
      bands: m.bands,
      derived: {
        scoringPhaseAvg: derived.scoringPhaseAvg,
        avgDartsToReachFinish: derived.avgDartsToReachFinish,
        legsLostWithFinishChances: derived.legsLostWithFinishChances,
        legsLostNeverOnFinish: derived.legsLostNeverOnFinish,
        lowVisits: derived.lowVisits,
        bestVisit: derived.bestVisit
      },
      seasonAvg: baseline?.threeDartAvg ?? null,
      vsSeason
    }))
  };

  return generateOnce<TeamAiReviewResult>({
    db: supabase,
    key: `fixture:${fixtureId}`,
    readStored: async () => {
      const { data } = await supabase.from("fixtures").select("ai_team_review").eq("id", fixtureId).single();
      return data?.ai_team_review ? { ok: true, review: data.ai_team_review } : null;
    },
    busy: { ok: false, reason: "error", message: "This review is already being written on another device. Try again in a minute." },
    generate: async () => {
      const result = await requestReview({
        system: FIXTURE_SYSTEM_PROMPT,
        payload,
        effort: REVIEW_EFFORT,
        subject: "fixture"
      });
      if (!result.ok) return { ok: false, reason: "error", message: result.message };
      const text = result.text;

      // Persist so the review only runs once and becomes the stored summary.
      await supabase
        .from("fixtures")
        .update({ ai_team_review: text, ai_team_review_at: new Date().toISOString() })
        .eq("id", fixtureId);
      revalidatePath(`/fixtures/${fixtureId}`);

      return { ok: true, review: text };
    }
  });
}

export async function createGameAction(prevState: any, formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  const playerId = formData.get("playerId") as string | null;
  const opponent = (formData.get("opponent") as string | null)?.trim();

  if (!fixtureId || !opponent) return { ok: false, message: "Fixture and opponent are required" };

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { data: fixture, error: fixtureError } = await supabase.from("fixtures").select("home").eq("id", fixtureId).eq("team_id", TEAM_ID).single();
  if (fixtureError || !fixture) return { ok: false, message: "Fixture not found" };
  const { error } = await supabase.from("games").insert({
    team_id: TEAM_ID,
    fixture_id: fixtureId,
    west_green_player_id: playerId || null,
    opponent_player: opponent,
    west_green_starts: !fixture.home,
    // Each created game is its own match; legs added later share this id.
    match_id: randomUUID()
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const fixtureId = formData.get("fixtureId") as string | null;
  const matchId = (formData.get("matchId") as string | null) || null;
  const opponent = formData.get("opponent") as string | null;
  const westId = (formData.get("westId") as string | null) || null;

  if (!isUuid(fixtureId) || (matchId && !isUuid(matchId)) || (westId && !isUuid(westId)) || (!matchId && !opponent)) {
    throw new Error("Match delete was called with invalid identifiers");
  }

  const supabase = await supabaseServer();
  if (!supabase) throw new Error("Database is not configured");

  // Find leg IDs for this match. Prefer the stable match_id; fall back to the
  // fixture page's legacy grouping (case-insensitive opponent name, null-safe
  // player id) for rows without one — .eq() with a null player id matches nothing.
  const { data: games, error: fetchErr } = await supabase
    .from("games")
    .select("id, match_id, opponent_player, west_green_player_id")
    .eq("fixture_id", fixtureId)
    .eq("deleted", false);
  if (fetchErr) throw new Error(`Match lookup failed: ${fetchErr.message}`);
  if (!games || games.length === 0) return;

  const targetOpponent = (opponent || "").trim().toLowerCase();
  const gameIds = games
    .filter((g: any) =>
      matchId
        ? g.match_id === matchId
        : (g.west_green_player_id ?? null) === westId &&
          (g.opponent_player || "").trim().toLowerCase() === targetOpponent
    )
    .map((g: any) => g.id);
  if (gameIds.length === 0) return;

  // Soft-delete scoring events for those legs
  // Hide the legs first: a leg is what every reader filters on, so a failure
  // after this point leaves stray events on hidden legs rather than a visible half-deleted match.
  const { error } = await supabase.from("games").update({ deleted: true }).in("id", gameIds);
  if (error) throw new Error(`Match delete failed: ${error.message}`);
  const { error: eventsError } = await supabase.from("scoring_events").update({ is_deleted: true }).in("game_id", gameIds);
  if (eventsError) throw new Error(`Match delete failed: ${eventsError.message}`);

  revalidatePath(`/fixtures/${fixtureId}`);
}
