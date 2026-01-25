import { supabaseServer } from "@/lib/supabaseServer";

export type GameMeta = {
  id: string;
  status: string;
  winner: string | null;
  darts_thrown: number | null;
};

export async function getGameMeta(gameId: string): Promise<GameMeta | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("games")
    .select("id, status, winner, darts_thrown")
    .eq("id", gameId)
    .single();

  if (error || !data) {
    console.warn("game meta lookup failed", error?.message);
    return null;
  }
  return data as GameMeta;
}
