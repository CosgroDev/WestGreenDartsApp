import { requireSession } from "@/lib/auth";
import { getCachedLeagueInsights } from "@/data/leagueInsights";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  await requireSession();
  try {
    return Response.json(await getCachedLeagueInsights(new URL(request.url).searchParams.get("refresh") === "1"), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "League insights are temporarily unavailable" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
