"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";
import { buildLegStats } from "@/lib/scoringUtils";

const TEAM_ID = process.env.TEAM_ID;
const START_FALLBACK = 501;

async function fetchEvents(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return [] as any[];
  const { data } = await supabase
    .from("practice_events")
    .select("id, score, darts, remaining_after, is_bust, is_checkout, thrower")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });
  return (data as any[]) || [];
}

export async function loadPracticeStateAction(gameId: string) {
  const visits = await fetchEvents(gameId);

  const visitsA = visits.filter((v: any) => v.thrower === "player_a");
  const visitsB = visits.filter((v: any) => v.thrower === "player_b");

  const supabase = supabaseServer();
  let meta: any = null;
  let startScore = START_FALLBACK;
  if (supabase) {
    const { data: game } = await supabase
      .from("practice_games")
      .select(
        "id, session_id, leg_index, status, winner, darts_thrown, high_finish, practice_sessions(start_score, player_a_id, player_b_id, legs_to_play, status, player_a:player_a_id(name), player_b:player_b_id(name))"
      )
      .eq("id", gameId)
      .single();
    if (game) {
      meta = game;
      startScore = (game as any).practice_sessions?.start_score ?? START_FALLBACK;
    }
  }

  const remainingA = visitsA.length ? visitsA[visitsA.length - 1].remaining_after : startScore;
  const remainingB = visitsB.length ? visitsB[visitsB.length - 1].remaining_after : startScore;

  const finishHintA = remainingA >= 2 && remainingA <= 170 ? (finishRoutes[remainingA] ?? null) : null;
  const finishHintB = remainingB >= 2 && remainingB <= 170 ? (finishRoutes[remainingB] ?? null) : null;

  const toVisit = (v: any) => ({
    score: v.score,
    darts: v.darts,
    remaining_after: v.remaining_after,
    is_bust: v.is_bust,
    is_checkout: v.is_checkout,
  });
  const statsA = buildLegStats(visitsA.map(toVisit));
  const statsB = buildLegStats(visitsB.map(toVisit));

  return { ok: true, visits, remainingA, remainingB, finishHintA, finishHintB, statsA, statsB, meta };
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

  const allVisits = await fetchEvents(gameId);
  const throwerKey = side === "a" ? "player_a" : "player_b";
  const sideVisits = allVisits.filter((v: any) => v.thrower === throwerKey);

  // Get startScore from session
  const { data: gameData } = await supabase
    .from("practice_games")
    .select("session_id, practice_sessions(start_score)")
    .eq("id", gameId)
    .single();
  const startScore = (gameData as any)?.practice_sessions?.start_score ?? START_FALLBACK;
  const sessionId = (gameData as any)?.session_id ?? null;

  const remaining = sideVisits.length ? sideVisits[sideVisits.length - 1].remaining_after : startScore;
  const next = remaining - score;
  const isCheckout = next === 0;
  const isBust = !isCheckout && (next < 0 || next === 1);
  const remainingAfter = isBust ? remaining : next;
  const dartsUsed = isCheckout ? (dartsOverride ?? 3) : 3;

  const { error } = await supabase.from("practice_events").insert({
    team_id: TEAM_ID,
    game_id: gameId,
    session_id: sessionId,
    thrower: throwerKey,
    throw_index: allVisits.length + 1,
    score,
    darts: dartsUsed,
    remaining_after: remainingAfter,
    is_bust: isBust,
    is_checkout: isCheckout,
  });
  if (error) return { ok: false, message: error.message };

  // If checkout, mark game complete and auto-create next leg or close session
  if (isCheckout && remainingAfter === 0) {
    const updatedVisits = await fetchEvents(gameId);
    const sideUpdated = updatedVisits.filter((v: any) => v.thrower === throwerKey);
    const totalDarts = sideUpdated.reduce((s: number, v: any) => s + (v.darts ?? 0), 0);

    const { data: game } = await supabase
      .from("practice_games")
      .select("session_id, leg_index")
      .eq("id", gameId)
      .single();

    await supabase
      .from("practice_games")
      .update({
        status: "completed",
        winner: throwerKey,
        darts_thrown: totalDarts,
        high_finish: score,
        completed_at: new Date().toISOString(),
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
          leg_index: ((game as any).leg_index ?? 1) + 1,
          status: "in_progress",
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

export async function deletePracticeSessionFromScoringAction(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false };

  const { data: games } = await supabase
    .from("practice_games")
    .select("id")
    .eq("session_id", sessionId);

  if (games?.length) {
    const gameIds = games.map((g: any) => g.id);
    await supabase.from("practice_events").delete().in("game_id", gameIds);
    await supabase.from("practice_games").delete().eq("session_id", sessionId);
  }

  await supabase.from("practice_sessions").delete().eq("id", sessionId);
  revalidatePath("/practice");
  return { ok: true };
}

export async function undoLastPracticeVisitAction(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { data: last } = await supabase
    .from("practice_events")
    .select("id, thrower")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!last) return { ok: true, undidThrower: null };

  await supabase.from("practice_events").update({ is_deleted: true }).eq("id", last.id);

  // If the game was completed, reopen it (e.g. undo after checkout)
  await supabase
    .from("practice_games")
    .update({ status: "in_progress", winner: null, completed_at: null })
    .eq("id", gameId)
    .eq("status", "completed");

  revalidatePath(`/practice/scoring?game=${gameId}`);
  return { ok: true, undidThrower: (last as any).thrower ?? null };
}
