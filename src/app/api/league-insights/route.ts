import { requireSession } from "@/lib/auth";
import { getCachedLeagueInsights } from "@/data/leagueInsights";
export const dynamic = "force-dynamic";
export async function GET() {
  await requireSession();
  try {
    return Response.json(await getCachedLeagueInsights(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "League insights are temporarily unavailable" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
