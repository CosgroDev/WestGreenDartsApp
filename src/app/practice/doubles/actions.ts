"use server";
import { backWithError } from "@/lib/actionResult";
import { isUuid } from "@/lib/validation";
import { allRows } from "@/lib/database";
import { stableRead } from "@/lib/stableRead";
import { drillCommand, endDrill } from "@/lib/drillCommand";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { DOUBLES_SEQUENCE, nextTargetForRound, pointsForDart } from "@/lib/doublesPractice";

const TEAM_ID = process.env.TEAM_ID;

export async function startDoublesGameAction(formData: FormData): Promise<void> {
  // Ordered, comma-separated player ids from the start form (throwing order).
  const raw = (formData.get("playerOrder") as string) || "";
  const playerIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (playerIds.length === 0 || playerIds.length > 20 || !playerIds.every(isUuid)) backWithError("/practice", "no_players");

  const supabase = await supabaseServer();
  if (!supabase) throw new Error("Database is not configured");

  const { data: session, error } = await supabase
    .from("doubles_practice_sessions")
    .insert({ team_id: TEAM_ID, current_slot: 0 })
    .select("id")
    .single();

  if (error || !session) throw new Error(`Doubles session create failed: ${error?.message ?? "no row"}`);

  const rows = playerIds.map((playerId, i) => ({
    session_id: session.id,
    player_id: playerId,
    throw_order: i,
    round_index: 0,
    current_target: DOUBLES_SEQUENCE[0],
    phase: "sequence",
    score: 0,
  }));

  const { error: playersError } = await supabase.from("doubles_practice_players").insert(rows);
  if (playersError) throw new Error(`Doubles session create failed: ${playersError.message}`);

  redirect(`/practice/doubles/scoring?session=${session.id}`);
}

export async function loadDoublesStateAction(sessionId: string) {
  return stableRead("doubles_practice_sessions", sessionId, () => readState(sessionId));
}

async function readState(sessionId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false as const };

  const [{ data: session }, { data: players }, { data: attempts }] = await Promise.all([
    supabase.from("doubles_practice_sessions").select("*").eq("id", sessionId).single(),
    supabase
      .from("doubles_practice_players")
      .select("*, player:player_id(name)")
      .eq("session_id", sessionId)
      .order("throw_order", { ascending: true }),
    allRows(() => supabase
      .from("doubles_practice_attempts")
      .select("*")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })),
  ]);

  if (!session) throw new Error("Session not found");
  return {
    ok: true as const,
    session,
    players: (players ?? []) as any[],
    attempts: (attempts ?? []) as any[],
  };
}

export async function recordDoublesAttemptAction(sessionId: string, dartHit: number, revision?: number) {
  if (!Number.isInteger(dartHit) || dartHit < 0 || dartHit > 3) {
    return { ok: false, message: "Invalid dart" };
  }
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false };

  const { data: session } = await supabase
    .from("doubles_practice_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session || session.status !== "in_progress") {
    return { ok: false, message: "Session not active" };
  }
  if (revision !== undefined && revision !== session.revision) return {ok: false, message: "Session changed on another device. Reload before scoring again."};

  const { data: players } = await supabase
    .from("doubles_practice_players")
    .select("*")
    .eq("session_id", sessionId)
    .order("throw_order", { ascending: true });
  if (!players || players.length === 0) return { ok: false };

  const slotCount = players.length;
  const slot = ((session.current_slot % slotCount) + slotCount) % slotCount;
  const active = players[slot];

  const points = pointsForDart(dartHit);
  const nextRound = active.round_index + 1;
  const { target: nextTarget, phase: nextPhase } = nextTargetForRound(nextRound, active.current_target);

  const saved = await drillCommand("doubles", sessionId, revision ?? session.revision,
    {round_index: active.round_index, target: active.current_target, phase: active.phase, dart_hit: dartHit, points},
    {current_slot: (slot + 1) % slotCount}, active.id,
    {round_index: nextRound, current_target: nextTarget, phase: nextPhase, score: active.score + points,
     hits: active.hits + (dartHit > 0 ? 1 : 0), first_dart_hits: active.first_dart_hits + (dartHit === 1 ? 1 : 0)});
  if (!saved.ok) return saved;

  revalidatePath("/practice/doubles");
  return { ok: true, points };
}

export async function endDoublesGameAction(sessionId: string, revision?: number) {
  const result = await endDrill("doubles", sessionId, "completed", revision);
  if (result.ok) revalidatePath("/practice/doubles");
  return result;
}

export async function abandonDoublesSessionAction(sessionId: string, revision?: number) {
  const result = await endDrill("doubles", sessionId, "abandoned", revision);
  if (result.ok) revalidatePath("/practice/doubles");
  return result;
}
