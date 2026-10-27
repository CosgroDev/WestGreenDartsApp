"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getPlayerGameLog, getPlayerCards, getTeamCard } from "@/data/stats";
import { getSeasonToDate, getStoredSeasonSummary } from "@/data/seasonSummary";
import { getSeasons } from "@/data/seasons";
import { countPlayerSeasonLegs, getPlayerSeasonMatches, getStoredPlayerInsight } from "@/data/playerInsights";
import { derivePlayerSeason, squadContext } from "@/lib/playerInsights";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  PLAYER_INSIGHT_EFFORT,
  PLAYER_SYSTEM_PROMPT,
  REVIEW_EFFORT,
  REVIEW_FALLBACK_MODEL,
  REVIEW_MODEL,
  SEASON_SYSTEM_PROMPT,
  playerForm,
  round1
} from "@/lib/aiCoaching";

export async function loadPlayerGameLogAction(playerId: string, seasonId: string) {
  if (!playerId) return { ok: false as const, games: [] };
  const games = await getPlayerGameLog(playerId, seasonId || undefined);
  return { ok: true as const, games };
}

export type SeasonAiSummaryResult =
  | { ok: true; summary: string; fixtures: number; at: string | null }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };


/**
 * Generate (or read back) the season-to-date AI summary for the dashboard.
 * The summary is stored against the season and fingerprinted by the number of
 * completed fixtures, so it is regenerated once after each fixture finishes and
 * served from cache the rest of the time.
 */
export async function generateSeasonAiSummaryAction(seasonId: string): Promise<SeasonAiSummaryResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: "not_configured" };

  const id = seasonId || (await getSeasons()).find((s) => s.is_current)?.id || "";
  if (!id) return { ok: false, reason: "no_data" };

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, reason: "error", message: "Supabase not configured" };

  const season = await getSeasonToDate(id);
  if (!season || season.completedFixtures === 0) return { ok: false, reason: "no_data" };

  // Serve the cached summary unless a new fixture has completed since it was made.
  const stored = await getStoredSeasonSummary(id);
  if (stored.summary && stored.fixtures === season.completedFixtures) {
    return { ok: true, summary: stored.summary, fixtures: season.completedFixtures, at: stored.at };
  }

  const [team, players] = await Promise.all([getTeamCard(id), getPlayerCards(id)]);
  // Recent-vs-earlier form per player turns a snapshot into a trend.
  const logs = await Promise.all(players.map((p) => getPlayerGameLog(p.player_id, id)));

  const payload = {
    season: {
      completedFixtures: season.completedFixtures,
      fixtureRecord: `${season.fixtureWins}W-${season.fixtureDraws}D-${season.fixtureLosses}L`,
      fixtures: season.fixtures.map((f) => ({
        date: f.startsAt.slice(0, 10),
        opponent: f.opponent,
        venue: f.home ? "home" : "away",
        result: f.result,
        matchRecord: `${f.matchWins}W-${f.matchDraws}D-${f.matchLosses}L`,
        legs: `${f.legsFor}-${f.legsAgainst}`
      }))
    },
    team: {
      legs: `${team.legs_won}-${team.legs_played - team.legs_won}`,
      threeDartAvg: round1(team.three_dart_avg),
      checkoutPct: round1(team.checkout_pct),
      dartsPerLegWon: round1(team.darts_per_leg_won),
      highFinish: team.high_finish,
      sixtyPlus: team.sixty_plus,
      hundredPlus: team.hundred_plus,
      hundredFortyPlus: team.hundred_forty_plus,
      oneEighty: team.one_eighty_count
    },
    players: players
      .map((p, i) => ({
        name: p.name,
        matches: p.matches_played,
        legs: `${p.legs_won}-${p.legs_played - p.legs_won}`,
        threeDartAvg: round1(p.three_dart_avg),
        firstNineAvg: round1(p.first_nine_avg),
        checkoutPct: round1(p.checkout_pct),
        checkoutAttempts: p.checkout_attempts,
        dartsPerLegWon: round1(p.darts_per_leg_won),
        highFinish: p.high_finish,
        hundredPlus: p.hundred_plus,
        hundredFortyPlus: p.hundred_forty_plus,
        oneEighty: p.one_eighty,
        twentySix: p.twenty_six,
        form: playerForm(logs[i])
      }))
      .filter((p) => p.matches > 0),
    previousSummary: stored.summary
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: REVIEW_EFFORT },
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: REVIEW_FALLBACK_MODEL }],
      system: SEASON_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this season." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "error", message: "Empty response from the AI." };

    const at = new Date().toISOString();
    await supabase
      .from("seasons")
      .update({
        ai_season_summary: text,
        ai_season_summary_at: at,
        ai_season_summary_fixtures: season.completedFixtures
      })
      .eq("id", id);
    revalidatePath("/dashboard");

    return { ok: true, summary: text, fixtures: season.completedFixtures, at };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: "error", message: `AI request failed (${err.status}).` };
    }
    return { ok: false, reason: "error", message: "AI request failed." };
  }
}

