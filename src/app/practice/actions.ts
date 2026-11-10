"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { createPracticeSession } from "@/data/practice";
import { backWithError } from "@/lib/actionResult";
import { isUuid } from "@/lib/validation";

export async function createPracticeSessionAction(formData: FormData): Promise<void> {
  const playerA = (formData.get("playerA") as string | null) || null;
  const playerB = (formData.get("playerB") as string | null) || null;
  const startScore = parseInt((formData.get("startScore") as string) || "501", 10);
  const legsToPlay = parseInt((formData.get("legs") as string) || "3", 10);
  if ((playerA && !isUuid(playerA)) || (playerB && !isUuid(playerB)) ||
      ![301, 501, 701].includes(startScore) || ![1, 3, 5, 7].includes(legsToPlay)) {
    backWithError("/practice", "invalid");
  }

  const res = await createPracticeSession({ playerA, playerB, startScore, legsToPlay });
  if (!res.ok || !res.sessionId || !res.gameId) throw new Error("Practice session could not be created");
  redirect(`/practice/scoring?session=${res.sessionId}&game=${res.gameId}`);
}

export async function deletePracticeSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("sessionId") as string | null;
  if (!isUuid(sessionId)) backWithError("/practice", "invalid");
  const supabase = await supabaseServer();
  if (!supabase) throw new Error("Database is not configured");

  const { data: games, error } = await supabase
    .from("practice_games")
    .select("id, status")
    .eq("session_id", sessionId);
  if (error) throw new Error(`Practice session lookup failed: ${error.message}`);
  if ((games ?? []).some((g) => g.status === "in_progress")) backWithError("/practice", "session_active");

  const { error: deleteError } = await supabase.from("practice_sessions").delete().eq("id", sessionId);
  if (deleteError) throw new Error(`Practice session delete failed: ${deleteError.message}`);
  revalidatePath("/practice");
}
