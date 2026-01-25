"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createPlayerAction(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim();
  const active = (formData.get("active") as string | null) === "on";
  if (!name) return { ok: false, message: "Name required" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  // Prevent duplicate names (case-insensitive)
  const { data: existing, error: dupErr } = await supabase
    .from("players")
    .select("id")
    .ilike("name", name)
    .limit(1);
  if (!dupErr && existing && existing.length) {
    redirect("/players?error=duplicate");
  }

  const { error } = await supabase.from("players").insert({
    team_id: TEAM_ID,
    name,
    active
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/players");
  redirect("/players?success=1");
}

export async function setPlayerActiveAction(formData: FormData) {
  const playerId = formData.get("id") as string | null;
  const nextActiveStr = (formData.get("nextActive") as string | null) ?? "";
  const nextActive = nextActiveStr.toLowerCase() === "true";
  if (!playerId) return { ok: false, message: "Missing id" };
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { error } = await supabase.from("players").update({ active: nextActive }).eq("id", playerId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  redirect("/players");
}

export async function updatePlayerAction(formData: FormData) {
  const id = formData.get("id") as string | null;
  const name = (formData.get("name") as string | null)?.trim();
  const active = (formData.get("active") as string | null) === "on";
  const dart_model = (formData.get("dart_model") as string | null)?.trim() || null;
  const stem_length = (formData.get("stem_length") as string | null)?.trim() || null;
  const flight_type = (formData.get("flight_type") as string | null)?.trim() || null;
  if (!id || !name) return { ok: false, message: "Missing id or name" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const fullPayload = { name, active, dart_model, stem_length, flight_type };
  let { error } = await supabase.from("players").update(fullPayload as any).eq("id", id);
  if (error && error.message?.includes("column")) {
    // Retry without optional columns if schema doesn't have them
    const retry = await supabase.from("players").update({ name, active }).eq("id", id);
    error = retry.error;
  }
  if (error) return { ok: false, message: error.message };
  revalidatePath("/players");
  revalidatePath(`/players/${id}`);
  redirect("/players");
}

export async function deletePlayerAction(formData: FormData) {
  const id = formData.get("id") as string | null;
  if (!id) return { ok: false, message: "Missing id" };
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/players");
  // Navigate back to players list after delete
  redirect("/players");
}
