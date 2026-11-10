"use server";

import { revalidatePath } from "next/cache";
import { backWithError, must, teamDb } from "@/lib/actionResult";
import { isSeasonName, isUuid, textField } from "@/lib/validation";

const revalidateSeasons = () => {
  revalidatePath("/seasons");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/fixtures");
};

export async function createSeasonAction(formData: FormData): Promise<void> {
  const name = textField(formData, "name", 5);
  const isCurrent = formData.get("is_current") === "on";
  if (!name || !isSeasonName(name)) backWithError("/seasons", "season_format");

  const { db, teamId } = await teamDb();
  const existing = must(
    await db.from("seasons").select("id").eq("team_id", teamId).eq("name", name).limit(1),
    "Season lookup"
  );
  if (existing?.length) backWithError("/seasons", "duplicate");

  // Insert as not-current, then switch atomically so there is never zero or two current seasons.
  const created = must(
    await db.from("seasons").insert({ team_id: teamId, name, is_current: false }).select("id").single(),
    "Season create"
  );
  if (!created) throw new Error("Season create returned no row");
  if (isCurrent) must(await db.rpc("wgd_set_current_season", { p_team: teamId, p_season: created.id }), "Season switch");

  revalidateSeasons();
}

export async function setCurrentSeasonAction(seasonId: string): Promise<void> {
  if (!isUuid(seasonId)) backWithError("/settings", "invalid");
  const { db, teamId } = await teamDb();
  const ok = must(await db.rpc("wgd_set_current_season", { p_team: teamId, p_season: seasonId }), "Season switch");
  if (!ok) backWithError("/settings", "not_found");
  revalidateSeasons();
}
