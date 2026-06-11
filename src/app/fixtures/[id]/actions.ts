
"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { getFixtureTeamSummary } from "@/data/matchSummary";

const TEAM_ID = process.env.TEAM_ID;

export type TeamAiReviewResult =
  | { ok: true; review: string }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

const TEAM_SYSTEM_PROMPT = `You are an experienced darts captain and coach reviewing a completed pub-league night for the West Green Darts team. The team plays a fixture of singles matches (501 double-out); each West Green player plays one opponent over a set of legs. You understand darts deeply: heavy scoring around treble 20 decides how quickly a player reaches a finish; the first 9 darts set up a leg; checkout percentage and bust discipline decide tight legs; a 26 (20-5-1) signals darts drifting off the 20 bed; switching to 19s rescues a scrappy visit.

You will receive the night's data as JSON: the overall fixture result and team-wide aggregates, plus a per-match breakdown (each West Green player, their opponent, leg score and key numbers). Only West Green visits are tracked — opponent visits are not.

Write a team performance review for the whole night, in a friendly but honest pub-team captain's tone:
1. One short paragraph on the overall story of the fixture — how the team performed as a unit, who carried the night, and where it was won or lost across the board.
2. One short paragraph on the biggest collective area to improve, grounded in the team-wide numbers (scoring power, leg starts, finishing, busts/26s).
3. Finish with 1-2 specific things the team should drill together this week. Prefer the games in their app — "121 Challenge" (checkout practice from 121 to 170), "Practice 501" sessions (best of 1/3/5/7 legs from 301/501/701), and "Killer" (hitting specific numbers on demand) — and say exactly what to focus on.

Refer to players by name where it adds something, but keep the focus on the team. Keep it under 260 words. Plain text only, no headings or markdown.`;

export async function generateTeamAiReviewAction(fixtureId: string): Promise<TeamAiReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  const summary = await getFixtureTeamSummary(fixtureId);
  if (!summary) return { ok: false, reason: "no_data" };

  const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

  const payload = {
    fixture: summary.fixtureLabel,
    opponent: summary.opponent,
    teamResult: summary.teamResult,
    matchesPlayed: summary.matchesPlayed,
    matchRecord: `${summary.matchWins}W-${summary.matchDraws}D-${summary.matchLosses}L`,
    legs: `${summary.legsFor}-${summary.legsAgainst}`,
    teamThreeDartAvg: round1(summary.threeDartAvg),
    teamFirstNineAvg: round1(summary.firstNineAvg),
    teamCheckout: { hits: summary.checkoutHits, attempts: summary.checkoutAttempts },
    teamHighFinish: summary.highFinish,
    teamBestLegDarts: summary.bestLegDarts,
    teamBusts: summary.busts,
    teamBands: summary.bands,
    matches: summary.matches.map((m) => ({
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
      bands: m.bands
    }))
  };

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: TEAM_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this fixture." };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "error", message: "Empty response from the AI." };
    return { ok: true, review: text };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: "error", message: `AI request failed (${err.status}).` };
    }
    return { ok: false, reason: "error", message: "AI request failed." };
  }
}

export async function createGameAction(prevState: any, formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  const playerId = formData.get("playerId") as string | null;
  const opponent = (formData.get("opponent") as string | null)?.trim();

  if (!fixtureId || !opponent) return { ok: false, message: "Fixture and opponent are required" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { error } = await supabase.from("games").insert({
    team_id: TEAM_ID,
    fixture_id: fixtureId,
    west_green_player_id: playerId || null,
    opponent_player: opponent,
    west_green_starts: false
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  const fixtureId = formData.get("fixtureId") as string | null;
  const opponent = formData.get("opponent") as string | null;
  const westId = (formData.get("westId") as string | null) || null;

  if (!fixtureId || !opponent) return;

  const supabase = supabaseServer();
  if (!supabase) return;

  // Find leg IDs for this matchup
  const { data: games, error: fetchErr } = await supabase
    .from("games")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("opponent_player", opponent)
    .eq("west_green_player_id", westId)
    .eq("deleted", false);
  if (fetchErr || !games || games.length === 0) return;

  const gameIds = games.map((g: any) => g.id);

  // Soft-delete scoring events for those legs
  await supabase.from("scoring_events").update({ is_deleted: true }).in("game_id", gameIds);

  const { error } = await supabase.from("games").update({ deleted: true }).in("id", gameIds);

  if (error) return;

  revalidatePath(`/fixtures/${fixtureId}`);
}
