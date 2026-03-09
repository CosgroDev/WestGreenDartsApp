import { supabaseServer } from "@/lib/supabaseServer";

export type Game121PlayerStat = {
  player_id: string;
  name: string;
  games_played: number;
  games_won: number;
  best_checkout: number | null;
  lock_rate: number | null; // % of completed checkouts finished on Turn 1
};

export async function get121PlayerStats(): Promise<Game121PlayerStat[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data: sessions } = await supabase
    .from("game_121_sessions")
    .select("id, player_id, status, player:player_id(name)");
  if (!sessions?.length) return [];

  const { data: turns } = await supabase
    .from("game_121_turns")
    .select("session_id, checkout, turn_number, result")
    .in("result", ["locked", "progressed", "won"]);

  type Acc = {
    name: string;
    played: number;
    won: number;
    bestCheckout: number;
    completed: number;
    t1Finishes: number;
  };
  const map = new Map<string, Acc>();

  for (const s of sessions as any[]) {
    if (!s.player_id) continue;
    if (!map.has(s.player_id)) {
      map.set(s.player_id, {
        name: s.player?.name ?? "Unknown",
        played: 0,
        won: 0,
        bestCheckout: 0,
        completed: 0,
        t1Finishes: 0,
      });
    }
    const a = map.get(s.player_id)!;
    a.played += 1;
    if (s.status === "won") a.won += 1;
  }

  if (turns) {
    const sessionMap = new Map((sessions as any[]).map((s: any) => [s.id, s]));
    for (const t of turns as any[]) {
      const s = sessionMap.get(t.session_id) as any;
      if (!s?.player_id) continue;
      const a = map.get(s.player_id);
      if (!a) continue;
      a.completed += 1;
      if (t.checkout > a.bestCheckout) a.bestCheckout = t.checkout;
      if (t.turn_number === 1) a.t1Finishes += 1;
    }
  }

  return Array.from(map.entries())
    .map(([pid, a]) => ({
      player_id: pid,
      name: a.name,
      games_played: a.played,
      games_won: a.won,
      best_checkout: a.bestCheckout > 0 ? a.bestCheckout : null,
      lock_rate: a.completed > 0 ? Math.round((a.t1Finishes / a.completed) * 100) : null,
    }))
    .sort((a, b) => b.games_won - a.games_won || (b.best_checkout ?? 0) - (a.best_checkout ?? 0));
}
