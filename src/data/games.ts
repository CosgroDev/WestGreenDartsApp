import { supabaseServer } from "@/lib/supabaseServer";

export type Game = {
  id: string;
  opponent_player: string;
  west_green_player_id: string | null;
  west_green_player_name?: string | null;
  west_green_starts: boolean;
  status: string;
  winner: string | null;
  created_at: string;
  darts_thrown?: number | null;
  deleted?: boolean;
  high_finish?: number | null;
  twenty_six?: number | null;
  three_dart_avg?: number | null;
  first_nine_avg?: number | null;
};

export async function getGamesForFixture(fixtureId: string): Promise<Game[]> {
  const supabase = supabaseServer();
  if (!supabase) return [];

  const { data: gamesRaw, error: gameErr } = await supabase
    .from("games")
    .select(
      "id, opponent_player, west_green_player_id, west_green_starts, status, winner, created_at, darts_thrown, deleted, players(name)"
    )
    .eq("fixture_id", fixtureId)
    .eq("deleted", false)
    .order("created_at", { ascending: true });

  if (gameErr || !gamesRaw) {
    console.warn("games fetch fallback", gameErr?.message);
    return [];
  }

  const gamesWithStats = await Promise.all(
    gamesRaw.map(async (g: any) => {
      const { data: events } = await supabase
        .from("scoring_events")
        .select("score, remaining_after, is_checkout, is_deleted, darts")
        .eq("game_id", g.id)
        .order("throw_index", { ascending: true })
        .limit(2000);

    const buckets = {
      sixty: 0,
      eighty: 0,
      hundred: 0,
      hundred_twenty: 0,
      hundred_forty: 0,
      hundred_seventy: 0,
      one_eighty: 0,
      twenty_six: 0
    };
    let highFinish: number | null = null;
    let totalScore = 0;
    let totalDarts = 0;
    let first9Score = 0;
    let first9Darts = 0;

      (events || []).forEach((e) => {
        if (e.is_deleted === true) return;
        const s = e.score;
        if (typeof s === "number") {
          if (s === 26) buckets.twenty_six++;
          if (s >= 60 && s < 80) buckets.sixty++;
          if (s >= 80 && s < 100) buckets.eighty++;
          if (s >= 100 && s < 120) buckets.hundred++;
          if (s >= 120 && s < 140) buckets.hundred_twenty++;
          if (s >= 140 && s < 170) buckets.hundred_forty++;
          if (s >= 170 && s < 180) buckets.hundred_seventy++;
          if (s === 180) buckets.one_eighty++;
          totalScore += s;
        }
        if (typeof e.darts === "number") totalDarts += e.darts;
        const isFinish = e.is_checkout === true || e.remaining_after === 0;
        if (isFinish) {
          const finish =
            typeof s === "number"
              ? s
              : typeof e.remaining_after === "number"
              ? 501 - e.remaining_after
              : null;
          if (finish !== null) {
            highFinish = highFinish === null ? finish : Math.max(highFinish, finish);
          }
        }
      });

      // first 9 darts: first 3 events (9 darts) if present
      const firstThree = (events || []).slice(0, 3);
      firstThree.forEach((e) => {
        if (typeof e.darts === "number") first9Darts += e.darts;
        if (typeof e.score === "number") first9Score += e.score;
      });
      const three_dart_avg = totalDarts > 0 ? (totalScore / totalDarts) * 3 : null;
      const first_nine_avg = first9Darts > 0 ? (first9Score / first9Darts) * 3 : null;

      return {
        ...g,
        west_green_player_name: g.players?.name,
        high_finish: highFinish,
        twenty_six: buckets.twenty_six,
        three_dart_avg,
        first_nine_avg
      } as Game;
    })
  );

  return gamesWithStats;
}
