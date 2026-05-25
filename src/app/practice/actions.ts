"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { createPracticeSession } from "@/data/practice";

export async function createPracticeSessionAction(formData: FormData): Promise<void> {
  const playerA = (formData.get("playerA") as string | null) || null;
  const playerB = (formData.get("playerB") as string | null) || null;
  const startScore = parseInt((formData.get("startScore") as string) || "501", 10);
  const legsToPlay = parseInt((formData.get("legs") as string) || "3", 10);

  const res = await createPracticeSession({ playerA, playerB, startScore, legsToPlay });
  if (!res.ok || !res.sessionId || !res.gameId) return;
  redirect(`/practice/scoring?session=${res.sessionId}&game=${res.gameId}`);
}

export async function deletePracticeSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("sessionId") as string | null;
  if (!sessionId) return;
  const supabase = supabaseServer();
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
