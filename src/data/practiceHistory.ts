import { allRows, rowsForIds } from "@/lib/database";
import { supabaseServer } from "@/lib/supabaseServer";

export type PracticeMode = "x01" | "121" | "doubles" | "checkout";
export type SavedPractice = {
  id: string;
  mode: PracticeMode;
  title: string;
  detail: string;
  playerIds: string[];
  players: string;
  status: string;
  updatedAt: string;
  href: string;
};

const modes = {
  x01: { table: "practice_sessions", events: "practice_events", title: "X01", path: "/practice/scoring", select: "id,status,created_at,completed_at,start_score,legs_to_play,solo_mode,player_a_id,player_b_id,player_a:player_a_id(name),player_b:player_b_id(name)" },
  "121": { table: "game_121_sessions", events: "game_121_turns", title: "121 Challenge", path: "/practice/121/scoring", select: "id,status,created_at,completed_at,player_id,current_checkout,remaining,current_turn,player:player_id(name)" },
  doubles: { table: "doubles_practice_sessions", events: "doubles_practice_attempts", title: "Doubles Switch", path: "/practice/doubles/scoring", select: "id,status,created_at,completed_at,players:doubles_practice_players(player_id,throw_order,player:player_id(name))" },
  checkout: { table: "checkout_practice_sessions", events: "checkout_practice_attempts", title: "Random Checkout", path: "/practice/checkout/scoring", select: "id,status,created_at,completed_at,player_id,current_target,player:player_id(name)" },
} as const;

// Active games are never limited by their start date. Results are bounded independently.
export async function getSavedPractice(mode: PracticeMode): Promise<SavedPractice[]> {
  const db = await supabaseServer();
  if (!db || !process.env.TEAM_ID) throw new Error("Practice storage is not configured.");
  const config = modes[mode];
  const [active, recent] = await Promise.all([
    allRows(() => db.from(config.table).select(config.select).eq("team_id", process.env.TEAM_ID)
      .eq("status", "in_progress").order("created_at", { ascending: false }).order("id", { ascending: false })),
    db.from(config.table).select(config.select).eq("team_id", process.env.TEAM_ID)
      .neq("status", "in_progress").order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).limit(20),
  ]);
  if (recent.error) throw new Error("Could not load practice results.");
  const sessions = [...active.data, ...(recent.data ?? [])] as any[];
  const updated = new Map<string, string>();
  const events = await rowsForIds<{ session_id: string; created_at: string }>(
    sessions.map(s => s.id), ids => db.from(config.events).select("session_id,created_at")
      .in("session_id", ids).order("id", { ascending: true })
  );
  for (const event of events) {
    if (!updated.has(event.session_id) || event.created_at > updated.get(event.session_id)!) updated.set(event.session_id, event.created_at);
  }
  return sessions.map(s => {
    const doublesPlayers = [...(s.players ?? [])].sort((a, b) => a.throw_order - b.throw_order);
    const playerIds = mode === "x01" ? [s.player_a_id, s.player_b_id] : mode === "doubles" ? doublesPlayers.map(p => p.player_id) : [s.player_id];
    const players = mode === "x01" ? s.solo_mode ? `${s.player_a?.name ?? "Guest"} · Solo` : `${s.player_a?.name ?? "Guest A"} vs ${s.player_b?.name ?? "Guest B"}`
      : mode === "doubles" ? doublesPlayers.map(p => p.player?.name ?? "Former player").join(", ") : s.player?.name ?? "Former player";
    const detail = mode === "x01" ? `${s.start_score} · ${s.legs_to_play} leg${s.legs_to_play === 1 ? "" : "s"}`
      : mode === "121" ? `Target ${s.current_checkout} · ${s.remaining} left · Visit ${s.current_turn}/3`
      : mode === "checkout" ? `Target ${s.current_target}` : `${doublesPlayers.length} player${doublesPlayers.length === 1 ? "" : "s"}`;
    return { id: s.id, mode, title: config.title, detail, playerIds: playerIds.filter(Boolean), players,
      status: s.status, updatedAt: s.completed_at ?? updated.get(s.id) ?? s.created_at,
      href: `${config.path}?session=${encodeURIComponent(s.id)}` };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
