import { supabaseServer } from "@/lib/supabaseServer";

export type Player = {
  id: string;
  name: string;
  active: boolean;
  dart_model?: string | null;
  stem_length?: string | null;
  flight_type?: string | null;
};

export async function getPlayers(): Promise<Player[]> {
  const supabase = await supabaseServer();
  if (!supabase) throw new Error("Database is not configured");

  const { data, error } = await supabase
    .from("players")
    .select("id, name, active, dart_model, stem_length, flight_type")
    .order("name", { ascending: true });
  if (error) throw new Error(`Could not load players: ${error.message}`);
  return (data ?? []) as Player[];
}
