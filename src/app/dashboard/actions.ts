"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getPlayerGameLog, getPlayerCards, getTeamCard } from "@/data/stats";
import { getSeasonToDate, getStoredSeasonSummary } from "@/data/seasonSummary";
import { getSeasons } from "@/data/seasons";
import { supabaseServer } from "@/lib/supabaseServer";

export async function loadPlayerGameLogAction(playerId: string, seasonId: string) {
  if (!playerId) return { ok: false as const, games: [] };
  const games = await getPlayerGameLog(playerId, seasonId || undefined);
  return { ok: true as const, games };
}

export type SeasonAiSummaryResult =
  | { ok: true; summary: string; fixtures: number; at: string | null }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

const SEASON_SYSTEM_PROMPT = `You are an experienced darts captain and coach writing the season-to-date review for the West Green Darts team. The team plays league nights (fixtures); each fixture is up to six singles matches (501 double-out), one West Green player against one opponent over a set of legs. You understand darts deeply: heavy scoring around treble 20 decides how quickly a player reaches a finish; the first 9 darts set up a leg; checkout percentage and bust discipline decide tight legs; a 26 (20-5-1) signals darts drifting off the 20 bed; switching to 19s rescues a scrappy visit.

You will receive the season so far as JSON: the team's fixture-by-fixture results, team-wide aggregates across every completed leg, and a per-player breakdown. Only West Green visits are tracked — opponents' visits are not.

Write a season-to-date review for the whole team, in a friendly but honest pub-team captain's tone:
1. One short paragraph on the story of the season so far — how the team is tracking on results, who is carrying the form, and the overall trend across fixtures.
2. One short paragraph on the biggest collective area to improve, grounded in the team-wide numbers (scoring power, leg starts, finishing, busts/26s).
3. Finish with 1-2 specific things the squad should drill together. Prefer the games in their app — "121 Challenge" (checkout practice from 121 to 170), "Practice 501" sessions (best of 1/3/5/7 legs from 301/501/701), and "Killer" (hitting specific numbers on demand) — and say exactly what to focus on.

Refer to players by name where it adds something, but keep the focus on the team and the season as a whole. Keep it under 280 words. Plain text only, no headings or markdown.`;

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

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

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, reason: "error", message: "Supabase not configured" };

  const season = await getSeasonToDate(id);
  if (!season || season.completedFixtures === 0) return { ok: false, reason: "no_data" };

  // Serve the cached summary unless a new fixture has completed since it was made.
  const stored = await getStoredSeasonSummary(id);
  if (stored.summary && stored.fixtures === season.completedFixtures) {
    return { ok: true, summary: stored.summary, fixtures: season.completedFixtures, at: stored.at };
  }

  const [team, players] = await Promise.all([getTeamCard(id), getPlayerCards(id)]);

  const payload = {
    completedFixtures: season.completedFixtures,
    fixtureRecord: `${season.fixtureWins}W-${season.fixtureDraws}D-${season.fixtureLosses}L`,
    fixtures: season.fixtures.map((f) => ({
      opponent: f.opponent,
      venue: f.home ? "home" : "away",
      result: f.result,
      matchRecord: `${f.matchWins}W-${f.matchDraws}D-${f.matchLosses}L`,
      legs: `${f.legsFor}-${f.legsAgainst}`
    })),
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
    players: players.map((p) => ({
      name: p.name,
      legs: `${p.legs_won}-${p.legs_played - p.legs_won}`,
      threeDartAvg: round1(p.three_dart_avg),
      firstNineAvg: round1(p.first_nine_avg),
      checkoutPct: round1(p.checkout_pct),
      highFinish: p.high_finish,
      oneEighty: p.one_eighty,
      twentySix: p.twenty_six
    }))
  };

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: SEASON_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this season." };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
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
