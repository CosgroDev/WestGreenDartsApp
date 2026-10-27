"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMatchSummary } from "@/data/matchSummary";
import { getPlayerCards, getPlayerGameLog } from "@/data/stats";
import {
  MATCH_SYSTEM_PROMPT,
  REVIEW_EFFORT,
  REVIEW_FALLBACK_MODEL,
  REVIEW_MODEL,
  buildSeasonBaseline,
  compareToBaseline,
  deriveMatch,
  round1
} from "@/lib/aiCoaching";

export type AiReviewResult =
  | { ok: true; review: string }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

export async function generateAiReviewAction(gameId: string): Promise<AiReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  const supabase = await supabaseServer();

  // A completed match never changes — generate the review once, then read it
  // back rather than regenerating on every visit.
  if (supabase) {
    const { data: existing } = await supabase
      .from("games")
      .select("ai_review")
      .eq("id", gameId)
      .single();
    if (existing?.ai_review) {
      return { ok: true, review: existing.ai_review };
    }
  }

  const summary = await getMatchSummary(gameId);
  if (!summary) return { ok: false, reason: "no_data" };

  // The player's own season is the yardstick that makes the review personal —
  // without it every match is judged in isolation and the feedback repeats.
  let baseline = null;
  if (summary.westPlayerId && summary.seasonId) {
    const [cards, log] = await Promise.all([
      getPlayerCards(summary.seasonId, true),
      getPlayerGameLog(summary.westPlayerId, summary.seasonId)
    ]);
    baseline = buildSeasonBaseline(
      cards.find((c) => c.player_id === summary.westPlayerId),
      log,
      new Set(summary.legs.map((l) => l.gameId))
    );
  }

  const payload = {
    match: {
      player: summary.westPlayerName,
      opponent: summary.opponentPlayer,
      result: summary.result,
      legsScore: `${summary.westLegs}-${summary.oppLegs}`,
      threeDartAvg: round1(summary.threeDartAvg),
      firstNineAvg: round1(summary.firstNineAvg),
      checkout: { hits: summary.checkoutHits, attempts: summary.checkoutAttempts, pct: round1(summary.checkoutPct) },
      highFinish: summary.highFinish,
      bestLegDarts: summary.bestLegDarts,
      busts: summary.busts,
      bands: summary.bands
    },
    derived: deriveMatch(summary.legs),
    seasonBaseline: baseline
      ? { ...baseline, vsSeason: compareToBaseline(summary, baseline) }
      : null,
    legs: summary.legs.map((l, i) => ({
      leg: i + 1,
      winner: l.winner,
      darts: l.dartsTotal,
      visits: l.visits.map((v) => ({
        score: v.score,
        remainingAfter: v.remainingAfter,
        bust: v.isBust || undefined,
        checkout: v.isCheckout || undefined
      }))
    }))
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
      system: MATCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this match." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { ok: false, reason: "error", message: "Empty response from the AI." };

    // Persist so the review only runs once and becomes the stored match summary.
    if (supabase) {
      await supabase
        .from("games")
        .update({ ai_review: text, ai_review_at: new Date().toISOString() })
        .eq("id", gameId);
      revalidatePath(`/matches/${gameId}`);
    }

    return { ok: true, review: text };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, reason: "error", message: `AI request failed (${err.status}).` };
    }
    return { ok: false, reason: "error", message: "AI request failed." };
  }
}
