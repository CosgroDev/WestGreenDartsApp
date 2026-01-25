import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const seasonId = url.searchParams.get("season");
  const format = url.searchParams.get("format") || "csv";

  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  let query = supabase.from("fixtures").select("id, season_id, starts_at, home, opponent, venue, notes").order("starts_at", { ascending: true });
  if (seasonId) query = query.eq("season_id", seasonId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === "json") {
    return NextResponse.json(data || []);
  }

  const header = "id,season_id,starts_at,home,opponent,venue,notes";
  const body = (data || [])
    .map((r) => [r.id, r.season_id, r.starts_at, r.home, r.opponent, r.venue ?? "", (r.notes ?? "").replace(/,/g, ";")].join(","))
    .join("\n");
  const csv = [header, body].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="fixtures.csv"`
    }
  });
}
