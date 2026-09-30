import { requireSession } from "@/lib/auth";
import { getCachedLeagueContext } from "@/data/leagueSnapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSession();
  try {
    return Response.json(await getCachedLeagueContext(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Live league standings are temporarily unavailable" }, {
      status: 502, headers: { "Cache-Control": "private, no-store" }
    });
  }
}
