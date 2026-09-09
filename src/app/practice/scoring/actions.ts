"use server";
import { stableRead } from "@/lib/stableRead";
import { scoringCommand } from "@/lib/scoringCommand";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";
import { buildLegStats } from "@/lib/scoringUtils";

const TEAM_ID = process.env.TEAM_ID;
const START_FALLBACK = 501;

async function fetchEvents(gameId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return [] as any[];
  const { data, error } = await supabase
    .from("practice_events")
    .select("id, score, darts, remaining_after, is_bust, is_checkout, thrower")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as any[]) || [];
}

export async function loadPracticeStateAction(gameId: string) {
  return stableRead("practice_games", gameId, () => readState(gameId));
}

async function readState(gameId: string) {
  const visits = await fetchEvents(gameId);

  const visitsA = visits.filter((v: any) => v.thrower === "player_a");
  const visitsB = visits.filter((v: any) => v.thrower === "player_b");

  const supabase = await supabaseServer();
  let meta: any = null;
  let startScore = START_FALLBACK;
  if (supabase) {
    const { data: game } = await supabase
      .from("practice_games")
      .select(
        "id, session_id, leg_index, revision, status, winner, darts_thrown, high_finish, practice_sessions(start_score, player_a_id, player_b_id, legs_to_play, status, player_a:player_a_id(name), player_b:player_b_id(name))"
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

export async function recordPracticeVisitAction(gameId: string, side: "a" | "b", score: number, dartsOverride = 3, revision?: number, requestId?: string): Promise<any> {
  if (!Number.isInteger(score) || score < 0 || score > 180 || !Number.isInteger(dartsOverride) || dartsOverride < 1 || dartsOverride > 3 || !["a", "b"].includes(side)) return { ok: false, message: "Invalid score or dart count" };
  const result = await scoringCommand(gameId, true, "record", {side: side === "a" ? "player_a" : "player_b", score, darts: dartsOverride, revision, requestId});
  if (result.ok) revalidatePath("/practice");
  return result;
}

export async function deletePracticeSessionFromScoringAction(sessionId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false };

  const { error } = await supabase.from("practice_sessions").delete().eq("id", sessionId).eq("team_id", TEAM_ID);
  if (error) return {ok: false, message: error.message};
  revalidatePath("/practice");
  return { ok: true };
}

export async function undoLastPracticeVisitAction(gameId: string, revision?: number): Promise<any> {
  const result = await scoringCommand(gameId, true, "undo", {revision});
  if (result.ok) revalidatePath("/practice");
  return result;
}
