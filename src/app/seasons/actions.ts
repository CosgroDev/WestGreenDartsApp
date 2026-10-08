"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import type { FormActionResult } from "@/components/ActionForm";

const TEAM_ID = process.env.TEAM_ID;
const failure = (message: string): FormActionResult => ({ ok: false, message });
function refreshSeasons() {
  for (const path of ["/seasons", "/settings", "/dashboard", "/fixtures", "/stats"]) revalidatePath(path);
}

export async function createSeasonAction(formData: FormData): Promise<FormActionResult> {
  const name = String(formData.get("name") || "").trim();
  const isCurrent = formData.get("is_current") === "on";
  if (!/^\d{2}\/\d{2}$/.test(name)) return failure("Use the season format YY/YY, for example 26/27.");
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. Your season has not been saved.");
  const { data: existing, error: checkError } = await supabase.from("seasons").select("id").eq("team_id", TEAM_ID).ilike("name", name).limit(1);
  if (checkError) return failure("Could not check existing seasons. Please try again.");
  if (existing?.length) return failure("That season already exists.");
  // Create without changing the shared default until insertion succeeds.
  const { data, error } = await supabase.from("seasons").insert({ team_id: TEAM_ID, name, is_current: false }).select("id").single();
  if (error || !data) return failure("Could not add the season. Your entries are kept; please try again.");
  if (isCurrent) {
    const { error: defaultError } = await supabase.rpc("wgd_set_current_season", { p_team: TEAM_ID, p_season: data.id });
    if (defaultError) {
      refreshSeasons();
      return failure("Season added, but the team default was not changed. Select Set team default below to try again.");
    }
  }
  refreshSeasons();
  return { ok: true, message: isCurrent ? `${name} added and set as the team default.` : `${name} added.` };
}

export async function setCurrentSeasonAction(seasonId: string, _formData?: FormData): Promise<FormActionResult> {
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. The team default was not changed.");
  const { error } = await supabase.rpc("wgd_set_current_season", { p_team: TEAM_ID, p_season: seasonId });
  if (error) return failure("Could not change the team default. Please try again.");
  refreshSeasons();
  return { ok: true, message: "Team default season changed for everyone." };
}
