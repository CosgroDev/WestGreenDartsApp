import { unstable_cache } from "next/cache";
import { getWestGreenLeagueContext } from "@/lib/liveLeague";

// Public source data only; signed application sessions are checked by the route.
export const getCachedLeagueContext = unstable_cache(
  getWestGreenLeagueContext, ["west-green-league-context-v1"], { revalidate: 300 }
);
