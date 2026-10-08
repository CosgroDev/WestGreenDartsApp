"use server";
import { allRows } from "@/lib/database";
import { practiceScoreSnapshot, missingSnapshotRPC } from "@/lib/scoreSnapshot";
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

export async function loadPracticeStateAction(gameId: string): Promise<any> {
  const db = await supabaseServer();
  if (!db) return { ok: false, message: "Database not configured" };
  const { data, error } = await db.rpc("wgd_score_snapshot", {
    p_game: gameId,
    p_team: process.env.TEAM_ID,
    p_practice: true,
  });
  if (!error) return addSessionSummary(practiceScoreSnapshot(data));
  if (!missingSnapshotRPC(error, "wgd_score_snapshot"))
    return { ok: false, message: error.message };
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
        "id, session_id, leg_index, revision, status, winner, darts_thrown, high_finish, practice_sessions(solo_mode,start_score, player_a_id, player_b_id, legs_to_play, status, player_a:player_a_id(name), player_b:player_b_id(name))",
      )
      .eq("id", gameId)
      .single();
    if (game) {
      meta = game;
      startScore =
        (game as any).practice_sessions?.start_score ?? START_FALLBACK;
    }
  }

  const remainingA = visitsA.length
    ? visitsA[visitsA.length - 1].remaining_after
    : startScore;
  const remainingB = visitsB.length
    ? visitsB[visitsB.length - 1].remaining_after
    : startScore;

  const finishHintA =
    remainingA >= 2 && remainingA <= 170
      ? (finishRoutes[remainingA] ?? null)
      : null;
  const finishHintB =
    remainingB >= 2 && remainingB <= 170
      ? (finishRoutes[remainingB] ?? null)
      : null;

  const toVisit = (v: any) => ({
    score: v.score,
    darts: v.darts,
    remaining_after: v.remaining_after,
    is_bust: v.is_bust,
    is_checkout: v.is_checkout,
  });
  const statsA = buildLegStats(visitsA.map(toVisit));
  const statsB = buildLegStats(visitsB.map(toVisit));

  return {
    ok: true,
    visits,
    remainingA,
    remainingB,
    finishHintA,
    finishHintB,
    statsA,
    statsB,
    meta,
  };
}

export async function recordPracticeVisitAction(
  gameId: string,
  side: "a" | "b",
  score: number,
  dartsOverride = 3,
  revision?: number,
  requestId?: string,
): Promise<any> {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 180 ||
    !Number.isInteger(dartsOverride) ||
    dartsOverride < 1 ||
    dartsOverride > 3 ||
    !["a", "b"].includes(side)
  )
    return { ok: false, message: "Invalid score or dart count" };
  const result = await scoringCommand(gameId, true, "record", {
    side: side === "a" ? "player_a" : "player_b",
    score,
    darts: dartsOverride,
    revision,
    requestId,
    returnState: true,
  });
  if (result.ok) revalidatePath("/practice");
  if (!result.ok) return result;
  const state = result.state
    ? practiceScoreSnapshot(result.state)
    : await loadPracticeStateAction(gameId);
  return {
    ...(await addSessionSummary(state)),
    undidThrower: result.undidThrower,
  };
}

export async function deletePracticeSessionFromScoringAction(
  sessionId: string,
) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false };

  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("team_id", TEAM_ID);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/practice");
  return { ok: true };
}

export async function undoLastPracticeVisitAction(
  gameId: string,
  revision?: number,
  requestId?: string,
): Promise<any> {
  const result = await scoringCommand(gameId, true, "undo", {
    revision,
    requestId,
    returnState: true,
  });
  if (result.ok) revalidatePath("/practice");
  if (!result.ok) return result;
  const state = result.state
    ? practiceScoreSnapshot(result.state)
    : await loadPracticeStateAction(gameId);
  return {
    ...(await addSessionSummary(state)),
    undidThrower: result.undidThrower,
  };
}

export async function endPracticeSessionAction(
  gameId: string,
  revision: number,
  requestId: string,
  undo = false,
) {
  const db = await supabaseServer();
  if (!db) return { ok: false, message: "Database not configured" };
  const { data, error } = await db.rpc("wgd_end_practice", {
    p_game: gameId,
    p_team: TEAM_ID,
    p_revision: revision,
    p_request: requestId,
    p_undo: undo,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/practice");
  return addSessionSummary(practiceScoreSnapshot(data.state));
}

async function addSessionSummary(state: any) {
  if (!state.ok || state.meta?.practice_sessions?.status === "in_progress")
    return state;
  const db = await supabaseServer();
  if (!db) return state;
  const sessionId = state.meta.session_id;
  const [{ data: legs, error: legError }, events] = await Promise.all([
    db
      .from("practice_games")
      .select("id,status,winner")
      .eq("session_id", sessionId),
    allRows(() =>
      db
        .from("practice_events")
        .select("score,darts,is_bust,is_checkout,thrower")
        .eq("session_id", sessionId)
        .eq("is_deleted", false)
        .order("id"),
    ),
  ]);
  if (legError || events.error)
    throw new Error(
      legError?.message ||
        events.error?.message ||
        "Could not load session results.",
    );
  const players = ["player_a", "player_b"].map((side) => {
    const visits = (events.data || []).filter((v: any) => v.thrower === side);
    const darts = visits.reduce((n: number, v: any) => n + v.darts, 0),
      scored = visits.reduce(
        (n: number, v: any) => n + (v.is_bust ? 0 : v.score),
        0,
      );
    return {
      side,
      wins: (legs || []).filter(
        (l) => l.status === "completed" && l.winner === side,
      ).length,
      darts,
      average: darts ? (scored / darts) * 3 : null,
    };
  });
  return {
    ...state,
    sessionSummary: {
      completed: (legs || []).filter((l) => l.status === "completed").length,
      players,
    },
  };
}
