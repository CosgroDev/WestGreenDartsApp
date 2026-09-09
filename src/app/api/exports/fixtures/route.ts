import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { allRows } from "@/lib/database";
import { csv } from "@/lib/csv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  const db = await supabaseServer();
  if (!db) return NextResponse.json({error: "Database not configured"}, {status: 503});
  const {data} = await allRows(() => {
    let q = db.from("fixtures").select("id, season_id, starts_at, home, opponent, venue, notes").eq("team_id", process.env.TEAM_ID).order("starts_at").order("id");
    if (season) q = q.eq("season_id", season);
    return q;
  });
  if (url.searchParams.get("format") === "json") return NextResponse.json(data);
  const fields = ["id","season_id","starts_at","home","opponent","venue","notes"];
  return new NextResponse(csv([fields, ...data.map(r => fields.map(k => r[k]))]), {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="fixtures.csv"'}});
}
