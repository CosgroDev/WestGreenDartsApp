import { supabaseServer } from "@/lib/supabaseServer";
import { mockPlayers } from "./mock";

export type Player = {
  id: string;
  name: string;
  active: boolean;
  dart_model?: string | null;
  stem_length?: string | null;
  flight_type?: string | null;
};

export async function getPlayers(): Promise<Player[]> {
  const supabase = supabaseServer();
  if (!supabase) return mockPlayers;

  // Try extended fields; if columns missing, fall back to minimal selection.
  const selectExtended = "id, name, active, dart_model, stem_length, flight_type";
  const selectBasic = "id, name, active";

  let data: any[] | null = null;
  let error: any = null;

  const first = await supabase.from("players").select(selectExtended).order("name", { ascending: true });
  if (first.error && first.error.message?.includes("column")) {
    const retry = await supabase.from("players").select(selectBasic).order("name", { ascending: true });
    data = retry.data ?? null;
    error = retry.error;
  } else {
    data = first.data ?? null;
    error = first.error;
  }

  if (error || !data) {
    console.warn("Falling back to mock players", error?.message);
    return mockPlayers;
  }

  return data as Player[];
}
