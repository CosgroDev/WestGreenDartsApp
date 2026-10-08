import { allRows } from "@/lib/database";
import { supabaseServer } from "@/lib/supabaseServer";
import { groupFixtureMatches } from "@/lib/fixtureState";

type ProfileGame = { id: string; match_id: string | null; fixture_id: string; west_green_player_id: string; opponent_player: string; status: string; winner: string | null; created_at: string; fixtures: { opponent: string; starts_at: string; season_id: string } };
export async function getProfileMatches(playerId: string, seasonId?: string) {
  const db = await supabaseServer();
  if (!db) return [];
  const { data } = await allRows<ProfileGame>(() => {
    let query = db.from("games").select("id,match_id,fixture_id,west_green_player_id,opponent_player,status,winner,created_at,fixtures!inner(opponent,starts_at,season_id)")
      .eq("deleted", false).eq("west_green_player_id", playerId).order("created_at").order("id");
    if (seasonId) query = query.eq("fixtures.season_id", seasonId);
    return query;
  });
  return groupFixtureMatches(data).sort((a, b) => b.games[0].fixtures.starts_at.localeCompare(a.games[0].fixtures.starts_at));
}

export type ProfilePractice = { id: string; mode: string; date: string; status: string; href: string; detail: string };
export async function getProfilePractice(playerId: string): Promise<ProfilePractice[]> {
  const db = await supabaseServer();
  if (!db) return [];
  const [x01, game121, checkout, doubles] = await Promise.all([
    allRows(() => db.from("practice_sessions").select("id,created_at,status,start_score,legs_to_play").or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`).order("id")),
    allRows(() => db.from("game_121_sessions").select("id,created_at,status,current_checkout").eq("player_id", playerId).order("id")),
    allRows(() => db.from("checkout_practice_sessions").select("id,created_at,status,attempt_index").eq("player_id", playerId).order("id")),
    allRows(() => db.from("doubles_practice_players").select("id,session_id,score,doubles_practice_sessions!inner(id,created_at,status)").eq("player_id", playerId).order("id"))
  ]);
  return [
    ...x01.data.map(s => ({ id: s.id, mode: "X01", date: s.created_at, status: s.status, href: `/practice/scoring?session=${s.id}`, detail: `${s.start_score} · ${s.legs_to_play} legs` })),
    ...game121.data.map(s => ({ id: s.id, mode: "121", date: s.created_at, status: s.status, href: `/practice/121/scoring?session=${s.id}`, detail: `Checkout ${s.current_checkout}` })),
    ...checkout.data.map(s => ({ id: s.id, mode: "Random Checkout", date: s.created_at, status: s.status, href: `/practice/checkout/scoring?session=${s.id}`, detail: `${s.attempt_index} attempts` })),
    ...doubles.data.map(s => ({ id: s.session_id, mode: "Doubles Switch", date: s.doubles_practice_sessions.created_at, status: s.doubles_practice_sessions.status, href: `/practice/doubles/scoring?session=${s.session_id}`, detail: `${s.score} points` }))
  ].sort((a, b) => b.date.localeCompare(a.date));
}
