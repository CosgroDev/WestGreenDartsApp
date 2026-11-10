"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backWithError, must, teamDb } from "@/lib/actionResult";
import { invalidateSeasonStats } from "@/lib/seasonCache";
import { textField, uuidField } from "@/lib/validation";

export async function createPlayerAction(formData: FormData): Promise<void> {
  const name = textField(formData, "name", 60);
  const active = formData.get("active") === "on";
  if (!name) backWithError("/players", "invalid");

  const { db, teamId } = await teamDb();

  // Names are unique regardless of case. Escape LIKE wildcards so "%" cannot match everything.
  const pattern = name.replace(/[\\%_]/g, (c) => `\\${c}`);
  const existing = must(await db.from("players").select("id").ilike("name", pattern).limit(1), "Player lookup");
  if (existing?.length) backWithError("/players", "duplicate");

  const { error } = await db.from("players").insert({ team_id: teamId, name, active });
  if (error?.code === "23505") backWithError("/players", "duplicate");
  if (error) throw new Error(`Player create failed: ${error.message}`);

  invalidateSeasonStats();
  revalidatePath("/players");
  revalidatePath("/dashboard");
  redirect("/players?success=1");
}

export async function setPlayerActiveAction(formData: FormData): Promise<void> {
  const id = uuidField(formData, "id");
  const active = String(formData.get("nextActive") ?? "").toLowerCase() === "true";
  if (!id) backWithError("/players", "invalid");

  const { db, teamId } = await teamDb();
  const rows = must(await db.from("players").update({ active }).eq("id", id).eq("team_id", teamId).select("id"), "Player update");
  if (!rows?.length) backWithError("/players", "not_found");

  invalidateSeasonStats();
  revalidatePath("/players");
  revalidatePath("/dashboard");
  revalidatePath(`/players/${id}`);
  redirect("/players");
}

export async function updatePlayerAction(formData: FormData): Promise<void> {
  const id = uuidField(formData, "id");
  if (!id) backWithError("/players", "invalid");
  const name = textField(formData, "name", 60);
  if (!name) backWithError(`/players/${id}`, "invalid");
  const payload = {
    name,
    active: formData.get("active") === "on",
    dart_model: textField(formData, "dart_model"),
    stem_length: textField(formData, "stem_length"),
    flight_type: textField(formData, "flight_type")
  };

  const { db, teamId } = await teamDb();
  const { data, error } = await db.from("players").update(payload).eq("id", id).eq("team_id", teamId).select("id");
  if (error?.code === "23505") backWithError(`/players/${id}`, "duplicate");
  if (error) throw new Error(`Player update failed: ${error.message}`);
  if (!data?.length) backWithError("/players", "not_found");

  invalidateSeasonStats();
  revalidatePath("/players");
  revalidatePath("/dashboard");
  revalidatePath(`/players/${id}`);
  redirect("/players");
}

export async function deletePlayerAction(formData: FormData): Promise<void> {
  const id = uuidField(formData, "id");
  if (!id) backWithError("/players", "invalid");

  const { db, teamId } = await teamDb();
  const { error } = await db.from("players").delete().eq("id", id).eq("team_id", teamId);
  // 23503: the player is referenced by recorded games.
  if (error?.code === "23503") backWithError(`/players/${id}`, "player_has_games");
  if (error) throw new Error(`Player delete failed: ${error.message}`);

  invalidateSeasonStats();
  revalidatePath("/players");
  revalidatePath("/dashboard");
  redirect("/players");
}
