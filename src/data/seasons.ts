import { supabaseServer } from "@/lib/supabaseServer";

export type Season = {
  id: string;
  name: string;
  is_current: boolean;
};

export async function getSeasons(): Promise<Season[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("seasons")
    .select("id, name, is_current")
    .order("name", { ascending: false });

  if (error || !data) {
    console.warn("seasons fetch fallback", error?.message);
    return [];
  }

  return data as Season[];
}
