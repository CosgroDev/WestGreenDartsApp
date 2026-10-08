"use server";
import { validatePracticePlayers } from "@/lib/practicePlayers";
import { allRows } from "@/lib/database";
import { stableRead } from "@/lib/stableRead";
import { drillCommand, endDrill } from "@/lib/drillCommand";
import { canFinishFrom } from "@/lib/scoringUtils";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";

const TEAM_ID = process.env.TEAM_ID;

// Every key of finishRoutes is a finishable checkout with a suggested route.
const CHECKOUT_POOL = Object.keys(finishRoutes).map(Number);

function randomCheckout(exclude?: number): number {
  const pool = exclude
    ? CHECKOUT_POOL.filter((n) => n !== exclude)
    : CHECKOUT_POOL;
  const list = pool.length ? pool : CHECKOUT_POOL;
  return list[Math.floor(Math.random() * list.length)];
}

export async function startCheckoutGameAction(
  formData: FormData,
): Promise<void | { ok: boolean; message?: string }> {
  const playerId = (formData.get("playerId") as string) || null;
  const validation = await validatePracticePlayers(playerId ? [playerId] : []);
  if (!validation.ok) return validation;
  const supabase = validation.db;

  const { data, error } = await supabase
    .from("checkout_practice_sessions")
    .insert({
      team_id: TEAM_ID,
      player_id: playerId || null,
      current_target: randomCheckout(),
    })
    .select("id")
    .single();

  if (error || !data)
    return {
      ok: false,
      message: error?.message || "Could not start the game.",
    };
  revalidatePath("/practice");
  revalidatePath("/practice/checkout");
  redirect(`/practice/checkout/scoring?session=${data.id}`);
}

export async function loadCheckoutStateAction(sessionId: string) {
  return stableRead("checkout_practice_sessions", sessionId, () =>
    readState(sessionId),
  );
}

async function readState(sessionId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false as const };

  const [sessionResult, attemptResult] = await Promise.all([
    supabase
      .from("checkout_practice_sessions")
      .select("*, player:player_id(name)")
      .eq("id", sessionId)
      .eq("team_id", TEAM_ID)
      .single(),
    allRows(() =>
      supabase
        .from("checkout_practice_attempts")
        .select("*")
        .eq("session_id", sessionId)
        .order("id", { ascending: false }),
    ),
  ]);

  const { data: session, error: sessionError } = sessionResult;
  const { data: attempts, error: attemptError } = attemptResult;
  if (sessionError || attemptError)
    throw new Error(
      sessionError?.message ||
        attemptError?.message ||
        "Could not load session",
    );
  if (!session) throw new Error("Session not found");
  return { ok: true as const, session, attempts: (attempts ?? []) as any[] };
}

export async function recordCheckoutAttemptAction(
  sessionId: string,
  success: boolean,
  dartsUsed: number,
  revision?: number,
  requestId?: string,
) {
  if (
    typeof success !== "boolean" ||
    !Number.isInteger(dartsUsed) ||
    dartsUsed < 0 ||
    dartsUsed > 3
  )
    return { ok: false, message: "Invalid darts" };
  if (success && dartsUsed === 0)
    return { ok: false, message: "Choose the darts used for the checkout" };
  const darts = success ? dartsUsed : 0;
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false };

  const { data: session } = await supabase
    .from("checkout_practice_sessions")
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
      "checkout",
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

  if (success && !canFinishFrom(session.current_target, darts))
    return { ok: false, message: "That checkout needs more darts" };
  const saved = await drillCommand(
    "checkout",
    sessionId,
    revision ?? session.revision,
    { darts_used: darts, success },
    { current_target: randomCheckout(session.current_target) },
    null,
    null,
    requestId,
  );
  if (!saved.ok) return saved;

  revalidatePath("/practice/checkout");
  return { ok: true };
}

export async function endCheckoutGameAction(
  sessionId: string,
  revision?: number,
  requestId?: string,
) {
  const result = await endDrill(
    "checkout",
    sessionId,
    "completed",
    revision,
    requestId,
  );
  if (result.ok) revalidatePath("/practice/checkout");
  return result;
}

export async function undoCheckoutAction(
  sessionId: string,
  revision: number,
  requestId: string,
) {
  const result = await drillCommand(
    "checkout",
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
