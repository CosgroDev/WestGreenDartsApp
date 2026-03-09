"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function start121GameAction(formData: FormData): Promise<void> {
  const playerId = (formData.get("playerId") as string) || null;
  const supabase = supabaseServer();
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
    })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/practice/121/scoring?session=${data.id}`);
}

export async function load121StateAction(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false as const };

  const [{ data: session }, { data: turns }] = await Promise.all([
    supabase
      .from("game_121_sessions")
      .select("*, player:player_id(name)")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("game_121_turns")
      .select("*")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(15),
  ]);

  if (!session) return { ok: false as const };
  return { ok: true as const, session, turns: (turns ?? []) as any[] };
}

export async function record121TurnAction(sessionId: string, score: number) {
  if (!Number.isInteger(score) || score < 0 || score > 180) {
    return { ok: false, message: "Invalid score" };
  }
  const supabase = supabaseServer();
  if (!supabase) return { ok: false };

  const { data: session } = await supabase
    .from("game_121_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session || session.status !== "in_progress") {
    return { ok: false, message: "Session not active" };
  }

  const remainingBefore: number = session.remaining;
  const diff = remainingBefore - score;
  // Bust: score takes you below 0 or leaves exactly 1 (can't finish on 1)
  const isBust = score > 0 && (diff < 0 || diff === 1);
  const remainingAfter = isBust ? remainingBefore : Math.max(0, diff);
  const finished = remainingAfter === 0;

  let result: string | null = null;
  let newBase: number = session.base_checkout;
  let nextCheckout: number = session.current_checkout;
  let nextTurn: number = session.current_turn;
  let nextRemaining: number = remainingAfter;
  let newStatus = "in_progress";
  let completedAt: string | null = null;

  if (finished) {
    const isWin = session.current_checkout >= 170;
    if (isWin) {
      result = "won";
      newStatus = "won";
      completedAt = new Date().toISOString();
    } else if (session.current_turn === 1) {
      result = "locked";
      newBase = session.current_checkout;
      nextCheckout = session.current_checkout + 1;
      nextTurn = 1;
      nextRemaining = nextCheckout;
    } else {
      result = "progressed";
      nextCheckout = session.current_checkout + 1;
      nextTurn = 1;
      nextRemaining = nextCheckout;
    }
  } else {
    if (session.current_turn === 3) {
      result = "failed";
      nextCheckout = session.base_checkout;
      nextTurn = 1;
      nextRemaining = session.base_checkout;
    } else {
      nextTurn = session.current_turn + 1;
      nextRemaining = isBust ? remainingBefore : remainingAfter;
    }
  }

  await supabase.from("game_121_turns").insert({
    session_id: sessionId,
    checkout: session.current_checkout,
    base_checkout: session.base_checkout,
    turn_number: session.current_turn,
    score,
    remaining_before: remainingBefore,
    remaining_after: remainingAfter,
    is_bust: isBust,
    result,
  });

  await supabase
    .from("game_121_sessions")
    .update({
      base_checkout: newBase,
      current_checkout: nextCheckout,
      current_turn: nextTurn,
      remaining: nextRemaining,
      status: newStatus,
      completed_at: completedAt,
    })
    .eq("id", sessionId);

  revalidatePath("/practice/121");
  return { ok: true, result };
}

export async function abandon121SessionAction(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false };
  await supabase
    .from("game_121_sessions")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  revalidatePath("/practice/121");
  return { ok: true };
}
