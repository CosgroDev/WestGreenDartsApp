import { buildLeagueInsights } from "@/lib/leagueInsights";
import { getCachedLiveLeagueData } from "./liveLeague";
export async function getCachedLeagueInsights(force = false) {
  return buildLeagueInsights(await getCachedLiveLeagueData(force));
}
