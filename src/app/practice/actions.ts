"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { createPracticeSession } from "@/data/practice";

export async function createPracticeSessionAction(formData: FormData): Promise<void | { ok: boolean; message?: string }> {
  const playerA = (formData.get("playerA") as string | null) || null;
  const playerB = (formData.get("playerB") as string | null) || null;
  const startScore = Number(formData.get("startScore") || "501");
  const legsToPlay = Number(formData.get("legs") || "3");
  const soloMode = formData.get("playMode") === "solo";
  if (![301, 501, 701].includes(startScore) || ![1, 3, 5, 7].includes(legsToPlay)) return { ok: false, message: "Choose a supported score and leg count." };
  if (playerA && playerA === playerB && !soloMode) return { ok: false, message: "Choose two different players." };
  const supabase = await supabaseServer();
  if (!supabase || !process.env.TEAM_ID) return { ok: false, message: "Practice storage is not configured." };
  const ids = [playerA, soloMode ? null : playerB].filter(Boolean) as string[];
  if (ids.length) {
    const { data, error } = await supabase.from("players").select("id").in("id", ids).eq("active", true).eq("team_id", process.env.TEAM_ID);
    if (error || !data || data.length !== ids.length) return { ok: false, message: "Choose active team players or use the guest option." };
  }

  const res = await createPracticeSession({ playerA, playerB: soloMode ? null : playerB, startScore, legsToPlay, soloMode });
  if (!res.ok || !res.sessionId || !res.gameId) return { ok: false, message: "Could not start practice. Please try again." };
  revalidatePath("/practice");
  redirect(`/practice/scoring?session=${res.sessionId}&game=${res.gameId}`);
}

export async function deletePracticeSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("sessionId") as string | null;
  if (!sessionId) return;
  const supabase = await supabaseServer();
  if (!supabase) return;

  const { data: games, error } = await supabase
    .from("practice_games")
    .select("id, status")
    .eq("session_id", sessionId);
  if (error || !games) return;
  const active = games.filter((g: any) => g.status === "in_progress");
  if (active.length > 0) return;

  await supabase.from("practice_sessions").delete().eq("id", sessionId);
  revalidatePath("/practice");
}
