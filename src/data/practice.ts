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

export type PracticePlayerStat = {
  player_id: string;
  name: string;
  legs_played: number;
  legs_won: number;
  three_dart_avg: number | null;
  first_nine_avg: number | null;
  twenty_six: number;
  one_eighty: number;
  high_finish: number | null;
};

export async function getPracticePlayerStats(): Promise<PracticePlayerStat[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data: sessions } = await supabase
    .from("practice_sessions")
    .select("id, player_a_id, player_b_id, player_a:player_a_id(name), player_b:player_b_id(name)");
  if (!sessions?.length) return [];

  const { data: games } = await supabase
    .from("practice_games")
    .select("id, session_id, winner")
    .eq("status", "completed");
  if (!games?.length) return [];

  const sessionMap = new Map(sessions.map((s: any) => [s.id, s]));

  // game_id → { player_a: player_id | null, player_b: player_id | null }
  const gameToPlayers = new Map<string, { player_a: string | null; player_b: string | null; a_name: string; b_name: string }>();
  for (const g of games as any[]) {
    const s = sessionMap.get(g.session_id) as any;
    if (!s) continue;
    gameToPlayers.set(g.id, {
      player_a: s.player_a_id ?? null,
      player_b: s.player_b_id ?? null,
      a_name: s.player_a?.name ?? "Player A",
      b_name: s.player_b?.name ?? "Player B",
    });
  }

  type Acc = {
    name: string;
    played: number; won: number;
    totalScore: number; totalDarts: number;
    first9Score: number; first9Darts: number;
    t26: number; t180: number;
    high_finish: number | null;
  };
  const perPlayer = new Map<string, Acc>();
  const getOrCreate = (pid: string, name: string): Acc => {
    if (!perPlayer.has(pid)) perPlayer.set(pid, { name, played: 0, won: 0, totalScore: 0, totalDarts: 0, first9Score: 0, first9Darts: 0, t26: 0, t180: 0, high_finish: null });
    return perPlayer.get(pid)!;
  };

  for (const g of games as any[]) {
    const gp = gameToPlayers.get(g.id);
    if (!gp) continue;
    if (gp.player_a) { const e = getOrCreate(gp.player_a, gp.a_name); e.played += 1; if (g.winner === "player_a") e.won += 1; }
    if (gp.player_b) { const e = getOrCreate(gp.player_b, gp.b_name); e.played += 1; if (g.winner === "player_b") e.won += 1; }
  }

  const allGameIds = games.map((g: any) => g.id);
  const { data: events } = await supabase
    .from("practice_events")
    .select("game_id, thrower, score, darts, is_checkout")
    .in("game_id", allGameIds)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });

  if (events) {
    const first3Count = new Map<string, number>();
    for (const e of events as any[]) {
      const gp = gameToPlayers.get(e.game_id);
      if (!gp) continue;
      const pid = e.thrower === "player_a" ? gp.player_a : gp.player_b;
      if (!pid) continue;
      const acc = perPlayer.get(pid);
      if (!acc) continue;
      if (typeof e.score === "number") acc.totalScore += e.score;
      if (typeof e.darts === "number") acc.totalDarts += e.darts;
      if (e.score === 26) acc.t26 += 1;
      if (e.score === 180) acc.t180 += 1;
      if (e.is_checkout && typeof e.score === "number") {
        acc.high_finish = acc.high_finish === null ? e.score : Math.max(acc.high_finish, e.score);
      }
      const f9key = `${e.game_id}:${e.thrower}`;
      const cnt = first3Count.get(f9key) ?? 0;
      if (cnt < 3) {
        acc.first9Score += e.score ?? 0;
        acc.first9Darts += e.darts ?? 3;
        first3Count.set(f9key, cnt + 1);
      }
    }
  }

  const result: PracticePlayerStat[] = [];
  for (const [pid, acc] of perPlayer.entries()) {
    result.push({
      player_id: pid,
      name: acc.name,
      legs_played: acc.played,
      legs_won: acc.won,
      three_dart_avg: acc.totalDarts > 0 ? (acc.totalScore / acc.totalDarts) * 3 : null,
      first_nine_avg: acc.first9Darts > 0 ? (acc.first9Score / acc.first9Darts) * 3 : null,
      twenty_six: acc.t26,
      one_eighty: acc.t180,
      high_finish: acc.high_finish,
    });
  }
  result.sort((a, b) => b.legs_won - a.legs_won || (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  return result;
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
