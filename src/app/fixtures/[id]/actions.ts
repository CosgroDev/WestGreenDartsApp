
"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createGameAction(prevState: any, formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  const playerId = formData.get("playerId") as string | null;
  const opponent = (formData.get("opponent") as string | null)?.trim();

  if (!fixtureId || !opponent) return { ok: false, message: "Fixture and opponent are required" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { error } = await supabase.from("games").insert({
    team_id: TEAM_ID,
    fixture_id: fixtureId,
    west_green_player_id: playerId || null,
    opponent_player: opponent,
    west_green_starts: false
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}

export async function deleteMatchAction(formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  const opponent = formData.get("opponent") as string | null;
  const westId = (formData.get("westId") as string | null) || null;

  if (!fixtureId || !opponent) return { ok: false, message: "Missing ids" };

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { error } = await supabase
    .from("games")
    .update({ deleted: true })
    .eq("fixture_id", fixtureId)
    .eq("opponent_player", opponent)
    .eq("west_green_player_id", westId)
    .is("deleted", false);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}
