import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "csv";

  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data, error } = await supabase
    .from("player_stats_view")
    .select("player_id, name, legs_played, legs_won, three_dart_avg, checkout_pct, high_finish");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === "json") {
    return NextResponse.json(data || []);
  }

  const header = "player_id,name,legs_played,legs_won,three_dart_avg,checkout_pct,high_finish";
  const body = (data || [])
    .map((r) =>
      [
        r.player_id,
        (r.name || "").replace(/,/g, ";"),
        r.legs_played ?? 0,
        r.legs_won ?? 0,
        r.three_dart_avg ?? "",
        r.checkout_pct ?? "",
        r.high_finish ?? ""
      ].join(",")
    )
    .join("\n");
  const csv = [header, body].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="player_stats.csv"`
    }
  });
}
