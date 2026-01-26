import { supabaseServer } from "@/lib/supabaseServer";

export type PracticeSession = {
  id: string;
  start_score: number;
  legs_to_play: number;
  status: string;
  player_a_id: string | null;
  player_b_id: string | null;
  player_a_name?: string | null;
  player_b_name?: string | null;
  created_at: string;
  completed_at: string | null;
};

export type PracticeGame = {
  id: string;
  session_id: string;
  leg_index: number;
  winner: string | null;
  darts_thrown: number | null;
  high_finish: number | null;
  status: string;
  completed_at: string | null;
};

export async function createPracticeSession(params: {
  playerA: string | null;
  playerB: string | null;
  startScore: number;
  legsToPlay: number;
}): Promise<{ ok: boolean; sessionId?: string; gameId?: string; message?: string }> {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({
      team_id: process.env.TEAM_ID,
      player_a_id: params.playerA,
      player_b_id: params.playerB,
      start_score: params.startScore,
      legs_to_play: params.legsToPlay
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: error?.message || "Failed to create session" };

  const { data: game, error: gameErr } = await supabase
    .from("practice_games")
    .insert({ session_id: data.id, leg_index: 1, status: "in_progress" })
    .select("id")
    .single();

  if (gameErr || !game) return { ok: false, message: gameErr?.message || "Failed to create first leg" };

  return { ok: true, sessionId: data.id, gameId: game.id };
}

export async function getPracticeSessions(): Promise<PracticeSession[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("practice_sessions")
    .select(
      `id, start_score, legs_to_play, status, created_at, completed_at,
       player_a_id, player_b_id,
       player_a:player_a_id(name),
       player_b:player_b_id(name)`
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  return data.map((s: any) => ({
    id: s.id,
    start_score: s.start_score,
    legs_to_play: s.legs_to_play,
    status: s.status,
    player_a_id: s.player_a_id,
    player_b_id: s.player_b_id,
    player_a_name: s.player_a?.name ?? null,
    player_b_name: s.player_b?.name ?? null,
    created_at: s.created_at,
    completed_at: s.completed_at
  }));
}

export async function getPracticeGame(id: string) {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("practice_games")
    .select(
      `id, session_id, leg_index, winner, darts_thrown, high_finish, status, completed_at,
       practice_sessions(start_score, player_a_id, player_b_id,
         player_a:player_a_id(name), player_b:player_b_id(name), legs_to_play, status)`
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  return data;
}
