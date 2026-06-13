import { supabaseServer } from "@/lib/supabaseServer";
import { DOUBLES_SEQUENCE } from "@/lib/doublesPractice";

export type DoublesPlayerStat = {
  player_id: string;
  name: string;
  games_played: number;
  games_won: number;
  total_attempts: number;
  double_pct: number | null; // % of visits where the double was hit
  first_dart_pct: number | null; // % of visits hit with the first dart
  weakest_doubles: number[]; // up to 3 doubles with the lowest hit rate (min attempts)
};

export async function getDoublesPlayerStats(): Promise<DoublesPlayerStat[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  // Only completed games count toward stats.
  const { data: sessions } = await supabase
    .from("doubles_practice_sessions")
    .select("id")
    .eq("status", "completed");
  if (!sessions?.length) return [];

  const sessionIds = (sessions as any[]).map((s) => s.id);

  const { data: players } = await supabase
    .from("doubles_practice_players")
    .select("id, session_id, player_id, score, player:player_id(name)")
    .in("session_id", sessionIds);
  if (!players?.length) return [];

  const playerRowIds = (players as any[]).map((p) => p.id);
  const { data: attempts } = await supabase
    .from("doubles_practice_attempts")
    .select("session_player_id, target, dart_hit")
    .in("session_player_id", playerRowIds);

  type Acc = {
    name: string;
    played: number;
    won: number;
    attempts: number;
    hits: number;
    firstDart: number;
    perDouble: Map<number, { attempts: number; hits: number }>;
  };
  const map = new Map<string, Acc>();
  const rowToPlayer = new Map<string, string>(); // player row id -> player_id

  // Group player rows by their underlying player, and decide each game's winner.
  const bySession = new Map<string, any[]>();
  for (const row of players as any[]) {
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id)!.push(row);
    if (!row.player_id) continue;
    rowToPlayer.set(row.id, row.player_id);
    if (!map.has(row.player_id)) {
      map.set(row.player_id, {
        name: row.player?.name ?? "Unknown",
        played: 0,
        won: 0,
        attempts: 0,
        hits: 0,
        firstDart: 0,
        perDouble: new Map(),
      });
    }
    map.get(row.player_id)!.played += 1;
  }

  // Winner per session = highest score (ties → all credited as a win).
  for (const rows of bySession.values()) {
    const best = Math.max(...rows.map((r) => r.score ?? 0));
    if (best <= 0) continue;
    for (const r of rows) {
      if ((r.score ?? 0) === best && r.player_id) {
        const a = map.get(r.player_id);
        if (a) a.won += 1;
      }
    }
  }

  for (const at of (attempts ?? []) as any[]) {
    const playerId = rowToPlayer.get(at.session_player_id);
    if (!playerId) continue;
    const a = map.get(playerId);
    if (!a) continue;
    a.attempts += 1;
    const hit = at.dart_hit > 0;
    if (hit) a.hits += 1;
    if (at.dart_hit === 1) a.firstDart += 1;

    const pd = a.perDouble.get(at.target) ?? { attempts: 0, hits: 0 };
    pd.attempts += 1;
    if (hit) pd.hits += 1;
    a.perDouble.set(at.target, pd);
  }

  return Array.from(map.entries())
    .map(([pid, a]) => {
      const weakest = Array.from(a.perDouble.entries())
        .filter(([, v]) => v.attempts >= 3)
        .sort((x, y) => x[1].hits / x[1].attempts - y[1].hits / y[1].attempts)
        .slice(0, 3)
        .map(([d]) => d)
        // present in the canonical rotation order for familiarity
        .sort((x, y) => DOUBLES_SEQUENCE.indexOf(x) - DOUBLES_SEQUENCE.indexOf(y));

      return {
        player_id: pid,
        name: a.name,
        games_played: a.played,
        games_won: a.won,
        total_attempts: a.attempts,
        double_pct: a.attempts > 0 ? Math.round((a.hits / a.attempts) * 100) : null,
        first_dart_pct: a.attempts > 0 ? Math.round((a.firstDart / a.attempts) * 100) : null,
        weakest_doubles: weakest,
      };
    })
    .sort((x, y) => (y.double_pct ?? 0) - (x.double_pct ?? 0) || y.games_won - x.games_won);
}
