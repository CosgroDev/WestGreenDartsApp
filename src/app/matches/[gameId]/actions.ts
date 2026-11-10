"use server";

import { generateOnce, requestReview } from "@/lib/aiReview";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { getMatchSummary } from "@/data/matchSummary";
import { getPlayerCards, getPlayerGameLog, getSeasonOpposition } from "@/data/stats";
import { fieldAverage, gameDifficulty } from "@/lib/opposition";
import {
  MATCH_SYSTEM_PROMPT,
  REVIEW_EFFORT,
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

  const fieldAvg = fieldAverage(await getSeasonOpposition(summary.seasonId));

  const payload = {
    seasonOpposition: round1(fieldAvg),
    difficulty: gameDifficulty(summary.opponent?.threeDartAvg, fieldAvg),
    match: {
      player: summary.westPlayerName,
      opponent: summary.opponentPlayer,
      fixture: summary.fixtureLabel,
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
      winner: l.winner === "west" ? "player" : l.winner,
      threwFirst: l.westStarted ?? null,
      darts: l.dartsTotal,
      visits: l.visits.map((v) => ({
        score: v.score,
        left: v.remainingAfter,
        opponentLeft: v.otherLeft,
        bust: v.isBust || undefined,
        checkout: v.isCheckout || undefined
      })),
      opponentVisits: (l.opponentVisits ?? []).map((v) => ({
        score: v.score,
        left: v.remainingAfter,
        bust: v.isBust || undefined,
        checkout: v.isCheckout || undefined
      }))
    }))
  };

  return generateOnce<AiReviewResult>({
    db: supabase,
    key: `match:${gameId}`,
    readStored: async () => {
      if (!supabase) return null;
      const { data } = await supabase.from("games").select("ai_review").eq("id", gameId).single();
      return data?.ai_review ? { ok: true, review: data.ai_review } : null;
    },
    busy: { ok: false, reason: "error", message: "This review is already being written on another device. Try again in a minute." },
    generate: async () => {
      const result = await requestReview({
        system: MATCH_SYSTEM_PROMPT,
        payload,
        effort: REVIEW_EFFORT,
        subject: "match"
      });
      if (!result.ok) return { ok: false, reason: "error", message: result.message };
      const text = result.text;

      // Persist so the review only runs once and becomes the stored match summary.
      if (supabase) {
        await supabase
          .from("games")
          .update({ ai_review: text, ai_review_at: new Date().toISOString() })
          .eq("id", gameId);
        revalidatePath(`/matches/${gameId}`);
      }

      return { ok: true, review: text };
    }
  });
}
