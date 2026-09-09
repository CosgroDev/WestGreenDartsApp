import { NextResponse } from "next/server";
import { getPlayerCards } from "@/data/stats";
import { csv } from "@/lib/csv";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await getPlayerCards(url.searchParams.get("season") || undefined, true);
  if (url.searchParams.get("format") === "json") return NextResponse.json(data);
  const rows = data.map(r => [r.player_id,r.name,r.legs_played,r.legs_won,r.three_dart_avg,r.checkout_pct,r.high_finish]);
  return new NextResponse(csv([["player_id","name","legs_played","legs_won","three_dart_avg","checkout_pct","high_finish"],...rows]), {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="player_stats.csv"'}});
}
