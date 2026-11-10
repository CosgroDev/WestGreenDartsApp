"use server";

import { revalidatePath } from "next/cache";
import { backWithError, must, teamDb } from "@/lib/actionResult";
import { supabaseServer } from "@/lib/supabaseServer";
import { dateField, textField, uuidField } from "@/lib/validation";

const TEAM_ID = process.env.TEAM_ID;

export type FixtureFormState = { ok: boolean; message?: string } | null;

export async function createFixtureAction(_prevState: FixtureFormState, formData: FormData): Promise<FixtureFormState> {
  const seasonId = uuidField(formData, "seasonId");
  const startsAt = dateField(formData, "startsAt");
  const home = formData.get("home") === "on";
  const opponent = textField(formData, "opponent", 80);
  const venue = textField(formData, "venue", 120);
  const notes = textField(formData, "notes", 500);

  if (!seasonId || !startsAt || !opponent) {
    return { ok: false, message: "Season, date/time, and opponent are required" };
  }

  const supabase = await supabaseServer();
  if (!supabase || !TEAM_ID) return { ok: false, message: "Database is not configured" };

  const { error } = await supabase.from("fixtures").insert({
    team_id: TEAM_ID,
    season_id: seasonId,
    starts_at: startsAt,
    home,
    opponent,
    venue,
    notes
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/fixtures");
  return { ok: true };
}

export async function deleteFixtureAction(formData: FormData): Promise<void> {
  const fixtureId = uuidField(formData, "fixtureId");
  if (!fixtureId) backWithError("/fixtures", "invalid");

  // One transaction: refuses while live games remain, otherwise removes the
  // fixture with its already-deleted games and their events.
  const { db, teamId } = await teamDb();
  const outcome = must(await db.rpc("wgd_delete_fixture", { p_team: teamId, p_fixture: fixtureId }), "Fixture delete");
  if (outcome === "has_games") backWithError("/fixtures", "fixture_has_games");
  if (outcome === "not_found") backWithError("/fixtures", "not_found");

  revalidatePath("/fixtures");
  revalidatePath("/dashboard");
}
