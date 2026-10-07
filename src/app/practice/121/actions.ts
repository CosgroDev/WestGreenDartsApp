"use server";
import { allRows } from "@/lib/database";
import { stableRead } from "@/lib/stableRead";
import { drillCommand, endDrill } from "@/lib/drillCommand";
import { resolve121Turn } from "@/lib/game121";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function start121GameAction(formData: FormData): Promise<void> {
  const playerId = (formData.get("playerId") as string) || null;
  // When checked, base advances on any finish within 9 darts (not just Turn 1).
  const advanceBaseOnAnyFinish = formData.get("advanceBaseOnAnyFinish") === "on";
  const supabase = await supabaseServer();
  if (!supabase) return;

  const { data, error } = await supabase
    .from("game_121_sessions")
    .insert({
      team_id: TEAM_ID,
      player_id: playerId || null,
      base_checkout: 121,
      current_checkout: 121,
      current_turn: 1,
      remaining: 121,
      advance_base_on_any_finish: advanceBaseOnAnyFinish,
    })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/practice/121/scoring?session=${data.id}`);
}

export async function load121StateAction(sessionId: string) {
  return stableRead("game_121_sessions", sessionId, () => readState(sessionId));
}

async function readState(sessionId: string) {
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return { ok: false as const, message: "Database or team is not configured." };
  const [sessionRows, turnRows] = await Promise.all([
    supabase.from("game_121_sessions").select("*, player:player_id(name)")
      .eq("id", sessionId).eq("team_id", TEAM_ID).single(),
    allRows(() => supabase.from("game_121_turns").select("*")
      .eq("session_id", sessionId).order("id", { ascending: false })),
  ]);
  if (sessionRows.error || !sessionRows.data) throw new Error(sessionRows.error?.message || "Session not found.");
  if (turnRows.error) throw new Error(turnRows.error.message || "Could not load turn history.");
  return { ok: true as const, session: sessionRows.data, turns: turnRows.data ?? [] };
}

export async function record121TurnAction(
  sessionId: string, score: number, revision?: number, requestId?: string, declaredBust = false
) {
  if (!Number.isInteger(score) || score < 0 || score > 180) return { ok: false as const, message: "Enter a whole-number score from 0 to 180." };
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return { ok: false as const, message: "Database or team is not configured." };
  const { data: session, error } = await supabase.from("game_121_sessions").select("*")
    .eq("id", sessionId).eq("team_id", TEAM_ID).single();
  if (error || !session) return { ok: false as const, message: "Session not found." };

  // The existing RPC checks request history before status/revision. Recover a
  // committed visit whose response was lost without recalculating another turn.
  // This deliberately invalid patch can only replay a cached request; it cannot
  // create a fresh visit or end a session.
  if (requestId && revision !== undefined &&
      (session.revision !== revision || session.status !== "in_progress")) {
    const replay = await drillCommand("121", sessionId, revision, null, { status: "replay_only" }, null, null, requestId);
    if (!replay.ok) return { ok: false as const, message: replay.message || "Could not recover the saved visit." };
    const state = await load121StateAction(sessionId);
    if (!state.ok) return state;
    return { ...state, result: null };
  }
  if (session.status !== "in_progress") return { ok: false as const, message: "Session is no longer active." };
  if (revision !== undefined && revision !== session.revision) return { ok: false as const, message: "Session changed on another device. Reload before scoring again." };
  const outcome = resolve121Turn(session, score, declaredBust);
  const saved = await drillCommand("121", sessionId, revision ?? session.revision, {
    score, remaining_after: outcome.remainingAfter, is_bust: outcome.isBust, result: outcome.result,
  }, {
    ...outcome.patch, completed_at: outcome.result === "won" ? new Date().toISOString() : null,
  }, null, null, requestId);
  if (!saved.ok) return { ok: false as const, message: saved.message || "Could not save the visit." };
  revalidatePath("/practice/121");
  const state = await load121StateAction(sessionId);
  if (!state.ok) return state;
  return { ...state, result: outcome.result };
}

export async function abandon121SessionAction(sessionId: string, revision?: number, requestId?: string) {
  const result = await endDrill("121", sessionId, "abandoned", revision, requestId);
  if (result.ok) revalidatePath("/practice/121");
  return result;
}
