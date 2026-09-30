import { unstable_cache } from "next/cache";
import { getLeagueInsights } from "@/lib/leagueInsights";
export const getCachedLeagueInsights = unstable_cache(getLeagueInsights,
  ["league-insights-v1"], { revalidate: 300 });
