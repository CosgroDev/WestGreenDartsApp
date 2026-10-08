"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import type { FormActionResult } from "@/components/ActionForm";

const TEAM_ID = process.env.TEAM_ID;
const failure = (message: string): FormActionResult => ({ ok: false, message });
function refreshPlayer(id?: string) {
  revalidatePath("/players"); revalidatePath("/stats"); revalidatePath("/practice"); revalidatePath("/dashboard");
  if (id) { revalidatePath(`/players/${id}`); revalidatePath(`/stats/players/${id}`); }
}

export async function createPlayerAction(formData: FormData): Promise<FormActionResult> {
  const name = String(formData.get("name") || "").trim();
  const active = formData.get("active") === "on";
  if (!name || name.length > 100) return failure("Enter a player name of 1–100 characters.");
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. Your player has not been saved.");
  const { data: existing, error: checkError } = await supabase.from("players").select("id").eq("team_id", TEAM_ID).ilike("name", name).limit(1);
  if (checkError) return failure("Could not check the roster. Your entries are kept; please try again.");
  if (existing?.length) return failure("That player name already exists. Choose a different name.");
  const { error } = await supabase.from("players").insert({ team_id: TEAM_ID, name, active });
  if (error) return failure(error.code === "23505" ? "That player name already exists." : "Could not add the player. Your entries are kept; please try again.");
  refreshPlayer();
  redirect("/players?success=1");
}

export async function setPlayerActiveAction(formData: FormData): Promise<FormActionResult> {
  const id = String(formData.get("id") || "");
  const next = String(formData.get("nextActive") || "");
  if (!id || !["true", "false"].includes(next)) return failure("Choose a player and their availability.");
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. No change was saved.");
  const { data, error } = await supabase.from("players").update({ active: next === "true" }).eq("id", id).eq("team_id", TEAM_ID).select("id");
  if (error || !data?.length) return failure("Could not update this player. Please try again.");
  refreshPlayer(id);
  redirect("/players?success=status");
}

export async function updatePlayerAction(formData: FormData): Promise<FormActionResult> {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const active = formData.get("active") === "on";
  const dart_model = String(formData.get("dart_model") || "").trim() || null;
  const stem_length = String(formData.get("stem_length") || "").trim() || null;
  const flight_type = String(formData.get("flight_type") || "").trim() || null;
  if (!id || !name || name.length > 100) return failure("Enter a player name of 1–100 characters.");
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. No change was saved.");
  const fullPayload = { name, active, dart_model, stem_length, flight_type };
  let { data, error } = await supabase.from("players").update(fullPayload).eq("id", id).eq("team_id", TEAM_ID).select("id");
  if (error?.message?.includes("column")) {
    const retry = await supabase.from("players").update({ name, active }).eq("id", id).eq("team_id", TEAM_ID).select("id");
    data = retry.data; error = retry.error;
  }
  if (error || !data?.length) return failure(error?.code === "23505" ? "That player name already exists." : "Could not save this player. Your entries are kept; please try again.");
  refreshPlayer(id);
  redirect("/players?success=updated");
}

export async function deletePlayerAction(formData: FormData): Promise<FormActionResult> {
  const id = String(formData.get("id") || "");
  if (!id) return failure("Choose a player to delete.");
  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return failure("The team database is not configured. No player was deleted.");
  // Enforce inactivity at the server too, including stale pages or direct posts.
  const { data, error } = await supabase.from("players").delete().eq("id", id).eq("team_id", TEAM_ID).eq("active", false).select("id");
  if (error) return failure("This player could not be deleted. Recorded matches may still reference them; keep them inactive to retain their history.");
  if (!data?.length) return failure("Deactivate and save this player before deleting them.");
  refreshPlayer(id);
  redirect("/players?success=removed");
}
