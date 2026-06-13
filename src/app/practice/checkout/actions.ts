"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";

const TEAM_ID = process.env.TEAM_ID;

// Every key of finishRoutes is a finishable checkout with a suggested route.
const CHECKOUT_POOL = Object.keys(finishRoutes).map(Number);

function randomCheckout(exclude?: number): number {
  const pool = exclude ? CHECKOUT_POOL.filter((n) => n !== exclude) : CHECKOUT_POOL;
  const list = pool.length ? pool : CHECKOUT_POOL;
  return list[Math.floor(Math.random() * list.length)];
}

export async function startCheckoutGameAction(formData: FormData): Promise<void> {
  const playerId = (formData.get("playerId") as string) || null;
  const supabase = supabaseServer();
  if (!supabase) return;

  const { data, error } = await supabase
    .from("checkout_practice_sessions")
    .insert({
      team_id: TEAM_ID,
      player_id: playerId || null,
      current_target: randomCheckout(),
    })
    .select("id")
    .single();

  if (error || !data) return;
  redirect(`/practice/checkout/scoring?session=${data.id}`);
}

export async function loadCheckoutStateAction(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false as const };

  const [{ data: session }, { data: attempts }] = await Promise.all([
    supabase
      .from("checkout_practice_sessions")
      .select("*, player:player_id(name)")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("checkout_practice_attempts")
      .select("*")
      .eq("session_id", sessionId)
      .order("id", { ascending: false })
      .limit(15),
  ]);

  if (!session) return { ok: false as const };
  return { ok: true as const, session, attempts: (attempts ?? []) as any[] };
}

export async function recordCheckoutAttemptAction(
  sessionId: string,
  success: boolean,
  dartsUsed: number
) {
  const darts = success ? (dartsUsed >= 1 && dartsUsed <= 3 ? dartsUsed : 3) : 0;
  const supabase = supabaseServer();
  if (!supabase) return { ok: false };

  const { data: session } = await supabase
    .from("checkout_practice_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session || session.status !== "in_progress") {
    return { ok: false, message: "Session not active" };
  }

  await supabase.from("checkout_practice_attempts").insert({
    session_id: sessionId,
    target: session.current_target,
    darts_used: darts,
    success,
  });

  await supabase
    .from("checkout_practice_sessions")
    .update({
      current_target: randomCheckout(session.current_target),
      attempt_index: session.attempt_index + 1,
    })
    .eq("id", sessionId);

  revalidatePath("/practice/checkout");
  return { ok: true };
}

export async function endCheckoutGameAction(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false };
  await supabase
    .from("checkout_practice_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  revalidatePath("/practice/checkout");
  return { ok: true };
}
