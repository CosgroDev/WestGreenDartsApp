import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixture");
  const gameId = url.searchParams.get("game");
  const format = url.searchParams.get("format") || "csv";

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let query = supabase
    .from("scoring_events")
    .select("game_id, score, darts, remaining_after, is_bust, is_checkout, created_at, games(fixture_id)");

  if (gameId) {
    query = query.eq("game_id", gameId);
  } else if (fixtureId) {
    query = query.eq("games.fixture_id", fixtureId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  if (format === "json") {
    return NextResponse.json(rows);
  }

  const header = "game_id,fixture_id,score,darts,remaining_after,is_bust,is_checkout,created_at";
  const body = rows
    .map((r: any) =>
      [r.game_id, r.games?.fixture_id ?? "", r.score, r.darts, r.remaining_after, r.is_bust, r.is_checkout, r.created_at].join(",")
    )
    .join("\n");
  const csv = [header, body].join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="scoring_events.csv"`
    }
  });
}
