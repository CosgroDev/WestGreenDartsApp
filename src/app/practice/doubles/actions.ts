"use server";
import { validatePracticePlayers } from "@/lib/practicePlayers";
import { allRows } from "@/lib/database";
import { stableRead } from "@/lib/stableRead";
import { drillCommand, endDrill } from "@/lib/drillCommand";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  DOUBLES_SEQUENCE,
  nextTargetForRound,
  pointsForDart,
} from "@/lib/doublesPractice";

const TEAM_ID = process.env.TEAM_ID;

export async function startDoublesGameAction(
  formData: FormData,
): Promise<void | { ok: boolean; message?: string }> {
  // Ordered, comma-separated player ids from the start form (throwing order).
  const raw = (formData.get("playerOrder") as string) || "";
  const playerIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (playerIds.length === 0 || new Set(playerIds).size !== playerIds.length)
    return { ok: false, message: "Choose one or more different players." };

  const validation = await validatePracticePlayers(playerIds);
  if (!validation.ok) return validation;
  const supabase = validation.db;

  const { data: session, error } = await supabase
    .from("doubles_practice_sessions")
    .insert({ team_id: TEAM_ID, current_slot: 0 })
    .select("id")
    .single();

  if (error || !session)
    return {
      ok: false,
      message: error?.message || "Could not start the game.",
    };

  const rows = playerIds.map((playerId, i) => ({
    session_id: session.id,
    player_id: playerId,
    throw_order: i,
    round_index: 0,
    current_target: DOUBLES_SEQUENCE[0],
    phase: "sequence",
    score: 0,
  }));

  const { error: playersError } = await supabase
    .from("doubles_practice_players")
    .insert(rows);
  if (playersError) {
    await supabase
      .from("doubles_practice_sessions")
      .delete()
      .eq("id", session.id);
    return { ok: false, message: playersError.message };
  }

  revalidatePath("/practice");
  revalidatePath("/practice/doubles");
  redirect(`/practice/doubles/scoring?session=${session.id}`);
}

export async function loadDoublesStateAction(sessionId: string) {
  return stableRead("doubles_practice_sessions", sessionId, () =>
    readState(sessionId),
  );
}

async function readState(sessionId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false as const };

  const [sessionResult, playerResult, attemptResult] = await Promise.all([
    supabase
      .from("doubles_practice_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("team_id", TEAM_ID)
      .single(),
    supabase
      .from("doubles_practice_players")
      .select("*, player:player_id(name)")
      .eq("session_id", sessionId)
      .order("throw_order", { ascending: true }),
    allRows(() =>
      supabase
        .from("doubles_practice_attempts")
        .select("*")
        .eq("session_id", sessionId)
        .order("id", { ascending: false }),
    ),
  ]);

  const { data: session, error: sessionError } = sessionResult;
  const { data: players, error: playerError } = playerResult;
  const { data: attempts, error: attemptError } = attemptResult;
  if (sessionError || playerError || attemptError)
    throw new Error(
      sessionError?.message ||
        playerError?.message ||
        attemptError?.message ||
        "Could not load session",
    );
  if (!session) throw new Error("Session not found");
  return {
    ok: true as const,
    session,
    players: (players ?? []) as any[],
    attempts: (attempts ?? []) as any[],
  };
}

export async function recordDoublesAttemptAction(
  sessionId: string,
  dartHit: number,
  revision?: number,
  requestId?: string,
) {
  if (!Number.isInteger(dartHit) || dartHit < 0 || dartHit > 3) {
    return { ok: false, message: "Invalid dart" };
  }
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false };

  const { data: session } = await supabase
    .from("doubles_practice_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("team_id", TEAM_ID)
    .single();
  if (
    session &&
    requestId &&
    revision !== undefined &&
    (session.revision !== revision || session.status !== "in_progress")
  ) {
    return drillCommand(
      "doubles",
      sessionId,
      revision,
      null,
      { status: "replay_only" },
      null,
      null,
      requestId,
    );
  }
  if (!session || session.status !== "in_progress") {
    return { ok: false, message: "Session not active" };
  }
  if (revision !== undefined && revision !== session.revision)
    return {
      ok: false,
      message:
        "Session changed on another device. Reload before scoring again.",
    };

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
  const { target: nextTarget, phase: nextPhase } = nextTargetForRound(
    nextRound,
    active.current_target,
  );

  const saved = await drillCommand(
    "doubles",
    sessionId,
    revision ?? session.revision,
    {
      round_index: active.round_index,
      target: active.current_target,
      phase: active.phase,
      dart_hit: dartHit,
      points,
    },
    { current_slot: (slot + 1) % slotCount },
    active.id,
    {
      round_index: nextRound,
      current_target: nextTarget,
      phase: nextPhase,
      score: active.score + points,
      hits: active.hits + (dartHit > 0 ? 1 : 0),
      first_dart_hits: active.first_dart_hits + (dartHit === 1 ? 1 : 0),
    },
    requestId,
  );
  if (!saved.ok) return saved;

  revalidatePath("/practice/doubles");
  return { ok: true, points };
}

export async function endDoublesGameAction(
  sessionId: string,
  revision?: number,
  requestId?: string,
  immediate = false,
) {
  const db = await supabaseServer();
  if (!db || !TEAM_ID)
    return { ok: false, message: "Database or team is not configured." };
  const { data: session } = await db
    .from("doubles_practice_sessions")
    .select("revision")
    .eq("id", sessionId)
    .eq("team_id", TEAM_ID)
    .single();
  if (!session) return { ok: false, message: "Session not found." };
  const result = await drillCommand(
    "doubles",
    sessionId,
    revision ?? session.revision,
    null,
    { status: "completed", immediate },
    null,
    null,
    requestId,
  );
  if (result.ok) revalidatePath("/practice/doubles");
  return result;
}

export async function abandonDoublesSessionAction(
  sessionId: string,
  revision?: number,
  requestId?: string,
) {
  const result = await endDrill(
    "doubles",
    sessionId,
    "abandoned",
    revision,
    requestId,
  );
  if (result.ok) revalidatePath("/practice/doubles");
  return result;
}

export async function undoDoublesAction(
  sessionId: string,
  revision: number,
  requestId: string,
) {
  const result = await drillCommand(
    "doubles",
    sessionId,
    revision,
    null,
    { command: "undo" },
    null,
    null,
    requestId,
  );
  if (result.ok) revalidatePath("/practice");
  return result;
}
