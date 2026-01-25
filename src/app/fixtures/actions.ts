"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createFixtureAction(_prevState: any, formData: FormData) {
  const seasonId = formData.get("seasonId") as string | null;
  const startsAt = formData.get("startsAt") as string | null;
  const home = (formData.get("home") as string | null) === "on";
  const opponent = (formData.get("opponent") as string | null)?.trim();
  const venue = (formData.get("venue") as string | null)?.trim();
  const notes = (formData.get("notes") as string | null)?.trim();

  if (!seasonId || !startsAt || !opponent) {
    return { ok: false, message: "Season, date/time, and opponent are required" };
  }

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { error } = await supabase.from("fixtures").insert({
    team_id: TEAM_ID,
    season_id: seasonId,
    starts_at: startsAt,
    home,
    opponent,
    venue: venue || null,
    notes: notes || null
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/fixtures");
  return { ok: true };
}

export async function deleteFixtureAction(formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  if (!fixtureId) return { ok: false, message: "Fixture id missing" };
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  // Only delete if no games exist for this fixture
  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id")
    .eq("fixture_id", fixtureId)
    .eq("deleted", false)
    .limit(1);

  if (gamesErr) return { ok: false, message: gamesErr.message };
  if (games && games.length > 0) {
    return { ok: false, message: "Cannot delete: games already exist for this fixture." };
  }

  const { error } = await supabase.from("fixtures").delete().eq("id", fixtureId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/fixtures");
  return { ok: true };
}
