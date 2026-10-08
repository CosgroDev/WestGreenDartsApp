"use server";

import { londonLocalToISO } from "@/lib/fixtureState";
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

  const startsAtISO = londonLocalToISO(startsAt);
  if (!startsAtISO) return { ok: false, message: "Enter a valid UK date and time. The clocks-forward missing hour cannot be selected" };

  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const fixtureRequest = formData.get("fixtureRequest") as string | null;
  if (!fixtureRequest || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixtureRequest)) return { ok: false, message: "Invalid fixture request. Refresh and try again" };
  const { error } = await supabase.rpc("wgd_create_fixture", {
    p_team: TEAM_ID, p_season: seasonId, p_fixture: fixtureRequest, p_starts: startsAtISO,
    p_home: home, p_opponent: opponent, p_venue: venue || null, p_notes: notes || null
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/fixtures");
  return { ok: true };
}

export async function deleteFixtureAction(_state: { ok: boolean; message?: string }, formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const fixtureId = formData.get("fixtureId") as string | null;
  if (!fixtureId) return { ok: false, message: "Fixture not found" };
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, message: "Unable to connect. Try again" };
  const { error } = await supabase.rpc("wgd_delete_empty_fixture", { p_fixture: fixtureId, p_team: TEAM_ID });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/fixtures");
  revalidatePath("/dashboard");
  return { ok: true };
}
