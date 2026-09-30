import { buildLeagueContext } from "@/lib/liveLeague";
import { getCachedLiveLeagueData } from "./liveLeague";
export async function getCachedLeagueContext(force = false) {
  return buildLeagueContext(await getCachedLiveLeagueData(force));
}
