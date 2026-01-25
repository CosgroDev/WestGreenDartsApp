"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";

const TEAM_ID = process.env.TEAM_ID;

export async function createGameAction(formData: FormData) {
  const fixtureId = formData.get("fixtureId") as string | null;
  const playerId = formData.get("playerId") as string | null;
  const opponent = (formData.get("opponent") as string | null)?.trim();

  if (!fixtureId || !opponent) {
    return { ok: false, message: "Fixture and opponent required." };
  }

  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase env not configured." };

  const { data, error } = await supabase
    .from("games")
    .insert({
      fixture_id: fixtureId,
      team_id: TEAM_ID,
      west_green_player_id: playerId || null,
      opponent_player: opponent,
      west_green_starts: false
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, message: error?.message || "Could not create game" };
  }

  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true, gameId: data.id };
}

export async function setGameResultAction(
  fixtureId: string,
  gameId: string,
  result: "west_green" | "opponent" | "void"
) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase env not configured." };

  const payload =
    result === "void"
      ? { status: "void", winner: null, completed_at: new Date().toISOString() }
      : { status: "completed", winner: result, completed_at: new Date().toISOString() };

  const { error } = await supabase.from("games").update(payload).eq("id", gameId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}

export async function deleteMatchAction(formData: FormData) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase env not configured." };

  const fixtureId = formData.get("fixtureId") as string | null;
  const westPlayerIdRaw = formData.get("westId") as string | null;
  const opponent = formData.get("opponent") as string | null;

  if (!fixtureId || !opponent) return { ok: false, message: "Missing fixture or opponent" };

  const westPlayerId = westPlayerIdRaw && westPlayerIdRaw.length ? westPlayerIdRaw : null;

  let query = supabase
    .from("games")
    .update({ deleted: true, status: "void" })
    .eq("fixture_id", fixtureId)
    .eq("opponent_player", opponent);

  query = westPlayerId ? query.eq("west_green_player_id", westPlayerId) : query.is("west_green_player_id", null);

  const { error } = await query;
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/fixtures/${fixtureId}`);
  return { ok: true };
}
