"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createSeasonAction(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim();
  const isCurrent = (formData.get("is_current") as string | null) === "on";
  if (!name) return { ok: false, message: "Name required" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  // Prevent duplicate season name for the same team (case-insensitive)
  const { data: existing, error: existsErr } = await supabase
    .from("seasons")
    .select("id")
    .eq("team_id", TEAM_ID)
    .ilike("name", name)
    .limit(1);
  if (!existsErr && existing && existing.length) {
    return { ok: false, message: "Season already exists" };
  }

  if (isCurrent) {
    await supabase.from("seasons").update({ is_current: false }).eq("team_id", TEAM_ID);
  }

  const { error } = await supabase.from("seasons").insert({
    team_id: TEAM_ID,
    name,
    is_current: isCurrent
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/seasons");
  return { ok: true };
}

export async function setCurrentSeasonAction(seasonId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  await supabase.from("seasons").update({ is_current: false }).eq("team_id", TEAM_ID);
  const { error } = await supabase.from("seasons").update({ is_current: true }).eq("id", seasonId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/seasons");
  return { ok: true };
}
