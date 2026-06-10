"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getMatchSummary } from "@/data/matchSummary";

export type AiReviewResult =
  | { ok: true; review: string }
  | { ok: false; reason: "not_configured" | "no_data" | "error"; message?: string };

const SYSTEM_PROMPT = `You are an experienced darts coach reviewing a pub-league 501 double-out match for the West Green Darts team. You understand the dynamics of darts deeply: heavy scoring around treble 20 decides how quickly a player reaches a finish; the first 9 darts set up a leg; checkout percentage and bust discipline decide tight legs; a 26 (20-5-1) signals darts drifting off the 20 bed; switching to 19s rescues a scrappy visit.

You will receive the match data as JSON: per-leg visit scores for the West Green player (opponent visits are not tracked), plus aggregates. "remainingAfter" shows the score left after each visit.

Write a performance review for the player, addressed to them by name, in a friendly but honest pub-team tone:
1. One short paragraph on the overall story of the match — read the visit sequences, not just the averages (e.g. spot where a leg was lost on the doubles, or a burst of heavy scoring).
2. One short paragraph on the biggest area to improve, grounded in the numbers.
3. Finish with 1-2 specific practice recommendations. Prefer the games available in their app — "121 Challenge" (checkout practice from 121 to 170), "Practice 501" sessions (best of 1/3/5/7 legs from 301/501/701), and "Killer" (hitting specific numbers on demand) — and say exactly what to focus on in each.

Keep it under 220 words. Plain text only, no headings or markdown.`;

export async function generateAiReviewAction(gameId: string): Promise<AiReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: "not_configured" };
  }

  const summary = await getMatchSummary(gameId);
  if (!summary) return { ok: false, reason: "no_data" };

  // Compact payload: per-leg visit list + aggregates
  const payload = {
    player: summary.westPlayerName,
    opponent: summary.opponentPlayer,
    result: summary.result,
    legsScore: `${summary.westLegs}-${summary.oppLegs}`,
    threeDartAvg: summary.threeDartAvg,
    firstNineAvg: summary.firstNineAvg,
    checkout: { hits: summary.checkoutHits, attempts: summary.checkoutAttempts },
    highFinish: summary.highFinish,
    busts: summary.busts,
    bands: summary.bands,
    legs: summary.legs.map((l) => ({
      winner: l.winner,
      darts: l.dartsTotal,
      threeDartAvg: l.threeDartAvg,
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
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "error", message: "The AI declined to review this match." };
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
