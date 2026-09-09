import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { allRows } from "@/lib/database";
import { csv } from "@/lib/csv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fixture = url.searchParams.get("fixture");
  const game = url.searchParams.get("game");
  const db = await supabaseServer();
  if (!db) return NextResponse.json({error: "Database not configured"}, {status: 503});
  const {data} = await allRows(() => {
    let q = db.from("scoring_events").select("game_id, thrower, score, darts, remaining_after, is_bust, is_checkout, created_at, games!inner(fixture_id, deleted)")
      .eq("is_deleted", false).eq("games.deleted", false).eq("team_id", process.env.TEAM_ID)
      .order("created_at").order("id");
    if (game) q = q.eq("game_id", game);
    else if (fixture) q = q.eq("games.fixture_id", fixture);
    return q;
  });
  if (url.searchParams.get("format") === "json") return NextResponse.json(data);
  return new NextResponse(csv([
    ["game_id","fixture_id","thrower","score","darts","remaining_after","is_bust","is_checkout","created_at"],
    ...data.map(r => [r.game_id,r.games?.fixture_id,r.thrower,r.score,r.darts,r.remaining_after,r.is_bust,r.is_checkout,r.created_at])
  ]), {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="scoring_events.csv"'}});
}
