import { supabaseServer } from "@/lib/supabaseServer";

export type CheckoutPlayerStat = {
  player_id: string;
  name: string;
  attempts: number;
  checkouts: number;
  checkout_pct: number | null;
  avg_darts: number | null; // average darts on successful finishes
};

export async function getCheckoutPlayerStats(): Promise<CheckoutPlayerStat[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data: sessions } = await supabase
    .from("checkout_practice_sessions")
    .select("id, player_id, player:player_id(name)")
    .not("player_id", "is", null);
  if (!sessions?.length) return [];

  const sessionIds = (sessions as any[]).map((s) => s.id);
  const { data: attempts } = await supabase
    .from("checkout_practice_attempts")
    .select("session_id, darts_used, success")
    .in("session_id", sessionIds);
  if (!attempts?.length) return [];

  const sessionPlayer = new Map((sessions as any[]).map((s) => [s.id, s]));

  type Acc = { name: string; attempts: number; checkouts: number; dartsTotal: number };
  const map = new Map<string, Acc>();

  for (const at of attempts as any[]) {
    const s = sessionPlayer.get(at.session_id);
    if (!s?.player_id) continue;
    if (!map.has(s.player_id)) {
      map.set(s.player_id, { name: s.player?.name ?? "Unknown", attempts: 0, checkouts: 0, dartsTotal: 0 });
    }
    const a = map.get(s.player_id)!;
    a.attempts += 1;
    if (at.success) {
      a.checkouts += 1;
      a.dartsTotal += at.darts_used;
    }
  }

  return Array.from(map.entries())
    .map(([pid, a]) => ({
      player_id: pid,
      name: a.name,
      attempts: a.attempts,
      checkouts: a.checkouts,
      checkout_pct: a.attempts > 0 ? Math.round((a.checkouts / a.attempts) * 100) : null,
      avg_darts: a.checkouts > 0 ? Math.round((a.dartsTotal / a.checkouts) * 10) / 10 : null,
    }))
    .sort((x, y) => (y.checkout_pct ?? 0) - (x.checkout_pct ?? 0));
}
