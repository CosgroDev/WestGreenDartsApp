import { unstable_cache } from "next/cache";
import { buildLeagueInsights, type LeagueInsights } from "@/lib/leagueInsights";
import { getCachedLiveLeagueData } from "./liveLeague";
const globalCache = globalThis as typeof globalThis & {
  __westGreenDerivedInsights?: { key: string; promise: Promise<LeagueInsights> };
};
export async function getCachedLeagueInsights(force = false) {
  const data = await getCachedLiveLeagueData(force);
  const key = "league-insights-model-v2:" + data.checkedAt;
  if (globalCache.__westGreenDerivedInsights?.key === key) return globalCache.__westGreenDerivedInsights.promise;
  // Raw-data refresh controls when this version changes. Explicit model version
  // prevents an old calculation surviving a deployment that changes the model.
  const build = async () => buildLeagueInsights(data);
  const read = unstable_cache(build.bind(null), [key], { revalidate: 604800 });
  const promise = read();
  globalCache.__westGreenDerivedInsights = { key, promise };
  try { return await promise; } catch (error) {
    if (globalCache.__westGreenDerivedInsights?.promise === promise) delete globalCache.__westGreenDerivedInsights;
    throw error;
  }
}