export type PlayerAiInsightState = {
  configured: boolean;
  summary: string | null;
  at: string | null;
  /** Completed legs the stored insight analysed. */
  legsCovered: number | null;
  /** Completed legs the player has right now — more than legsCovered means stale. */
  legsNow: number;
};

/** The stored insight for a leaderboard row, plus whether it's out of date. */
export async function loadPlayerAiInsightAction(playerId: string, seasonId: string): Promise<PlayerAiInsightState> {
  const [stored, legsNow] = await Promise.all([
    getStoredPlayerInsight(playerId, seasonId),
    countPlayerSeasonLegs(playerId, seasonId)
  ]);
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY),
    summary: stored.summary,
    at: stored.at,
    legsCovered: stored.legs,
    legsNow
  };
}

export type PlayerAiInsightResult =
  | { ok: true; summary: string; legs: number; at: string | null }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

/**
 * Generate one player's season insight from every visit they've thrown. It is
 * stored per player and season and fingerprinted by completed legs, so asking
 * again before they've played another leg returns the cached copy for free.
 */
export async function generatePlayerAiInsightAction(
  playerId: string,
  seasonId: string
): Promise<PlayerAiInsightResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, reason: "not_configured" };
  if (!playerId || !seasonId) return { ok: false, reason: "no_data" };

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, reason: "error", message: "Supabase not configured" };

  const [season, stored, cards] = await Promise.all([
    getPlayerSeasonMatches(playerId, seasonId),
    getStoredPlayerInsight(playerId, seasonId),
    // Active players, so the squad ranks match the dashboard leaderboard.
    getPlayerCards(seasonId)
  ]);
  if (!season || season.completedLegs === 0) return { ok: false, reason: "no_data" };
  if (stored.summary && stored.legs === season.completedLegs) {
    return { ok: true, summary: stored.summary, legs: season.completedLegs, at: stored.at };
  }

  const card =
    cards.find((c) => c.player_id === playerId) ??
    (await getPlayerCards(seasonId, true)).find((c) => c.player_id === playerId);
  if (!card) return { ok: false, reason: "no_data" };

  const payload = {
    player: {
      name: card.name,
      matches: card.matches_played,
      legs: `${card.legs_won}-${card.legs_played - card.legs_won}`,
      threeDartAvg: round1(card.three_dart_avg),
      firstNineAvg: round1(card.first_nine_avg),
      checkoutPct: round1(card.checkout_pct),
      checkoutAttempts: card.checkout_attempts,
      dartsPerLegWon: round1(card.darts_per_leg_won),
      highFinish: card.high_finish,
      hundredPlus: card.hundred_plus,
      hundredFortyPlus: card.hundred_forty_plus,
      oneEighty: card.one_eighty
    },
    derived: derivePlayerSeason(season.matches),
    squad: squadContext(playerId, cards.some((c) => c.player_id === playerId) ? cards : [...cards, card]),
    previousInsight: stored.summary
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 20000,
      thinking: { type: "adaptive" },
      output_config: { effort: PLAYER_INSIGHT_EFFORT },
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: REVIEW_FALLBACK_MODEL }],
      system: PLAYER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this player." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "error", message: "Empty response from the AI." };

    const at = new Date().toISOString();
    await supabase.from("player_ai_insights").upsert(
      { player_id: playerId, season_id: seasonId, summary: text, generated_at: at, legs_covered: season.completedLegs },
      { onConflict: "player_id,season_id" }
    );

    return { ok: true, summary: text, legs: season.completedLegs, at };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: "error", message: `AI request failed (${err.status}).` };
    }
    return { ok: false, reason: "error", message: "AI request failed." };
  }
}
