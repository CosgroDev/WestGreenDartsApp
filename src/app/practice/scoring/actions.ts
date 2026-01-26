"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";
import { computeRemaining } from "@/lib/scoringUtils";

const TEAM_ID = process.env.TEAM_ID;

async function fetchEvents(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return [] as any[];
  const { data } = await supabase
    .from("practice_events")
    .select("id, score, darts, remaining_after, is_bust, is_checkout")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });
  return (data as any[]) || [];
}

export async function loadPracticeStateAction(gameId: string) {
  const visits = await fetchEvents(gameId);
  const remaining = computeRemaining(visits.map((v) => ({
    score: v.score,
    darts: v.darts,
    remaining_after: v.remaining_after,
    is_bust: v.is_bust,
    is_checkout: v.is_checkout
  })) as any);

  const supabase = supabaseServer();
  let meta: any = null;
  if (supabase) {
    const { data: game } = await supabase
      .from("practice_games")
      .select(
        "id, session_id, leg_index, status, winner, darts_thrown, high_finish, practice_sessions(start_score, player_a_id, player_b_id, legs_to_play, status, player_a:player_a_id(name), player_b:player_b_id(name))"
      )
      .eq("id", gameId)
      .single();
    if (game) meta = game;
  }
  const finishHint = remaining >= 2 && remaining <= 170 ? finishRoutes[remaining] ?? null : null;
  return { ok: true, visits, remaining, finishHint, meta };
}

export async function recordPracticeVisitAction(
  gameId: string,
  side: "a" | "b",
  score: number,
  dartsOverride?: number
) {
  if (!Number.isInteger(score) || score < 0 || score > 180) {
    return { ok: false, message: "Score must be 0-180" };
  }
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const visits = await fetchEvents(gameId);
  const remaining = computeRemaining(visits.map((v) => ({
    score: v.score,
    darts: v.darts,
    remaining_after: v.remaining_after,
    is_bust: v.is_bust,
    is_checkout: v.is_checkout
  })) as any);
  const next = remaining - score;
  const isCheckout = next === 0;
  const isBust = !isCheckout && (next < 0 || next === 1);
  const remainingAfter = isBust ? remaining : next;
  const dartsUsed = isCheckout ? dartsOverride ?? 3 : 3;

  const { data: gameSession } = await supabase
    .from("practice_games")
    .select("session_id")
    .eq("id", gameId)
    .single();

  const { error } = await supabase.from("practice_events").insert({
    team_id: TEAM_ID,
    game_id: gameId,
    session_id: gameSession?.session_id ?? null,
    throw_index: visits.length + 1,
    score,
    darts: dartsUsed,
    remaining_after: remainingAfter,
    is_bust: isBust,
    is_checkout: isCheckout
  });
  if (error) return { ok: false, message: error.message };

  // If checkout, mark game + possibly session
  if (isCheckout && remainingAfter === 0) {
    const totalVisits = await fetchEvents(gameId);
    const totalDarts = totalVisits.reduce((s, v) => s + (v.darts ?? 0), 0);
    const finishScore = score;
    const { data: game } = await supabase
      .from("practice_games")
      .select("session_id, leg_index")
      .eq("id", gameId)
      .single();

    await supabase
      .from("practice_games")
      .update({
        status: "completed",
        winner: side === "a" ? "player_a" : "player_b",
        darts_thrown: totalDarts,
        high_finish: finishScore,
        completed_at: new Date().toISOString()
      })
      .eq("id", gameId);

    if (game) {
      const { data: session } = await supabase
        .from("practice_sessions")
        .select("legs_to_play")
        .eq("id", game.session_id)
        .single();
      const { count: completedCount } = await supabase
        .from("practice_games")
        .select("id", { count: "exact" })
        .eq("session_id", game.session_id)
        .eq("status", "completed");

      if (session && completedCount !== null && completedCount < (session.legs_to_play ?? 1)) {
        await supabase.from("practice_games").insert({
          session_id: game.session_id,
          leg_index: (game.leg_index ?? 1) + 1,
          status: "in_progress"
        });
      } else if (session && completedCount !== null && completedCount >= (session.legs_to_play ?? 1)) {
        await supabase
          .from("practice_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", game.session_id);
      }
    }
  }

  revalidatePath(`/practice/scoring?game=${gameId}`);
  return { ok: true };
}

export async function undoLastPracticeVisitAction(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };
  const { data: last } = await supabase
    .from("practice_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: true };
  await supabase.from("practice_events").update({ is_deleted: true }).eq("id", last.id);
  revalidatePath(`/practice/scoring?game=${gameId}`);
  return { ok: true };
}
