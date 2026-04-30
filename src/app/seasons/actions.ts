"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createSeasonAction(formData: FormData): Promise<void> {
  const name = (formData.get("name") as string | null)?.trim();
  const isCurrent = (formData.get("is_current") as string | null) === "on";
  if (!name) return;

  const supabase = supabaseServer();
  if (!supabase) return;

  // Prevent duplicate season name for the same team (case-insensitive)
  const { data: existing, error: existsErr } = await supabase
    .from("seasons")
    .select("id")
    .eq("team_id", TEAM_ID)
    .ilike("name", name)
    .limit(1);
  if (!existsErr && existing && existing.length) return;

  if (isCurrent) {
    await supabase.from("seasons").update({ is_current: false }).eq("team_id", TEAM_ID);
  }

  const { error } = await supabase.from("seasons").insert({
    team_id: TEAM_ID,
    name,
    is_current: isCurrent
  });
  if (error) return;

  revalidatePath("/seasons");
}

export async function setCurrentSeasonAction(seasonId: string): Promise<void> {
  const supabase = supabaseServer();
  if (!supabase) return;

  await supabase.from("seasons").update({ is_current: false }).eq("team_id", TEAM_ID);
  const { error } = await supabase.from("seasons").update({ is_current: true }).eq("id", seasonId);
  if (error) return;

  revalidatePath("/seasons");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
